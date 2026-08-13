import 'reflect-metadata'

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import multipart from '@fastify/multipart'
import helmet from '@fastify/helmet'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { assertRosterValid, AGENT_IDS, assertCatalogFresh } from '@marketing-os/ai-core'
import { assertFeatureRegistryValid } from '@marketing-os/contracts'
import {
  assertRowLevelSecurityEnforced,
  assertTenantRegistryComplete,
  createAdminClient,
  syncRegistries,
  TENANT_SCOPED_MODELS,
} from '@marketing-os/database'
import { createLogger } from '@marketing-os/observability'

import { AppModule } from './app.module.js'
import { PlatformAuthService } from './modules/platform/platform-auth.service.js'
import { LEGACY_VIEW_AS_HEADER, VIEW_AS_HEADER } from './modules/platform/view-as.service.js'
import { AuthService } from './modules/auth/auth.service.js'
import { mountBetterAuth } from './modules/auth/fastify-mount.js'
import { corsOrigins, loadEnv, swaggerEnabled } from './config/env.js'
import { assertPermissionMatrixValid } from './common/rbac/permissions.js'
import { registerRateLimit } from './infrastructure/rate-limit.js'
import { MAX_UPLOAD_BYTES } from './modules/uploads/uploads.constants.js'
import { createRedis } from './infrastructure/redis.js'

/**
 * API bootstrap.
 *
 * Ordering is deliberate: everything that can be checked without serving traffic
 * is checked *before* the server binds a port. A process that starts and then
 * fails on the first request looks healthy to an orchestrator, which will happily
 * route traffic to it and mark the deploy successful.
 */

