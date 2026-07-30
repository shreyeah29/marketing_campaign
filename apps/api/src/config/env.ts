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

  /** The From address on auth emails. Optional in dev, where email is logged. */
  EMAIL_FROM: z.string().default('VSP <no-reply@vsp.local>'),

  /**
   * Requiring a verified email before first login is correct in production but
   * blocks login in any environment without real email delivery. Default off in
   * development (email is logged), on in production.
   */
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  /** Wraps per-organisation provider credentials. Rotating it re-wraps, never re-keys. */
  ENCRYPTION_MASTER_KEY: secret('ENCRYPTION_MASTER_KEY', 32),

  /**
   * Platform-wide AI keys. When set, every organisation uses them by default —
   * the operator pays for the credits — so no per-org configuration is needed.
   * A per-org key configured in Settings → Providers still takes precedence, so an
   * org can bring its own. Leave unset to require per-org keys (BYOK).
   */
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Optional default model for the platform LLM key (else the adapter default). */
  PLATFORM_LLM_MODEL: z.string().optional(),

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
