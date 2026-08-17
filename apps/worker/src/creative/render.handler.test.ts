import type { Job } from 'bullmq'
import type { DatabaseClient } from '@marketing-os/database'
import type { AppLogger } from '@marketing-os/observability'
import { describe, expect, it, vi } from 'vitest'

import type { WorkerEnv } from '../config.js'

import { createCreativeRenderHandler } from './render.handler.js'

/**
 * The handler must read `job.data`, not the job.
 *
 * This is a regression test for a bug that produced no error message anywhere.
 * The handler took `(data: unknown)` while the worker calls
 * `handler(job, db, logger)`, so it received the BullMQ envelope instead of the
 * payload, rejected it as malformed, and threw before the try block that marks a
 * creative FAILED. Every poster stayed DRAFT, every batch sat at 0%, and the
 * only trace was a retry count in Redis.
 *
 * TypeScript cannot catch the shape: a one-parameter function is assignable to a
 * three-parameter type, and `unknown` accepts a `Job`. So the assertion has to be
 * behavioural — hand it a real job envelope and check it looks inside.
 */

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
  SUPABASE_BUCKET: 'creatives',
} as unknown as WorkerEnv

const LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as AppLogger

/** A job envelope shaped like BullMQ's, carrying the payload in `.data`. */
function jobWith(data: unknown): Job {
  return { id: '1', name: 'render', queueName: 'creative-render', data } as unknown as Job
}

describe('the creative render handler reads job.data', () => {
  it('looks up the creative named in the payload', async () => {
    const findFirst = vi.fn(async () => null)
    // `withTenantTransaction` runs the callback against a client; the shape below
    // is all this path touches before it decides the creative is gone.
    const db = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          // `withTenantTransaction` sets the tenant with a tagged template
          // before handing the client to the callback.
          $executeRaw: vi.fn(),
          creative: { findFirst },
          batchJob: { updateMany: vi.fn(), findFirst: vi.fn(async () => null) },
        }),
      ),
    } as unknown as DatabaseClient

    const handle = createCreativeRenderHandler(ENV)
    await handle(jobWith({ creativeId: 'cr_1', organizationId: 'org_1' }), db, LOGGER)

    // It got as far as the lookup, which is only reachable once the ids were
    // read out of `job.data`.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'cr_1' }) }),
    )
  })

  it('rejects a payload that really is missing its ids', async () => {
    const db = { $transaction: vi.fn() } as unknown as DatabaseClient
    const handle = createCreativeRenderHandler(ENV)

    await expect(handle(jobWith({ nothing: true }), db, LOGGER)).rejects.toThrow(/missing ids/)
  })

  it('rejects a job envelope handed in where the payload belongs', async () => {
    // The exact mistake, asserted directly: passing the job as the payload must
    // fail rather than appear to work, so a future refactor that reintroduces it
    // fails here instead of in production.
    const db = { $transaction: vi.fn() } as unknown as DatabaseClient
    const handle = createCreativeRenderHandler(ENV)
    const envelope = jobWith({ creativeId: 'cr_1', organizationId: 'org_1' })

    await expect(handle(jobWith(envelope), db, LOGGER)).rejects.toThrow(/missing ids/)
  })
})
