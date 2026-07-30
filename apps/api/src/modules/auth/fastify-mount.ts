import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { AppLogger } from '@vsp/observability'

import type { AuthService } from './auth.service.js'

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
  basePath = '/api/auth',
): void {
  fastify.all(`${basePath}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const webRequest = toWebRequest(request)
      const response = await auth.instance.handler(webRequest)
      await sendWebResponse(reply, response)
    } catch (error) {
      logger.error({ err: error, url: request.url }, 'better-auth handler failed')
      if (!reply.sent) reply.status(500).send({ error: 'auth_handler_error' })
    }
  })

  logger.info({ basePath }, 'tenant auth endpoints mounted')
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
