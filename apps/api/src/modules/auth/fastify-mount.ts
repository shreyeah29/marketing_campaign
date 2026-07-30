import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'

import type { AppLogger } from '@vsp/observability'

import type { AuthService } from './auth.service.js'
import { LockoutService } from './lockout.service.js'

/**
 * Mounts Better Auth's request handler on the raw Fastify instance.
 *
 * Better Auth speaks the web-standard `Request → Response` protocol. This bridges
 * it to Fastify, and does so **outside** the Nest routing pipeline on purpose: the
 * auth endpoints (`/api/auth/*`) must not run the tenant guards — they are how a
 * caller becomes authenticated in the first place, so requiring authentication to
 * reach them would be circular. Mounting them directly on Fastify means they
 * bypass the global `AuthGuard`/`PermissionsGuard` entirely.
 *
 * The one subtlety is the body. Fastify's global content-type parser (installed by
 * the Nest adapter) has already parsed the JSON by the time we run, so rather than
 * fighting it for the raw stream we re-serialise `request.body` into the web
 * `Request`. Set-cookie needs explicit handling because the Fetch `Headers` API
 * folds multiple cookies into one value — `getSetCookie()` recovers the array.
 */
export function mountBetterAuth(
  fastify: FastifyInstance,
  auth: AuthService,
  logger: AppLogger,
  redis: Redis,
  basePath = '/api/auth',
): void {
  const lockout = new LockoutService(redis)

  fastify.all(`${basePath}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const path = request.url.split('?')[0] ?? request.url
      const isSignIn = request.method === 'POST' && path.endsWith('/sign-in/email')
      const email =
        isSignIn && isRecord(request.body) && typeof request.body['email'] === 'string'
          ? request.body['email'].toLowerCase()
          : undefined

      // Account lockout: refuse a frozen account before the credential is even
      // checked, so a locked account cannot be probed further.
      if (email && (await lockout.isLocked(email))) {
        auditAuth(logger, 'auth.login_blocked', { email, reason: 'account_locked' })
        reply
          .status(429)
          .header('retry-after', '900')
          .send({ code: 'account_locked', message: 'Too many failed attempts. Try again later.' })
        return
      }

      const response = await auth.instance.handler(toWebRequest(request))

      // Update lockout state and audit the outcome from the response status.
      if (email) {
        if (response.status < 400) {
          await lockout.clear(email)
          auditAuth(logger, 'auth.login', { email, outcome: 'success' })
        } else if (response.status === 401 || response.status === 403) {
          const attempts = await lockout.recordFailure(email)
          const locked = attempts >= LockoutService.maxAttempts
          auditAuth(logger, locked ? 'auth.account_locked' : 'auth.login', {
            email,
            outcome: 'failure',
            attempts,
          })
        }
      } else {
        auditNonLogin(logger, request.method, path, response.status)
      }

      await sendWebResponse(reply, response)
    } catch (error) {
      logger.error({ err: error, url: request.url }, 'better-auth handler failed')
      if (!reply.sent) reply.status(500).send({ error: 'auth_handler_error' })
    }
  })

  logger.info({ basePath }, 'tenant auth endpoints mounted')
}

/**
 * Emits an identity-level auth event to the audit log.
 *
 * Login, logout, registration and password reset are identity events, not
 * organisation events, so they are recorded here (structured, `audit: true`)
 * rather than in the tenant `AuditLog`, which requires an organisation and is
 * where org-scoped auth events — invitations, role changes, org switches — live.
 */
function auditAuth(logger: AppLogger, event: string, fields: Record<string, unknown>): void {
  logger.info({ audit: true, event, ...fields }, `auth event: ${event}`)
}

function auditNonLogin(logger: AppLogger, method: string, path: string, status: number): void {
  const outcome = status < 400 ? 'success' : 'failure'
  if (path.endsWith('/sign-up/email') && method === 'POST') {
    auditAuth(logger, 'auth.register', { outcome })
  } else if (path.endsWith('/sign-out')) {
    auditAuth(logger, 'auth.logout', { outcome })
  } else if (path.endsWith('/forget-password')) {
    auditAuth(logger, 'auth.password_reset_requested', { outcome })
  } else if (path.endsWith('/reset-password')) {
    auditAuth(logger, 'auth.password_reset', { outcome })
  } else if (path.includes('/verify-email')) {
    auditAuth(logger, 'auth.email_verified', { outcome })
  } else if (path.includes('revoke-session') || path.includes('revoke-sessions')) {
    auditAuth(logger, 'auth.session_revoked', { outcome })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toWebRequest(request: FastifyRequest): Request {
  const host = request.headers.host ?? 'localhost'
  const url = `${request.protocol}://${host}${request.url}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }

  const method = request.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const init: RequestInit = { method, headers }
  if (hasBody && request.body !== undefined && request.body !== null) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    // The re-serialised length differs from the original; let undici recompute.
    headers.delete('content-length')
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  }

  return new Request(url, init)
}

async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  // set-cookie first, from the multi-value accessor, so multiple cookies survive.
  const setCookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (setCookies.length > 0) reply.header('set-cookie', setCookies)

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
  })

  reply.status(response.status)
  const text = await response.text()
  reply.send(text.length > 0 ? text : null)
}
