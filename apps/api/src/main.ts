import 'reflect-metadata'

import helmet from '@fastify/helmet'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { assertRosterValid, AGENT_IDS, assertCatalogFresh } from '@vsp/ai-core'
import {
  assertRowLevelSecurityEnforced,
  assertTenantRegistryComplete,
  createAdminClient,
  TENANT_SCOPED_MODELS,
} from '@vsp/database'
import { createLogger } from '@vsp/observability'

import { AppModule } from './app.module.js'
import { corsOrigins, loadEnv, swaggerEnabled } from './config/env.js'
import { assertPermissionMatrixValid } from './common/rbac/permissions.js'

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
async function runPreflight(databaseUrl: string, logger: Logger): Promise<void> {
  assertPermissionMatrixValid()
  logger.log('Permission matrix valid')

  assertRosterValid(AGENT_IDS)
  logger.log(`Agent roster valid (${String(AGENT_IDS.length)} agents)`)

  assertCatalogFresh(120)
  logger.log('Model pricing catalog is current')

  const probe = createAdminClient(databaseUrl)
  try {
    await assertRowLevelSecurityEnforced(probe)
    logger.log('Row-level security is enforced for this connection')

    await assertTenantRegistryComplete(probe, TENANT_SCOPED_MODELS.map(toTableName))
    logger.log(`Tenant registry matches the schema (${String(TENANT_SCOPED_MODELS.length)} models)`)
  } finally {
    await probe.$disconnect()
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

  await runPreflight(env.DATABASE_URL, bootLogger)

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

  const origins = corsOrigins(env)
  app.enableCors({
    // An explicit allowlist, and no wildcard even in development. The previous
    // implementation allowed every *.vercel.app origin alongside credentials,
    // which meant any site hosted on Vercel could call the API with a user's
    // session.
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 86_400,
  })

  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] })

  // No global ValidationPipe. Validation is Zod at the controller boundary, and
  // the schemas in @vsp/contracts are the single source of truth for request
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
        .setTitle('VSP AI Marketing OS')
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

  await app.listen({ port: env.API_PORT, host: env.API_HOST })

  appLogger.info(
    {
      port: env.API_PORT,
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
  // eslint-disable-next-line no-console
  console.error('API failed to start:', error)
  process.exit(1)
})