function toTableName(model: string): string {
  return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * Applies pending database migrations before anything else inspects the schema.
 *
 * The hosting build step only installs and generates the client — it never runs
 * migrations — so the booting service is the one place they reliably execute.
 * `prisma migrate deploy` is idempotent and uses the owner connection via the
 * datasource's directUrl. Set MIGRATE_ON_BOOT=0 when a separate deploy step
 * owns migrations.
 */
function applyMigrations(logger: Logger): void {
  if (process.env['MIGRATE_ON_BOOT'] === '0') {
    logger.warn('MIGRATE_ON_BOOT=0 — skipping migrations; a deploy step must own them')
    return
  }
  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
  logger.log('Applying database migrations…')
  execSync('pnpm --filter @marketing-os/database exec prisma migrate deploy', {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  logger.log('Database migrations applied')
}

/**
 * Preflight checks. Every one of these is fatal.
 *
 * Each guards a failure that is silent in production:
 *   · RLS not enforced — the app works perfectly and has no tenant isolation.
 *   · Registry drift — a new model's queries run unscoped.
 *   · Broken permission matrix — a declared permission nothing can grant, or a
 *     role that is not a superset of the one below it.
 *   · Invalid agent roster — an undeclared prompt variable reaches a customer
 *     deliverable as the literal string `{{brandVoice}}`.
 *   · Stale pricing — budgets are enforced against rates that no longer hold.
 */
async function runPreflight(
  databaseUrl: string,
  directDatabaseUrl: string | undefined,
  logger: Logger,
): Promise<void> {
  assertPermissionMatrixValid()
  logger.log('Permission matrix valid')

  assertRosterValid(AGENT_IDS)
  logger.log(`Agent roster valid (${String(AGENT_IDS.length)} agents)`)

  assertCatalogFresh(120)
  logger.log('Model pricing catalog is current')

  // A broken feature registry — an unknown dependency, a duplicate nav path, a
  // default-enabled feature whose dependency is not — must fail the deploy, not
  // surface when an organisation's sidebar renders wrong.
  assertFeatureRegistryValid()
  logger.log('Feature registry valid')

  const probe = createAdminClient(databaseUrl)
  try {
    await assertRowLevelSecurityEnforced(probe)
    logger.log('Row-level security is enforced for this connection')

    await assertTenantRegistryComplete(probe, TENANT_SCOPED_MODELS.map(toTableName))
    logger.log(`Tenant registry matches the schema (${String(TENANT_SCOPED_MODELS.length)} models)`)
  } finally {
    await probe.$disconnect()
  }

  // Sync the code feature and plan registries into their tables. Idempotent, so
  // concurrent instances racing is harmless. Prefers the owner connection: the
  // registry tables are platform-global reference data, and the application role
  // has no business rewriting plans at runtime. Skipped (with a warning) when no
  // owner URL is configured — a separate deploy step then owns the sync.
  if (directDatabaseUrl !== undefined) {
    const owner = createAdminClient(directDatabaseUrl)
    try {
      await syncRegistries(owner)
      logger.log('Feature and plan registries synced')
    } finally {
      await owner.$disconnect()
    }
  } else {
    logger.warn('DIRECT_DATABASE_URL not set — skipping registry sync; run it as a deploy step')
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnv()

  const appLogger = createLogger({
    service: 'api',
    environment: env.NODE_ENV,
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  })

  const bootLogger = new Logger('Bootstrap')

  applyMigrations(bootLogger)

  await runPreflight(env.DATABASE_URL, env.DIRECT_DATABASE_URL, bootLogger)

  const adapter = new FastifyAdapter({
    // Trust the proxy: Render and Railway terminate TLS at their edge. Without
    // this the app sees the proxy's address for every request, which makes
    // per-client rate limiting and abuse investigation meaningless.
    trustProxy: true,
    // Fastify generates a request id; it becomes the traceId on every error
    // response and every log line, so a customer's screenshot is enough to find
    // the exact request.
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 5 * 1024 * 1024,
  })

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    // Nest's own logs go through pino, so application and framework logs share
    // one structured format rather than needing two parsers.
    logger: ['error', 'warn', 'log'],
    // Capture the raw request body so inbound webhooks (Meta / WhatsApp) can verify
    // their X-Hub-Signature-256 against the exact bytes that were signed.
    rawBody: true,
  })

  // File uploads. Registered with a hard byte ceiling rather than relying on the
  // route to check afterwards — by the time a handler runs, an unbounded upload
  // has already been buffered, which is the whole attack.
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8 },
  })

  await app.register(helmet, {
    // The API serves JSON, never HTML, so a restrictive CSP costs nothing and
    // closes off content-sniffing and framing entirely.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })

  // Registered before CORS so an abusive caller is rejected as early as possible,
  // and before routing so it covers every route including ones added later.
  const limiterRedis = createRedis(env, 'general')
  await registerRateLimit(app, limiterRedis, env)

  const origins = corsOrigins(env)
  app.enableCors({
    // An explicit allowlist, and no wildcard even in development. The previous
    // implementation allowed every *.vercel.app origin alongside credentials,
    // which meant any site hosted on Vercel could call the API with a user's
    // session.
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // Every custom header the client actually sends must appear here, or the
    // browser blocks the request during preflight — before it is sent, with no
    // response and no status code. That failure surfaces as a bare network
    // error, which is indistinguishable from the API being down and sends you
    // looking in entirely the wrong place.
    //
    // The view-as header was the omission: it is set on every tenant call once an
    // operator enters a workspace read-only, so a single view-as visit made the
    // whole app unreachable in that tab until the tab was closed.
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
      VIEW_AS_HEADER,
      LEGACY_VIEW_AS_HEADER,
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 86_400,
  })

  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] })

  // Tenant authentication endpoints. Mounted on the raw Fastify instance, outside
  // the Nest routing pipeline and the /v1 prefix, so reaching them never requires
  // an existing session (they are how one is obtained). Better Auth serves the
  // whole credential lifecycle under /api/auth/*.
  mountBetterAuth(app.getHttpAdapter().getInstance(), app.get(AuthService), appLogger, limiterRedis)

  // No global ValidationPipe. Validation is Zod at the controller boundary, and
  // the schemas in @marketing-os/contracts are the single source of truth for request
  // shapes, response shapes, inferred types and the OpenAPI document.
  //
  // Nest's ValidationPipe would mean a second validation system built on
  // class-validator decorators — two places to declare every field, which is
  // exactly how a validator and a type drift apart. Zod's `.strict()` already
  // provides what `whitelist` + `forbidNonWhitelisted` do: an unexpected property
  // is rejected rather than silently dropped, so a client typo surfaces instead
  // of becoming a no-op the caller believes succeeded.

  // Shut down cleanly: finish in-flight requests, close the database pool and
  // Redis connections. Without this a rolling deploy drops requests mid-flight.
  app.enableShutdownHooks()

  if (swaggerEnabled(env)) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Marketing OS')
        .setDescription(
          'Multi-tenant AI marketing platform. Every endpoint is organisation-scoped: the ' +
            'tenant is derived from the authenticated session, never from a request parameter.',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'session')
        .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'apiKey')
        .build(),
    )

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
    bootLogger.log(`OpenAPI served at /docs`)
  }

  // Seed the first operator account. The console has no sign-up route on
  // purpose, so without this the PlatformAdmin table stays empty and nobody can
  // ever reach /platform. Idempotent: existing emails are left untouched.
  if (env.PLATFORM_BOOTSTRAP_EMAIL && env.PLATFORM_BOOTSTRAP_PASSWORD) {
    try {
      const platformAuth = app.get(PlatformAuthService)
      await platformAuth.ensureBootstrapAdmin(
        env.PLATFORM_BOOTSTRAP_EMAIL,
        env.PLATFORM_BOOTSTRAP_PASSWORD,
        env.PLATFORM_BOOTSTRAP_NAME,
      )
      bootLogger.log(`Operator account ready: ${env.PLATFORM_BOOTSTRAP_EMAIL}`)
    } catch (error) {
      // Never block boot on this — the tenant app must still serve.
      bootLogger.error(
        `Operator bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Prefer the platform-assigned port. Render/Railway/Heroku inject $PORT and
  // route external traffic to whatever the app binds; honouring it means the app
  // is detected without any per-host port configuration, while local dev keeps the
  // validated API_PORT default.
  const listenPort = process.env['PORT'] ? Number.parseInt(process.env['PORT'], 10) : env.API_PORT

  await app.listen({ port: listenPort, host: env.API_HOST })

  // Close Redis on shutdown alongside the HTTP server and database pool.
  app.enableShutdownHooks()
  process.once('SIGTERM', () => {
    void limiterRedis.quit()
  })

  appLogger.info(
    {
      port: listenPort,
      environment: env.NODE_ENV,
      corsOrigins: origins,
      swagger: swaggerEnabled(env),
    },
    'API listening',
  )
}

bootstrap().catch((error: unknown) => {
  // Fail loudly and exit non-zero. An orchestrator must see a crash, not a
  // process that lingers in a broken state and passes its health check.
  // The logger may not exist yet at this point, so console is the only channel.
  console.error('API failed to start:', error)
  process.exit(1)
})
