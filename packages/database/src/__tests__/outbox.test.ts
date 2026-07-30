/**
 * Transactional outbox guarantees.
 *
 * The whole point of the pattern is atomicity between a state change and the
 * event announcing it. That is a property of the database transaction, so it is
 * tested against a real transaction — a mocked queue would prove nothing at all
 * about the case that matters, which is the process dying mid-flight.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  claimOutboxBatch,
  createAdminClient,
  createDatabaseClient,
  publishEvent,
  requeueOutboxEvent,
  tenantInput,
  withTenant,
  withTenantTransaction,
  type DatabaseClient,
  type PrismaClient,
} from '../index.js'

const ADMIN_URL = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? ''

const ORG = 'test-outbox-org'

let admin: PrismaClient
let db: DatabaseClient

beforeAll(async () => {
  admin = createAdminClient(ADMIN_URL)
  db = createDatabaseClient({ url: ADMIN_URL })

  await admin.outboxEvent.deleteMany({ where: { organizationId: ORG } })
  await admin.company.deleteMany({ where: { organizationId: ORG } })
  await admin.organization.deleteMany({ where: { id: ORG } })
  await admin.organization.create({ data: { id: ORG, name: 'Outbox Test', slug: ORG } })
})

afterAll(async () => {
  await admin.outboxEvent.deleteMany({ where: { organizationId: ORG } })
  await admin.company.deleteMany({ where: { organizationId: ORG } })
  await admin.organization.deleteMany({ where: { id: ORG } })
  await admin.$disconnect()
  await db.$disconnect()
})

describe('atomicity with the state change', () => {
  it('commits the event together with the row', async () => {
    await withTenant({ organizationId: ORG, userId: 'user-1' }, () =>
      withTenantTransaction(db, async (tx) => {
        const company = await tx.company.create({
          data: tenantInput({ name: 'Atomic Co' }),
        })

        await publishEvent(
          tx,
          'crm.lead.created.v1',
          { leadId: 'lead-1', contactId: null, source: 'test', campaignId: null },
          { aggregateType: 'Lead', aggregateId: 'lead-1' },
        )

        return company
      }),
    )

    const events = await admin.outboxEvent.findMany({ where: { organizationId: ORG } })
    expect(events).toHaveLength(1)
    expect(events[0]?.eventName).toBe('crm.lead.created.v1')
    expect(events[0]?.status).toBe('PENDING')

    await expect(admin.company.count({ where: { organizationId: ORG } })).resolves.toBe(1)
  })

  it('discards the event when the transaction rolls back', async () => {
    // The failure mode the pattern exists to prevent, in reverse: no event may
    // survive a state change that did not happen. Publishing to a queue directly
    // would leave consumers reacting to a row that does not exist.
    const before = await admin.outboxEvent.count({ where: { organizationId: ORG } })

    await expect(
      withTenant({ organizationId: ORG }, () =>
        withTenantTransaction(db, async (tx) => {
          await tx.company.create({ data: tenantInput({ name: 'Doomed Co' }) })
          await publishEvent(tx, 'crm.deal.won.v1', {
            dealId: 'deal-doomed',
            value: '1000.00',
            currency: 'USD',
            contactId: null,
          })
          throw new Error('deliberate failure after both writes')
        }),
      ),
    ).rejects.toThrow('deliberate failure')

    await expect(admin.outboxEvent.count({ where: { organizationId: ORG } })).resolves.toBe(before)
    await expect(
      admin.company.count({ where: { organizationId: ORG, name: 'Doomed Co' } }),
    ).resolves.toBe(0)
  })
})

describe('payload validation at publish time', () => {
  it('rejects a payload that does not match the registered schema', async () => {
    // Validating here keeps undeliverable events out of the outbox entirely. A
    // malformed row cannot be dispatched, so it would block or dead-letter
    // repeatedly and need clearing by hand.
    await expect(
      withTenant({ organizationId: ORG }, () =>
        withTenantTransaction(db, async (tx) =>
          publishEvent(tx, 'crm.lead.qualified.v1', {
            leadId: 'lead-2',
            score: 'not-a-number',
          } as never),
        ),
      ),
    ).rejects.toThrow()

    const bad = await admin.outboxEvent.findMany({
      where: { organizationId: ORG, eventName: 'crm.lead.qualified.v1' },
    })
    expect(bad).toHaveLength(0)
  })
})

describe('dispatcher claim semantics', () => {
  it('claims pending events and marks them dispatched', async () => {
    await admin.outboxEvent.deleteMany({ where: { organizationId: ORG } })

    await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) => {
        for (let i = 0; i < 3; i += 1) {
          await publishEvent(tx, 'crm.lead.created.v1', {
            leadId: `claim-${i}`,
            contactId: null,
            source: null,
            campaignId: null,
          })
        }
      }),
    )

    const claimed = await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) => claimOutboxBatch(tx, 10)),
    )

    expect(claimed).toHaveLength(3)
    expect(claimed.every((row) => row.attempts === 1)).toBe(true)

    // A second pass finds nothing: claiming and marking happen in one transaction,
    // so two dispatchers cannot deliver the same event twice in the happy path.
    const second = await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) => claimOutboxBatch(tx, 10)),
    )
    expect(second).toHaveLength(0)
  })

  it('backs off on failure and dead-letters after the attempt limit', async () => {
    await admin.outboxEvent.deleteMany({ where: { organizationId: ORG } })

    await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) => {
        await publishEvent(tx, 'crm.lead.created.v1', {
          leadId: 'poison',
          contactId: null,
          source: null,
          campaignId: null,
        })
      }),
    )

    const [event] = await admin.outboxEvent.findMany({ where: { organizationId: ORG } })
    expect(event).toBeDefined()

    // Below the limit: returned to PENDING for another attempt.
    await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) =>
        requeueOutboxEvent(tx, event!.id, 'consumer exploded', 10),
      ),
    )

    let reloaded = await admin.outboxEvent.findFirst({ where: { id: event!.id } })
    expect(reloaded?.status).toBe('PENDING')
    expect(reloaded?.lastError).toBe('consumer exploded')
    // Backoff pushes availability into the future, so a failing event does not
    // spin the dispatcher at full speed.
    expect(reloaded!.availableAt.getTime()).toBeGreaterThan(Date.now())

    // At the limit: dead-lettered, so one poisoned row cannot stall everything
    // behind it. Kept rather than deleted, so a human can inspect it.
    await admin.outboxEvent.update({ where: { id: event!.id }, data: { attempts: 10 } })
    await withTenant({ organizationId: ORG }, () =>
      withTenantTransaction(db, async (tx) =>
        requeueOutboxEvent(tx, event!.id, 'still broken', 10),
      ),
    )

    reloaded = await admin.outboxEvent.findFirst({ where: { id: event!.id } })
    expect(reloaded?.status).toBe('DEAD_LETTERED')
  })
})
