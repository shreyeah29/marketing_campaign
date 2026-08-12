import { z } from 'zod'

/**
 * Environment validation.
 *
 * Every variable is validated at boot and the process refuses to start on a
 * failure. The alternative — reading `process.env.X` where it is needed — defers
 * the error to the first request that happens to touch that code path, which in
 * practice means a customer discovers the misconfiguration.
 *
 * The previous implementation shipped a hardcoded fallback JWT secret precisely
 * because a missing variable was not fatal. Nothing here has a fallback that
 * would be unsafe in production.
 */

const secret = (name: string, minLength = 32) =>
  z
    .string({ required_error: `${name} is required` })
    .min(minLength, `${name} must be at least ${String(minLength)} characters`)

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  API_HOST: z.string().default('0.0.0.0'),

  /**
   * Application-role connection. Row-level security applies to it, and the boot
   * check refuses to start if it does not.
   */
  DATABASE_URL: z.string().url(),
  /** Owner connection. Migrations and seeds only — never used to serve traffic. */
  DIRECT_DATABASE_URL: z.string().url().optional(),

  REDIS_URL: z.string().url(),

  /** Comma-separated exact origins. No wildcard: see the CORS note in main.ts. */
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  BETTER_AUTH_SECRET: secret('BETTER_AUTH_SECRET', 32),
  BETTER_AUTH_URL: z.string().url().optional(),

  /**
   * The frontend origin, used to build the links in verification, reset and
   * invitation emails. Distinct from BETTER_AUTH_URL (the API's own base): the
   * user clicks a link into the app, not into the API.
   */
  APP_URL: z.string().url().default('http://localhost:3000'),

  /** The From address on auth + marketing emails. Optional in dev, where email is logged. */
  EMAIL_FROM: z.string().default('VSP <no-reply@vsp.local>'),

  /**
   * Email delivery via Resend's REST API (no SMTP library, works on any host).
   * When set, transactional auth mail and marketing campaigns are really sent;
   * when unset the mailer logs the message instead, so development and
   * unconfigured deployments never crash — they simply don't deliver. Provider
   * choice stays a config change: swap this for another HTTP mail API behind the
   * same mailer.
   */
  RESEND_API_KEY: z.string().optional(),

  /**
   * Requiring a verified email before first login is correct in production but
   * blocks login in any environment without real email delivery. Default off in
   * development (email is logged), on in production.
   */
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  /** Wraps per-organisation provider credentials. Rotating it re-wraps, never re-keys. */
  ENCRYPTION_MASTER_KEY: secret('ENCRYPTION_MASTER_KEY', 32),

  /**
   * Platform-managed AI. AI is a built-in service: the operator sets these once and
   * every organisation uses them automatically — users never configure a provider,
   * paste a key, or select a model. The key is read ONLY from here, never the
   * database, never the user.
   */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  /**
   * Runway media generation. Operator-level and env-only, exactly like
   * OPENAI_API_KEY: never a per-tenant setting, never surfaced in any
   * configuration UI.
   *
   * REQUIRED for campaign posters as well as video — there is no fallback. An
   * earlier version of this comment promised that images would fall back to the
   * OpenAI model, which was never implemented and misled configuration. It is
   * not a small omission: gpt-image-1 returns inline base64 rather than a hosted
   * URL, so an OpenAI path needs object storage to put the bytes somewhere
   * first. Until that exists, unset means no posters. The model overrides are
   * escape hatches if Runway renames a model — the adapter has defaults.
   */
  RUNWAY_API_KEY: z.string().optional(),
  RUNWAY_VIDEO_MODEL: z.string().optional(),
  RUNWAY_IMAGE_MODEL: z.string().optional(),

  /**
   * Meta (Facebook/Instagram) ads + WhatsApp — the platform's single operator-owned
   * Meta App. These identify the *app*; a client's per-tenant access token is a
   * delegated OAuth grant stored encrypted per organisation, never here. All
   * optional so the app boots without them; the Meta features simply stay dormant
   * until the operator finishes Meta enrolment and fills these in.
   */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  // Graph API version, pinned so upgrades are deliberate.
  META_GRAPH_VERSION: z.string().default('v21.0'),
  // Where Meta redirects a client back to after they authorise the connection.
  META_OAUTH_REDIRECT_URI: z.string().optional(),
  // Optional Facebook Login / Embedded-Signup configuration id.
  META_CONFIG_ID: z.string().optional(),
  // Shared token echoed back on the webhook subscription handshake (leadgen +
  // WhatsApp inbound). Operator sets any random string and configures it in Meta.
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  /**
   * Bootstraps the first operator (platform) account at boot.
   *
   * The operator console authenticates against `PlatformAdmin`, which is a
   * different table and a different login from tenant users — and nothing else
   * writes to it: there is no sign-up route, by design, because operator access
   * must never be self-service. Without a seed the console is unreachable, so
   * these two variables create the first SUPER_ADMIN and nothing more. Creation
   * is idempotent and skipped when the email already exists, so leaving them set
   * across deploys is harmless; rotating the password here does NOT change an
   * existing account's password.
   */
  PLATFORM_BOOTSTRAP_EMAIL: z.string().email().optional(),
  PLATFORM_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  PLATFORM_BOOTSTRAP_NAME: z.string().default('Platform Admin'),

  /**
   * Served in non-production by default; explicit opt-in required in production.
   *
   * Kept as the raw string rather than transformed to a boolean here. A
   * `.optional().transform(v => v === 'true')` also runs on `undefined` and
   * yields `false`, which makes "unset" indistinguishable from "explicitly off"
   * and turns the environment-aware default below into dead code.
   */
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),

  SENTRY_DSN: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | undefined

/**
 * Parses and caches the environment.
 *
 * Errors are aggregated so a fresh deployment sees every missing variable at
 * once rather than fixing them one boot at a time.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached

  const result = envSchema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `Invalid environment configuration. The API will not start.\n${issues}\n\n` +
        'See .env.example. DATABASE_URL must point at the application role created by ' +
        'packages/database/scripts/provision-app-role.sql, not the owner.',
    )
  }

  cached = result.data
  return cached
}

/** Test-only reset, so a suite can exercise different configurations. */
export function resetEnvCache(): void {
  cached = undefined
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0)
}

export function requireEmailVerification(env: Env): boolean {
  // Unset means "use the environment default": required in production, relaxed in
  // development where auth email is only logged.
  if (env.REQUIRE_EMAIL_VERIFICATION === undefined) return env.NODE_ENV === 'production'
  return env.REQUIRE_EMAIL_VERIFICATION === 'true'
}

export function swaggerEnabled(env: Env): boolean {
  // Unset means "use the environment default"; an explicit value always wins, so
  // production can opt in and development can opt out.
  if (env.SWAGGER_ENABLED === undefined) return env.NODE_ENV !== 'production'
  return env.SWAGGER_ENABLED === 'true'
}
