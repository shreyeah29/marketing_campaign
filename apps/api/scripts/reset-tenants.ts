/**
 * DESTRUCTIVE. Removes every organisation and every tenant login, leaving only
 * the operator console and the platform catalogue.
 *
 * The intended use is exactly one: clearing test data so a clean organisation
 * can be provisioned from the operator console and the workflow walked from the
 * beginning. It is not a maintenance tool, it has no undo, and Postgres will not
 * ask twice.
 *
 * WHAT IT DELETES
 *   Every Organization row — which cascades to roughly seventy tables:
 *   contacts, leads, deals, campaigns, campaign assets, media, social accounts
 *   and posts, Meta connections and ad campaigns, workflows, agent runs, audit
 *   logs, notifications, settings and branding.
 *   Every tenant User, Session, Account and Verification.
 *   Every recorded Meta webhook event (raw lead payloads awaiting processing).
 *
 * WHAT SURVIVES
 *   PlatformAdmin      — the operator console login. This is the point.
 *   PlatformAuditLog   — the operator's own record of what was done.
 *   Plan / PlanFeature / Feature — the platform catalogue, rebuilt on boot but
 *                        pointless to destroy.
 *
 * WHAT IT CANNOT UNDO
 *   Meta connections are OAuth grants stored encrypted per organisation.
 *   Deleting them does not touch anything inside Meta — ads, pages and lead
 *   forms all continue to exist and run — but the new organisation must
 *   reconnect before it can see any of them. Leads already captured into the
 *   CRM are gone; the originals remain in Meta only for as long as Meta keeps
 *   them (90 days for lead ads).
 *
 *   DATABASE_URL=<owner conn> npx tsx scripts/reset-tenants.ts --i-understand
 *
 * Without `--i-understand` it prints what it would delete and exits.
 */
import { createAdminClient } from '@vsp/database'

const CONFIRMED = process.argv.includes('--i-understand')

async function main(): Promise<void> {
  const url = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!url) throw new Error('Set DATABASE_URL or DIRECT_DATABASE_URL')
  const db = createAdminClient(url)

  try {
    const [orgs, users, admins, leads, contacts, assets, events] = await Promise.all([
      db.organization.count(),
      db.user.count(),
      db.platformAdmin.count(),
      db.lead.count(),
      db.contact.count(),
      db.campaignAsset.count(),
      db.metaWebhookEvent.count(),
    ])

    console.log('\nAbout to delete:')
    console.log(`  organisations      ${String(orgs)}`)
    console.log(`  tenant users       ${String(users)}`)
    console.log(`  leads              ${String(leads)}`)
    console.log(`  contacts           ${String(contacts)}`)
    console.log(`  campaign assets    ${String(assets)}`)
    console.log(`  meta webhook rows  ${String(events)}`)
    console.log('\nSurviving:')
    console.log(`  operator accounts  ${String(admins)}`)

    if (admins === 0) {
      // Refuse rather than lock the operator out of their own console. The
      // whole point of this reset is that the operator login still works
      // afterwards, and there would be no way back in.
      throw new Error(
        'No PlatformAdmin exists. Deleting everything now would leave no way to log in ' +
          'anywhere. Set PLATFORM_BOOTSTRAP_EMAIL / PLATFORM_BOOTSTRAP_PASSWORD and restart ' +
          'the API first, then run this again.',
      )
    }

    if (!CONFIRMED) {
      console.log('\nDry run — nothing was deleted.')
      console.log('Re-run with --i-understand to actually do it.\n')
      return
    }

    // One transaction: a half-deleted tenant set is worse than either end state,
    // and would leave rows referencing an organisation that no longer exists.
    await db.$transaction(async (tx) => {
      // Sessions and accounts cascade from User, and almost everything else
      // cascades from Organization — but the order still matters, because a
      // membership points at both.
      await tx.organization.deleteMany({})
      await tx.session.deleteMany({})
      await tx.account.deleteMany({})
      await tx.verification.deleteMany({})
      await tx.user.deleteMany({})
      // Not organisation-scoped: a webhook arrives before any tenant is known,
      // so these would otherwise survive and be processed against the new org.
      await tx.metaWebhookEvent.deleteMany({})
    })

    const after = {
      organizations: await db.organization.count(),
      users: await db.user.count(),
      admins: await db.platformAdmin.count(),
    }
    console.log('\nDone.')
    console.log(`  organisations remaining  ${String(after.organizations)}`)
    console.log(`  tenant users remaining   ${String(after.users)}`)
    console.log(`  operator accounts        ${String(after.admins)}`)
    console.log('\nLog in at /platform/login and provision a fresh organisation.\n')
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
