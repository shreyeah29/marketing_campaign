/**
 * Ensures every organisation has at least one sales pipeline, so Deals is usable
 * (a deal must reference a pipeline + stage). Idempotent: orgs that already have a
 * pipeline are skipped.
 *
 *   DATABASE_URL=<owner conn> npx tsx scripts/ensure-default-pipeline.ts
 */
import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@marketing-os/database'

const STAGES = [
  { name: 'New', position: 0, probability: 10, isWon: false, isLost: false },
  { name: 'Qualified', position: 1, probability: 30, isWon: false, isLost: false },
  { name: 'Proposal', position: 2, probability: 60, isWon: false, isLost: false },
  { name: 'Negotiation', position: 3, probability: 80, isWon: false, isLost: false },
  { name: 'Won', position: 4, probability: 100, isWon: true, isLost: false },
  { name: 'Lost', position: 5, probability: 0, isWon: false, isLost: true },
]

async function main(): Promise<void> {
  const url = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!url) throw new Error('Set DATABASE_URL or DIRECT_DATABASE_URL')
  const db = createAdminClient(url)

  try {
    const orgs = await db.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    })
    let created = 0
    for (const org of orgs) {
      const existing = await db.pipeline.count({
        where: { organizationId: org.id, deletedAt: null },
      })
      if (existing > 0) continue

      const pipelineId = randomUUID()
      await db.pipeline.create({
        data: {
          id: pipelineId,
          organizationId: org.id,
          name: 'Sales Pipeline',
          isDefault: true,
          position: 0,
          stages: { create: STAGES.map((s) => ({ id: randomUUID(), ...s })) },
        },
      })
      created++
      console.log(`  created default pipeline for ${org.name} (${org.id})`)
    }
    console.log(
      `Done. Created ${String(created)} pipeline(s) across ${String(orgs.length)} organisation(s).`,
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
