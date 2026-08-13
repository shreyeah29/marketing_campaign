import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

import { Inject, Injectable } from '@nestjs/common'

import { createAdminClient, type PrismaClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'

import { corsOrigins, loadEnv, requireEmailVerification } from '../../config/env.js'
import { LOGGER } from '../../infrastructure/database.module.js'

import { EMAIL_PORT, type EmailPort } from './email.port.js'

/**
 * The tenant authentication engine.
 *
 * Better Auth owns identity — users, sessions, accounts, verifications — and the
 * whole credential lifecycle: registration, login, logout, email verification,
 * password reset, session expiry and refresh. It reads and writes the
 * Better-Auth-shaped tables that already exist in the schema.
 *
 * Two deliberate choices anchor the rest of the auth system:
 *
 *   1. **It runs on the owner connection.** Identity is a cross-tenant concern —
 *      a user spans organisations, and the session that authenticates them exists
 *      before any tenant context is chosen. The identity tables are global (no
 *      RLS), so the owner connection is used the same way the platform plane and
 *      provisioning use it: deliberately, in one audited place.
 *
 *   2. **It is completely separate from the platform-admin realm.** Platform
 *      admins authenticate against their own table with their own HMAC tokens and
 *      never touch these cookies or sessions. Nothing here can grant platform
 *      access, and nothing there can grant tenant access.
 */
@Injectable()
export class AuthService {
  // Typed from the factory's concrete return, not `Auth<BetterAuthOptions>`: Better
  // Auth's instance type is invariant in its options, so the generic default is not
  // assignable from the specific one. Capturing the factory's ReturnType keeps the
  // full, precise typing of `api`/`handler`.
  readonly instance: ReturnType<typeof createBetterAuthInstance>
  /** The owner client Better Auth writes through; reused by the identity layer. */
  readonly owner: PrismaClient

  constructor(
    @Inject(LOGGER) private readonly logger: AppLogger,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
  ) {
    const env = loadEnv()
    this.owner = createAdminClient(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL)
    this.instance = createBetterAuthInstance(this.owner, this.email)

    this.logger.info(
      {
        requireEmailVerification: requireEmailVerification(env),
        trustedOrigins: corsOrigins(env).length,
      },
      'tenant auth (Better Auth) initialised',
    )
  }

  async disconnect(): Promise<void> {
    await this.owner.$disconnect()
  }
}

/**
 * Builds the Better Auth instance.
 *
 * A module-level factory rather than an inline expression so its concrete return
 * type can be captured with `ReturnType` (see the field above), and so the whole
 * configuration reads in one place.
 */
function createBetterAuthInstance(owner: PrismaClient, email: EmailPort) {
  const env = loadEnv()
  const appUrl = env.APP_URL
  const verifyRequired = requireEmailVerification(env)

  return betterAuth({
    appName: 'VSP AI Marketing OS',
    secret: env.BETTER_AUTH_SECRET,
    baseURL:
      env.BETTER_AUTH_URL ??
      `http://${env.API_HOST === '0.0.0.0' ? 'localhost' : env.API_HOST}:${String(env.API_PORT)}`,
    basePath: '/api/auth',
    // CSRF: state-changing requests are accepted only from these origins. The
    // same list the API's CORS uses, so there is one answer to "who may call us".
    trustedOrigins: corsOrigins(env),
    database: prismaAdapter(owner, { provider: 'postgresql' }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 200,
      // Verification is required in production; in dev the link is only logged,
      // so requiring it would make login impossible without a mail provider.
      requireEmailVerification: verifyRequired,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Reset your password',
          heading: 'Reset your password',
          body: 'We received a request to reset your password. This link expires in one hour. If you did not request it, you can ignore this email.',
          actionUrl: appLink(appUrl, url),
          actionLabel: 'Reset password',
        })
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: 'Verify your email',
          heading: 'Confirm your email address',
          body: 'Confirm your email to finish setting up your account. This link expires in one hour.',
          actionUrl: appLink(appUrl, url),
          actionLabel: 'Verify email',
        })
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      // Sliding refresh: a session older than a day is rotated on the next use,
      // so an active user is never logged out mid-work while an idle one expires.
      updateAge: 60 * 60 * 24,
      // "Remember me" is the client sending rememberMe:false to opt into a
      // session that dies with the browser; the default is the persistent 7-day.
      // DB is the source of truth for the active org, so no cookie cache.
      cookieCache: { enabled: false },
    },

    // Built-in throttle in front of the credential endpoints. Account lockout
    // (Redis, per-identifier) is layered on top in the security slice.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60 * 60, max: 30 },
        '/forget-password': { window: 60 * 60, max: 5 },
        '/reset-password': { window: 60 * 60, max: 10 },
      },
    },

    advanced: {
      // Renaming this invalidates every existing session cookie, so changing it
      // again signs the whole tenant out. Worth knowing before it looks like a
      // bug rather than a deliberate one-time cost.
      cookiePrefix: 'mos',
      useSecureCookies: env.NODE_ENV === 'production',
      // HttpOnly always. In production the frontend (e.g. a *.vercel.app domain)
      // and this API are different origins, so the session cookie must be
      // SameSite=None + Secure to be sent on cross-site fetches — Lax would be
      // dropped and auth would silently fail. In development everything is
      // localhost (same-site), where Lax over http is correct and Secure is off.
      // CSRF is still enforced by the trusted-origin allowlist, not by SameSite.
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
      },
    },
  })
}

/**
 * Better Auth builds verification/reset URLs against its own baseURL with a
 * `callbackURL` back to the app. We leave the token URL as Better Auth produced
 * it — clicking it hits the API, which verifies and then redirects to the app —
 * and only ensure a sensible callback into `appUrl` is present.
 */
function appLink(appUrl: string, url: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('callbackURL')) {
      parsed.searchParams.set('callbackURL', appUrl)
    }
    return parsed.toString()
  } catch {
    return url
  }
}
