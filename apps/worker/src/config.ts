import { z } from 'zod'

/**
 * Worker environment.
 *
 * A narrower set than the API's: the worker serves no HTTP, so it needs no CORS
 * origins, no port and no Swagger flag. It does need the same DATABASE_URL — the
 * application role — because the worker is subject to the same tenant isolation.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Application role. All job handler work uses this — RLS applies. */
  DATABASE_URL: z.string().url(),
  /**
   * Owner role, used by the outbox dispatcher ONLY.
   *
   * The dispatcher is platform infrastructure: it must read committed events
   * across every tenant to relay them, which the application role cannot do by
   * design — RLS hides rows belonging to other organisations, which is exactly
   * what it is for. Verified the hard way: with the application role the
   * dispatcher claimed zero rows and reported no error, because the policy was
   * doing its job.
   *
   * The blast radius is deliberately narrowed: this connection is used for the
   * outbox claim and requeue statements and nothing else. Every handler receives
   * the tenant-scoped client.
   *
   * Follow-up hardening: a dedicated `vsp_dispatcher` role holding SELECT/UPDATE
   * on outbox_event alone, with a policy permitting cross-tenant access to that
   * one table. Then a compromised dispatcher credential exposes event payloads
   * rather than the whole database. Recorded in BUILD_STATUS.md.
   */
  DIRECT_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /**
   * Object storage for rendered creatives. The worker writes posters directly
   * rather than handing bytes back to the API, so it needs the same bucket.
   * Unset means the render queue cannot store its output and says so.
   */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('creatives'),
  ENCRYPTION_MASTER_KEY: z.string().min(32, 'ENCRYPTION_MASTER_KEY must be at least 32 characters'),
  /** Email delivery (Resend REST). Unset → the mailer logs instead of sending. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('VSP <no-reply@vsp.local>'),
  /** Platform OpenAI key — used to embed knowledge-base documents. Unset → the
   *  embeddings handler fails the document with a clear reason (never fakes it). */
  OPENAI_API_KEY: z.string().optional(),
  /** Meta Graph API — used by the Meta poller (leadgen capture + insights sync).
   *  Unset secret → calls go without appsecret_proof; version has a safe default. */
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),
})

export type WorkerEnv = z.infer<typeof schema>

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = schema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid worker environment. Refusing to start.\n${issues}`)
  }

  return result.data
}
