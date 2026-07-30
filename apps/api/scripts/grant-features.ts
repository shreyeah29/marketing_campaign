/**
 * Idempotent feature backfill.
 *
 * New feature manifests (e.g. `marketing.forms`) and features an already-provisioned
 * organisation was never granted don't appear in its nav or pass the entitlement
 * guard until an assignment exists. `syncRegistries` keeps the `feature` table in
 * step with code on every API boot; this script grants a curated, dependency-closed
 * set to every existing organisation so the full product surface is reachable.
 *
 * Safe to run repeatedly and against any environment: every write is an upsert.
 *
 *   DATABASE_URL=<owner conn> npx tsx scripts/grant-features.ts
 */
import { FEATURES, findFeature } from '@vsp/contracts'
import { createAdminClient } from '@vsp/database'

const GRANT: readonly string[] = [
  // CRM (closure: leads→contacts, deals→pipelines)
  'crm.contacts', 'crm.companies', 'crm.leads', 'crm.pipelines', 'crm.deals', 'crm.tasks', 'crm.notes',
  // Marketing
  'marketing.campaigns', 'marketing.email', 'marketing.social', 'marketing.seo',
  'marketing.landing_pages', 'marketing.forms', 'marketing.sms', 'marketing.whatsapp',
  // AI
  'ai.chat', 'ai.copywriter', 'ai.image', 'ai.voice_calling', 'ai.analytics', 'ai.knowledge_base',
  // Automation + Analytics + Support + Comms
  'automation.workflows', 'analytics.dashboard', 'analytics.reports', 'analytics.revenue',
  'support.ticketing', 'support.helpdesk', 'comms.live_chat',
]

async function main(): Promise<void> {
  const url = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!url) throw new Error('Set DATABASE_URL or DIRECT_DATABASE_URL')
  const db = createAdminClient(url)

  try {
    // 1. Ensure the Feature rows exist (mirrors syncRegistries for just this set),
    //    so FeatureAssignment.featureKey has a target even before an API boot.
    const wanted = GRANT.map((id) => findFeature(id)).filter((f): f is NonNullable<typeof f> => Boolean(f))
    for (const f of wanted) {
      await db.feature.upsert({
        where: { key: f.id },
        create: {
          key: f.id, name: f.name, description: f.description, category: f.category,
          version: f.version, billingCategory: f.billingCategory,
          defaultEnabled: f.defaultEnabled, isCustom: f.custom ?? false,
        },
        update: { name: f.name, description: f.description, category: f.category, version: f.version },
      })
    }
    console.log(`Ensured ${String(wanted.length)} feature rows (of ${String(FEATURES.length)} in registry).`)

    // 2. Grant every wanted feature to every non-deleted organisation.
    const orgs = await db.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
    let grants = 0
    for (const org of orgs) {
      for (const f of wanted) {
        await db.featureAssignment.upsert({
          where: { organizationId_featureKey: { organizationId: org.id, featureKey: f.id } },
          create: { organizationId: org.id, featureKey: f.id, enabled: true, source: 'GRANT' },
          update: { enabled: true },
        })
        grants++
      }
      console.log(`  granted ${String(wanted.length)} features → ${org.name} (${org.id})`)
    }
    console.log(`Done. ${String(grants)} assignments across ${String(orgs.length)} organisation(s).`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
