/**
 * Idempotent demo-data seed for sales demos.
 *
 * Populates every product module for each real (non-test) organisation with
 * realistic, marketing-agency-themed data so a walkthrough shows the whole surface
 * alive: CRM, campaigns, the asset review board, email, social, forms, landing
 * pages, automation, inbox, support, notifications, knowledge base and analytics.
 *
 * Safe to run repeatedly: an org that already has more than a handful of contacts
 * is skipped, so re-running never duplicates. Every insert carries an explicit
 * organizationId (the admin client is RLS-exempt), and enum values / required
 * columns are matched to prisma/schema.prisma exactly.
 *
 *   DATABASE_URL=<owner conn> npx tsx scripts/seed-demo.ts
 */
import { randomUUID } from 'node:crypto'

import { createAdminClient, type Prisma } from '@vsp/database'

// ─── helpers ─────────────────────────────────────────────────────────────────

const now = new Date()

/** A Date `n` days before now (keeps time-of-day for realistic ordering). */
function daysAgo(n: number): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return d
}

/** A Date `n` days ahead of now. */
function daysAhead(n: number): Date {
  return daysAgo(-n)
}

/** A Date `n` hours before now. */
function hoursAgo(n: number): Date {
  const d = new Date(now)
  d.setHours(d.getHours() - n)
  return d
}

/** Midnight-UTC date `n` days ago, for @db.Date columns. */
function dateOnlyAgo(n: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length] as T
}

// Slugs that look like automated test fixtures — never seed these.
const SKIP_SLUG_FRAGMENTS = [
  'test',
  'fixture',
  'isolation',
  'relay',
  'cred',
  '-mp',
  '-ent',
  'aaa',
  'bbb',
]

function looksLikeFixture(slug: string, id: string): boolean {
  const s = slug.toLowerCase()
  if (id.startsWith('org-')) return true
  return SKIP_SLUG_FRAGMENTS.some((frag) => s.includes(frag))
}

// ─── sample content (marketing-agency themed; varied, not lorem) ──────────────

const COMPANIES = [
  {
    name: 'Aurelia Fine Jewellery',
    domain: 'aurelia-jewels.example.com',
    industry: 'Jewellery & Accessories',
    size: '51-200',
  },
  {
    name: 'NestPoint Smart Home',
    domain: 'nestpoint.example.com',
    industry: 'Consumer Electronics',
    size: '201-500',
  },
  {
    name: 'Lumiere Skincare',
    domain: 'lumiereskin.example.com',
    industry: 'Beauty & Personal Care',
    size: '11-50',
  },
  {
    name: 'Verdant Interiors',
    domain: 'verdantinteriors.example.com',
    industry: 'Home & Furniture',
    size: '11-50',
  },
  {
    name: 'Peak & Pine Outdoors',
    domain: 'peakandpine.example.com',
    industry: 'Retail',
    size: '51-200',
  },
  {
    name: 'Saffron Table',
    domain: 'saffrontable.example.com',
    industry: 'Food & Beverage',
    size: '11-50',
  },
  {
    name: 'Cobalt Fitness',
    domain: 'cobaltfitness.example.com',
    industry: 'Health & Fitness',
    size: '51-200',
  },
  {
    name: 'Harbor & Co Realty',
    domain: 'harborcorealty.example.com',
    industry: 'Real Estate',
    size: '11-50',
  },
]

const FIRST_NAMES = [
  'Aanya',
  'Rohan',
  'Priya',
  'Marcus',
  'Elena',
  'Dev',
  'Sofia',
  'Kabir',
  'Nadia',
  'Liam',
  'Meera',
  'Julian',
  'Isha',
  'Owen',
  'Farah',
  'Noah',
  'Tara',
  'Ethan',
  'Zoya',
  'Caleb',
]
const LAST_NAMES = [
  'Kapoor',
  'Mehta',
  'Sharma',
  'Reyes',
  'Novak',
  'Patel',
  'Rossi',
  'Khan',
  'Haddad',
  'Walsh',
  'Iyer',
  'Brooks',
  'Nair',
  'Fischer',
  'Aziz',
  'Bennett',
  'Sen',
  'Clarke',
  'Malik',
  'Turner',
]
const JOB_TITLES = [
  'Marketing Director',
  'Founder',
  'Head of Growth',
  'Brand Manager',
  'CMO',
  'E-commerce Lead',
  'Social Media Manager',
  'VP Marketing',
  'Content Lead',
  'Performance Marketer',
]
const CONTACT_TAGS = [
  ['vip'],
  ['newsletter'],
  ['webinar', 'warm'],
  ['event-lead'],
  ['partner'],
  ['high-intent'],
  ['re-engage'],
  [],
]

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NURTURING',
  'UNQUALIFIED',
  'CONVERTED',
] as const
const LEAD_SOURCES = ['FORM', 'ADS', 'REFERRAL', 'ORGANIC', 'EVENT', 'OUTBOUND']
const LEAD_MEDIUMS = ['instagram', 'google-cpc', 'word-of-mouth', 'seo', 'trade-show', 'cold-email']

const TASK_TITLES = [
  'Follow up on the Aurelia festive proposal',
  'Send NestPoint the Q3 performance recap',
  'Draft creative brief for Lumiere launch',
  'Review ad spend pacing across paid social',
  'Schedule discovery call with Verdant Interiors',
  'Prepare influencer shortlist for skincare push',
  'Approve landing page copy for spring sale',
  'Reconcile UTM tags on Google campaigns',
  'Book photoshoot for jewellery lookbook',
  'Send contract to Cobalt Fitness',
]
const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'TODO',
  'CANCELED',
  'IN_PROGRESS',
] as const
const TASK_PRIORITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
  'MEDIUM',
  'HIGH',
  'MEDIUM',
  'LOW',
  'HIGH',
  'URGENT',
] as const

const NOTE_BODIES = [
  'Prefers WhatsApp over email for quick approvals. Very responsive after 4pm.',
  'Budget confirmed for the festive quarter — waiting on legal sign-off.',
  'Loved the reel concept; wants a second variant with softer lighting.',
  'Decision maker is the founder, not the marketing lead. Loop both in.',
  'Asked for a case study from a comparable skincare brand before committing.',
  'Renewal comes up in October — start the QBR deck a month ahead.',
  'Sensitive to price. Lead with ROI, not creative volume.',
  'Referred us to a sister brand in the same group. Warm intro incoming.',
]

const ACTIVITY_TYPES = [
  'CALL',
  'EMAIL',
  'MEETING',
  'NOTE',
  'MESSAGE',
  'STATUS_CHANGE',
  'AI_ACTION',
  'CALL',
  'EMAIL',
  'MEETING',
] as const
const ACTIVITY_SUMMARIES = [
  'Discovery call — scoped festive campaign goals',
  'Sent proposal and media plan',
  'Kickoff meeting with brand team',
  'Logged requirements from creative review',
  'WhatsApp thread on asset approvals',
  'Moved deal to Proposal stage',
  'Sales agent qualified inbound lead',
  'Follow-up call on budget',
  'Emailed revised pricing options',
  'Strategy workshop for spring launch',
]

// Campaign brand packs — each drives its own set of assets + email + social copy.
interface BrandPack {
  campaignName: string
  objective: string
  description: string
  audience: Prisma.InputJsonValue
  strategy: Prisma.InputJsonValue
  budget: number
  hashtags: string[]
  ctas: string[]
  bodies: string[]
  captions: string[]
}

const BRAND_PACKS: BrandPack[] = [
  {
    campaignName: 'Diwali Jewellery Launch',
    objective: 'Drive festive-season sales of the Aurelia 22k gold collection',
    description:
      'A three-week festive push around Diwali built on lookbook imagery, gifting bundles and a countdown to the last shipping date.',
    audience: {
      ageRange: '28-45',
      interests: ['fine jewellery', 'festive gifting', 'luxury'],
      regions: ['IN', 'AE', 'UK'],
      segments: ['returning buyers', 'high-AOV'],
    },
    strategy: {
      pillars: ['Heritage craftsmanship', 'Festive gifting', 'Limited edition'],
      channels: ['instagram', 'meta-ads', 'email'],
      cadence: 'daily',
      kpis: { roas: 4.0, revenue: 500000 },
    },
    budget: 45000,
    hashtags: ['#Diwali', '#AureliaGold', '#FestiveGifting', '#FineJewellery', '#22kGold'],
    ctas: ['Shop the festive edit', 'Reserve yours before Diwali', 'Book a styling appointment'],
    bodies: [
      'This Diwali, gift a heirloom in the making. The Aurelia festive edit is handcrafted in 22k gold, made to be worn and remembered.',
      'Light meets legacy. Our new festive collection pairs temple-inspired motifs with a modern, everyday drape.',
      'Only 200 pieces per design. When they are gone, they are gone — the festive edit is intentionally limited.',
      'Free resizing, lifetime polishing and a keepsake box with every festive order placed before the 20th.',
      'From the workshop floor to your celebration: every Aurelia piece passes through eleven pairs of hands.',
      'Gifting made effortless — tell us the occasion and our stylists will curate three options within the hour.',
      'The last shipping date for guaranteed Diwali delivery is fast approaching. Reserve your favourite now.',
      'Layer the festive chokers or wear them solo. Styled three ways in our latest lookbook.',
      'A gift that appreciates. Certified 22k gold, ethically sourced, valued for a lifetime.',
      'Behind every design is a story — meet the artisans shaping this year’s festive collection.',
    ],
    captions: [
      'Handcrafted in 22k gold for the festival of light.',
      'Temple motifs, modern drape.',
      'Limited to 200 pieces per design.',
      'Every order gifted in a keepsake box.',
      'Eleven pairs of hands, one heirloom.',
      'Stylist-curated gifting in under an hour.',
      'Last shipping date for Diwali is near.',
      'Three ways to wear the festive choker.',
      'Certified, ethical, forever.',
      'Meet the artisans behind the edit.',
    ],
  },
  {
    campaignName: 'Smart Home Spring Sale',
    objective: 'Grow NestPoint installs with a spring bundle promotion and free setup',
    description:
      'A performance-led spring sale bundling the hub, sensors and cameras with free professional installation, optimised for paid search and social retargeting.',
    audience: {
      ageRange: '30-55',
      interests: ['smart home', 'home security', 'energy saving'],
      regions: ['US', 'CA', 'UK'],
      segments: ['homeowners', 'cart-abandoners'],
    },
    strategy: {
      pillars: ['Convenience', 'Security', 'Energy savings'],
      channels: ['google-ads', 'meta-ads', 'email'],
      cadence: 'twice-weekly',
      kpis: { cpa: 38, installs: 1200 },
    },
    budget: 60000,
    hashtags: ['#SmartHome', '#NestPoint', '#SpringSale', '#HomeAutomation', '#SmartSecurity'],
    ctas: ['Claim free installation', 'Build your bundle', 'See the spring deal'],
    bodies: [
      'Spring into a smarter home. Bundle the NestPoint hub with sensors and cameras and we will install it all — free.',
      'One app, every room. Lights, locks, climate and cameras, finally talking to each other.',
      'Cut your energy bill without lifting a finger. NestPoint learns your routine and adjusts automatically.',
      'Away for the weekend? Arm the whole house from your phone and get instant alerts if anything moves.',
      'No wires, no drilling, no hassle — professional setup included with every spring bundle.',
      'Works with the assistants you already use. Set the scene with a single word.',
      'Rated 4.8 by 12,000 homeowners. This spring, find out why.',
      'Your front door, doorbell, garage and thermostat — one dashboard, total control.',
      'Limited spring pricing: save up to 30% when you bundle three devices or more.',
      'Peace of mind that pays for itself. Lower bills, fewer worries, smarter living.',
    ],
    captions: [
      'Free installation, all spring long.',
      'One app for every room.',
      'Lower bills, zero effort.',
      'Arm the house from anywhere.',
      'No wires. No drilling. No hassle.',
      'Works with your voice assistant.',
      '4.8 stars from 12,000 homes.',
      'One dashboard, total control.',
      'Save up to 30% on bundles.',
      'Smarter living, real savings.',
    ],
  },
  {
    campaignName: 'Skincare Brand Awareness',
    objective:
      'Build awareness for Lumiere’s new barrier-repair range with dermatologist-led content',
    description:
      'An always-on awareness play led by education, UGC and dermatologist collaborations to seed the new barrier-repair serum ahead of a retail launch.',
    audience: {
      ageRange: '20-40',
      interests: ['skincare', 'clean beauty', 'wellness'],
      regions: ['US', 'IN', 'SG'],
      segments: ['skincare-curious', 'sensitive-skin'],
    },
    strategy: {
      pillars: ['Science-backed', 'Gentle & clean', 'Real results'],
      channels: ['instagram', 'tiktok', 'seo'],
      cadence: 'daily',
      kpis: { reach: 2000000, followers: 25000 },
    },
    budget: 30000,
    hashtags: ['#Lumiere', '#SkinBarrier', '#CleanBeauty', '#SensitiveSkin', '#SkincareRoutine'],
    ctas: ['Learn your skin type', 'Join the waitlist', 'Read the science'],
    bodies: [
      'Your skin barrier does the quiet work. Our new serum helps it hold moisture, calm redness and bounce back.',
      'Clinically tested, dermatologist-formulated, fragrance-free. Kind to sensitive skin, serious about results.',
      'Five ingredients, zero guesswork. We stripped the routine back to what actually repairs.',
      'Barrier 101: what it is, why it breaks down, and the simple habits that rebuild it.',
      'Real skin, real timelines. See the 28-day before-and-afters from our tester panel.',
      'Fragrance-free is not boring — it is respect for skin that reacts to everything else.',
      'A dermatologist walks through the science of ceramides in 60 seconds. Save this one.',
      'The waitlist is open. Early members get the launch price and a mini cleanser on us.',
      'Layer it under SPF in the morning, over moisturiser at night. That is the whole routine.',
      'Made without the 12 irritants sensitive skin dreads. Read the full list on the page.',
    ],
    captions: [
      'Barrier repair, backed by science.',
      'Dermatologist-formulated, fragrance-free.',
      'Five ingredients, zero guesswork.',
      'Barrier 101, saved for later.',
      '28-day results from real testers.',
      'Fragrance-free, on purpose.',
      'Ceramides, explained in 60 seconds.',
      'Waitlist perks inside.',
      'Two steps, morning and night.',
      'Made without 12 known irritants.',
    ],
  },
]

// Fixed 10-slot asset template guarantees a realistic platform/kind/status spread.
const ASSET_SLOTS = [
  { platform: 'INSTAGRAM', kind: 'POST', status: 'PUBLISHED' },
  { platform: 'INSTAGRAM', kind: 'CAPTION', status: 'APPROVED' },
  { platform: 'FACEBOOK', kind: 'POST', status: 'SCHEDULED' },
  { platform: 'FACEBOOK', kind: 'AD_COPY', status: 'NEEDS_REVIEW' },
  { platform: 'LINKEDIN', kind: 'POST', status: 'GENERATED' },
  { platform: 'X', kind: 'POST', status: 'APPROVED' },
  { platform: 'GOOGLE', kind: 'AD_HEADLINE', status: 'NEEDS_REVIEW' },
  { platform: 'GOOGLE', kind: 'AD_DESCRIPTION', status: 'GENERATED' },
  { platform: 'INSTAGRAM', kind: 'REEL', status: 'SCHEDULED' },
  { platform: 'INSTAGRAM', kind: 'STORY', status: 'PUBLISHED' },
] as const

const SOCIAL_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X'] as const

const CONV_CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS', 'WEB_CHAT', 'EMAIL', 'WHATSAPP'] as const
const CONV_SUBJECTS = [
  'Re: Festive campaign assets',
  'Quick question on delivery timing',
  'Spring bundle pricing',
  'Loving the new serum concepts',
  'Invoice for September',
  'Can we move the review call?',
]
const INBOUND_MSGS = [
  'Hi! Just reviewed the latest drafts — the second reel is perfect. Can we push it live this week?',
  'Thanks for the quick turnaround. One small tweak on the CTA and we are good to go.',
  'What is the last date to lock creative for the festive push?',
  'The team loved the direction. Sending feedback on the captions shortly.',
]
const OUTBOUND_MSGS = [
  'Great to hear! I will schedule it for Thursday morning and share the preview link.',
  'Done — updated the CTA and re-exported. You will see it in the review board.',
  'We need final sign-off by Friday to guarantee the launch date. I will send a checklist.',
  'Perfect, standing by for the notes. Happy to hop on a quick call if easier.',
]

const TICKET_SUBJECTS = [
  'Ad account disconnected from Meta',
  'Export of the September report is failing',
  'Need admin access for a new team member',
  'Landing page form not sending submissions',
  'Billing question about last invoice',
  'Request: add TikTok as a channel',
]
const TICKET_BODIES = [
  'Our Meta ad account shows as disconnected in the dashboard and campaigns are paused. Can you help reconnect?',
  'When I click export on the analytics page the download never starts. Tried two browsers.',
  'We onboarded a new performance marketer — please add them with editor access to the workspace.',
  'A few leads mentioned the contact form on our landing page did nothing after submit.',
  'The last invoice looks higher than expected. Could you break down the line items?',
  'We are expanding to TikTok next quarter and would like it enabled as a publishing channel.',
]
const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED', 'OPEN', 'PENDING'] as const
const TICKET_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'URGENT', 'MEDIUM', 'HIGH'] as const

const NOTIFICATIONS = [
  {
    level: 'SUCCESS',
    title: 'Campaign published',
    body: 'Diwali Jewellery Launch is now live across Instagram and Meta.',
  },
  {
    level: 'INFO',
    title: 'New lead captured',
    body: 'A form submission from the Spring Sale landing page created a new lead.',
  },
  {
    level: 'WARNING',
    title: 'Budget pacing high',
    body: 'Smart Home Spring Sale has spent 82% of its budget with 9 days left.',
  },
  {
    level: 'SUCCESS',
    title: 'Assets approved',
    body: '4 assets moved to Approved and are ready to schedule.',
  },
  {
    level: 'INFO',
    title: 'Weekly report ready',
    body: 'Your performance summary for last week is available.',
  },
  {
    level: 'ERROR',
    title: 'Publish failed',
    body: 'One LinkedIn post failed to publish — token may have expired.',
  },
  {
    level: 'INFO',
    title: 'New support ticket',
    body: 'A customer opened a ticket about the landing page form.',
  },
  {
    level: 'SUCCESS',
    title: 'Deal won',
    body: 'The Aurelia festive retainer moved to Won. Nice work!',
  },
] as const

const AI_OPERATIONS = [
  {
    operation: 'campaign.strategy',
    kind: 'LLM',
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-4-5',
    inTok: 4200,
    outTok: 1800,
    cost: 0.031,
  },
  {
    operation: 'content.generate',
    kind: 'LLM',
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-4-5',
    inTok: 2100,
    outTok: 900,
    cost: 0.016,
  },
  {
    operation: 'content.generate',
    kind: 'LLM',
    provider: 'OPENAI',
    model: 'gpt-4o',
    inTok: 1800,
    outTok: 1200,
    cost: 0.019,
  },
  {
    operation: 'email.draft',
    kind: 'LLM',
    provider: 'ANTHROPIC',
    model: 'claude-haiku-4-5',
    inTok: 1500,
    outTok: 700,
    cost: 0.004,
  },
  {
    operation: 'lead.score',
    kind: 'LLM',
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    inTok: 900,
    outTok: 120,
    cost: 0.001,
  },
  {
    operation: 'image.generate',
    kind: 'IMAGE',
    provider: 'IDEOGRAM',
    model: 'ideogram-v2',
    inTok: 0,
    outTok: 0,
    cost: 0.08,
  },
  {
    operation: 'image.generate',
    kind: 'IMAGE',
    provider: 'STABILITY',
    model: 'sd3-large',
    inTok: 0,
    outTok: 0,
    cost: 0.06,
  },
  {
    operation: 'chat.reply',
    kind: 'LLM',
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-4-5',
    inTok: 3200,
    outTok: 640,
    cost: 0.014,
  },
  {
    operation: 'seo.brief',
    kind: 'LLM',
    provider: 'GOOGLE',
    model: 'gemini-2.0-flash',
    inTok: 2600,
    outTok: 1100,
    cost: 0.008,
  },
  {
    operation: 'transcription',
    kind: 'TRANSCRIPTION',
    provider: 'DEEPGRAM',
    model: 'nova-2',
    inTok: 0,
    outTok: 0,
    cost: 0.012,
  },
] as const

// ─── seeding ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']
  if (!url) throw new Error('Set DATABASE_URL or DIRECT_DATABASE_URL')
  const db = createAdminClient(url)

  const summary: {
    org: string
    counts?: Record<string, number>
    skipped?: string
    error?: string
  }[] = []

  try {
    const orgs = await db.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, slug: true },
    })
    console.log(`Found ${String(orgs.length)} organisation(s).`)

    for (const org of orgs) {
      if (looksLikeFixture(org.slug, org.id)) {
        console.log(`  skip (fixture): ${org.name} [${org.slug}]`)
        summary.push({ org: org.name, skipped: 'fixture slug' })
        continue
      }

      const existing = await db.contact.count({ where: { organizationId: org.id } })
      if (existing > 5) {
        console.log(`  skip (already seeded): ${org.name} — ${String(existing)} contacts`)
        summary.push({ org: org.name, skipped: 'already has data' })
        continue
      }

      try {
        const counts = await seedOrg(db, org.id)
        summary.push({ org: org.name, counts })
        console.log(`  seeded ${org.name}:`, counts)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  FAILED ${org.name}: ${msg}`)
        summary.push({ org: org.name, error: msg })
      }
    }

    console.log('\n──────── Seed summary ────────')
    for (const s of summary) {
      if (s.skipped) console.log(`  · ${s.org}: skipped (${s.skipped})`)
      else if (s.error) console.log(`  · ${s.org}: ERROR — ${s.error}`)
      else console.log(`  · ${s.org}: OK`)
    }
    const seeded = summary.filter((s) => s.counts).length
    console.log(`Done. Seeded ${String(seeded)} organisation(s).`)
  } finally {
    await db.$disconnect()
  }
}

// The admin client is RLS-exempt and untyped enough that inlining the model calls
// keeps this readable. `db` is typed as PrismaClient by createAdminClient.
type Db = ReturnType<typeof createAdminClient>

async function seedOrg(db: Db, organizationId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  // A member user to attribute ownership/authorship to (all such FKs are optional).
  const member = await db.membership.findFirst({
    where: { organizationId },
    select: { userId: true },
  })
  const userId: string | null = member?.userId ?? null

  // ── Companies ──────────────────────────────────────────────────────────────
  const companyIds = COMPANIES.map(() => randomUUID())
  await db.company.createMany({
    data: COMPANIES.map((c, i) => ({
      id: companyIds[i],
      organizationId,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      tags: ['client'],
    })),
  })
  counts['companies'] = COMPANIES.length

  // ── Contacts ───────────────────────────────────────────────────────────────
  const CONTACT_N = 20
  const contactIds = Array.from({ length: CONTACT_N }, () => randomUUID())
  await db.contact.createMany({
    data: Array.from({ length: CONTACT_N }, (_, i) => {
      const first = pick(FIRST_NAMES, i)
      const last = pick(LAST_NAMES, i)
      const domain = pick(COMPANIES, i).domain
      return {
        id: contactIds[i],
        organizationId,
        companyId: i % 3 === 0 ? null : companyIds[i % companyIds.length],
        ownerId: userId,
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}.${String(i)}@${domain}`,
        phone: `+1415555${String(1000 + i).padStart(4, '0')}`,
        jobTitle: pick(JOB_TITLES, i),
        emailOptIn: i % 2 === 0,
        tags: pick(CONTACT_TAGS, i),
      }
    }),
  })
  counts['contacts'] = CONTACT_N

  // ── Leads ──────────────────────────────────────────────────────────────────
  const LEAD_N = 12
  await db.lead.createMany({
    data: Array.from({ length: LEAD_N }, (_, i) => {
      const status = pick(LEAD_STATUSES, i)
      return {
        id: randomUUID(),
        organizationId,
        contactId: i % 4 === 0 ? null : contactIds[i % contactIds.length],
        companyId: i % 3 === 0 ? companyIds[i % companyIds.length] : null,
        ownerId: userId,
        status,
        score: 10 + ((i * 7) % 90),
        source: pick(LEAD_SOURCES, i),
        medium: pick(LEAD_MEDIUMS, i),
        value: 2000 + i * 850,
        qualificationReason:
          status === 'QUALIFIED' ? 'Budget confirmed and timeline within the quarter.' : null,
        scoredAt: daysAgo(i),
        lastContactedAt: daysAgo(i % 6),
        convertedAt: status === 'CONVERTED' ? daysAgo(i) : null,
        tags: ['demo'],
      }
    }),
  })
  counts['leads'] = LEAD_N

  // ── Deals (against the org's real default pipeline + stages) ────────────────
  const pipeline = await db.pipeline.findFirst({
    where: { organizationId, deletedAt: null },
    include: { stages: { orderBy: { position: 'asc' } } },
    orderBy: { isDefault: 'desc' },
  })
  if (pipeline && pipeline.stages.length > 0) {
    const DEAL_N = 10
    const DEAL_TITLES = [
      'Aurelia festive retainer',
      'NestPoint spring performance',
      'Lumiere launch campaign',
      'Verdant brand refresh',
      'Peak & Pine paid social',
      'Saffron Table local SEO',
      'Cobalt Fitness membership drive',
      'Harbor & Co listings ads',
      'Aurelia lookbook production',
      'NestPoint always-on retainer',
    ]
    await db.deal.createMany({
      data: Array.from({ length: DEAL_N }, (_, i) => {
        const stage = pipeline.stages[i % pipeline.stages.length]
        const status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN'
        const closed = stage.isWon || stage.isLost
        return {
          id: randomUUID(),
          organizationId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: contactIds[i % contactIds.length],
          companyId: companyIds[i % companyIds.length],
          ownerId: userId,
          title: pick(DEAL_TITLES, i),
          value: 5000 + i * 3200,
          currency: 'USD',
          status,
          probability: stage.probability,
          expectedCloseDate: daysAhead(7 + i * 3),
          closedAt: closed ? daysAgo(i) : null,
          lostReason: stage.isLost ? 'Went with an in-house team.' : null,
          tags: ['demo'],
        }
      }),
    })
    counts['deals'] = DEAL_N
  } else {
    counts['deals'] = 0
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  await db.task.createMany({
    data: TASK_TITLES.map((title, i) => {
      const status = pick(TASK_STATUSES, i)
      return {
        id: randomUUID(),
        organizationId,
        title,
        description: 'Auto-generated demo task for the sales walkthrough.',
        status,
        priority: pick(TASK_PRIORITIES, i),
        dueAt: daysAhead((i % 5) + 1),
        completedAt: status === 'DONE' ? daysAgo(i % 4) : null,
        assigneeId: userId,
        createdById: userId,
      }
    }),
  })
  counts['tasks'] = TASK_TITLES.length

  // ── Notes (on contacts) ─────────────────────────────────────────────────────
  await db.note.createMany({
    data: NOTE_BODIES.map((body, i) => ({
      id: randomUUID(),
      organizationId,
      body,
      authorId: userId,
      contactId: contactIds[i % contactIds.length],
    })),
  })
  counts['notes'] = NOTE_BODIES.length

  // ── Activities ──────────────────────────────────────────────────────────────
  await db.activity.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      id: randomUUID(),
      organizationId,
      type: pick(ACTIVITY_TYPES, i),
      summary: pick(ACTIVITY_SUMMARIES, i),
      body: 'Logged during the demo seed for timeline realism.',
      actorType: userId ? 'USER' : 'SYSTEM',
      userId,
      contactId: contactIds[i % contactIds.length],
      occurredAt: daysAgo(i),
    })),
  })
  counts['activities'] = 10

  // ── Appointments ────────────────────────────────────────────────────────────
  const APPT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'SCHEDULED', 'NO_SHOW'] as const
  await db.appointment.createMany({
    data: Array.from({ length: 5 }, (_, i) => {
      const start = daysAhead(i + 1)
      const end = new Date(start)
      end.setMinutes(end.getMinutes() + 45)
      return {
        id: randomUUID(),
        organizationId,
        title: pick(
          [
            'Discovery call',
            'Creative review',
            'Quarterly business review',
            'Kickoff meeting',
            'Strategy workshop',
          ],
          i,
        ),
        description: 'Demo appointment.',
        status: pick(APPT_STATUSES, i),
        startsAt: start,
        endsAt: end,
        timezone: 'America/Los_Angeles',
        location: i % 2 === 0 ? 'Google Meet' : 'Office — Suite 400',
        meetingUrl: 'https://meet.example.com/demo-' + String(i),
        hostId: userId,
        contactId: contactIds[i % contactIds.length],
      }
    }),
  })
  counts['appointments'] = 5

  // ── Campaigns + assets ───────────────────────────────────────────────────────
  const campaignIds = BRAND_PACKS.map(() => randomUUID())
  const CAMPAIGN_STATUSES = ['ACTIVE', 'ACTIVE', 'SCHEDULED'] as const
  await db.campaign.createMany({
    data: BRAND_PACKS.map((p, i) => ({
      id: campaignIds[i],
      organizationId,
      name: p.campaignName,
      description: p.description,
      objective: p.objective,
      status: pick(CAMPAIGN_STATUSES, i),
      budgetTotal: p.budget,
      budgetSpent: Math.round(p.budget * 0.4),
      currency: 'USD',
      startsAt: daysAgo(14),
      endsAt: daysAhead(14),
      strategy: p.strategy,
      targetAudience: p.audience,
      tags: ['demo'],
    })),
  })
  counts['campaigns'] = BRAND_PACKS.length

  let assetCount = 0
  for (let c = 0; c < BRAND_PACKS.length; c++) {
    const p = BRAND_PACKS[c]
    await db.campaignAsset.createMany({
      data: ASSET_SLOTS.map((slot, i) => {
        const isPublished = slot.status === 'PUBLISHED'
        const isScheduled = slot.status === 'SCHEDULED'
        return {
          id: randomUUID(),
          organizationId,
          campaignId: campaignIds[c],
          platform: slot.platform,
          kind: slot.kind,
          status: slot.status,
          title: `${p.campaignName} — ${slot.platform} ${slot.kind}`,
          body: pick(p.bodies, i),
          caption: pick(p.captions, i),
          hashtags: p.hashtags,
          cta: pick(p.ctas, i),
          ownerId: userId,
          reviewerId: slot.status === 'APPROVED' || slot.status === 'PUBLISHED' ? userId : null,
          scheduledFor: isScheduled ? daysAhead((i % 5) + 1) : null,
          publishedAt: isPublished ? daysAgo((i % 5) + 1) : null,
          externalPostId: isPublished ? `demo-post-${String(c)}-${String(i)}` : null,
        }
      }),
    })
    assetCount += ASSET_SLOTS.length
  }
  counts['campaignAssets'] = assetCount

  // ── Email campaigns ──────────────────────────────────────────────────────────
  const EMAIL_CAMPAIGNS = [
    {
      name: 'Diwali Early Access',
      subject: 'Your festive edit is here ✨',
      preheader: 'First look at the 22k gold collection',
      status: 'COMPLETED',
      recip: 8400,
    },
    {
      name: 'Spring Sale — Free Install',
      subject: 'Free installation ends Sunday',
      preheader: 'Bundle three devices, we set it all up',
      status: 'ACTIVE',
      recip: 12600,
    },
    {
      name: 'Skincare Waitlist Invite',
      subject: 'You’re on the list — perks inside',
      preheader: 'Launch price + a mini cleanser on us',
      status: 'SCHEDULED',
      recip: 5200,
    },
    {
      name: 'Monthly Newsletter — July',
      subject: 'What we shipped this month',
      preheader: 'New features, case studies and tips',
      status: 'DRAFT',
      recip: 0,
    },
  ] as const
  await db.emailCampaign.createMany({
    data: EMAIL_CAMPAIGNS.map((e, i) => {
      const sent = e.status === 'COMPLETED' || e.status === 'ACTIVE'
      const sentCount = sent ? e.recip : 0
      const delivered = Math.round(sentCount * 0.98)
      const opens = Math.round(delivered * 0.42)
      const clicks = Math.round(opens * 0.18)
      return {
        id: randomUUID(),
        organizationId,
        campaignId: i < BRAND_PACKS.length ? campaignIds[i] : null,
        name: e.name,
        subject: e.subject,
        preheader: e.preheader,
        fromName: 'The Growth Team',
        fromEmail: 'hello@agency.example.com',
        status: e.status,
        recipientCount: e.recip,
        sentCount,
        deliveredCount: delivered,
        openCount: opens,
        clickCount: clicks,
        bounceCount: Math.round(sentCount * 0.015),
        unsubscribeCount: Math.round(sentCount * 0.003),
        sentAt: sent ? daysAgo(i + 2) : null,
        scheduledAt: e.status === 'SCHEDULED' ? daysAhead(i + 1) : null,
      }
    }),
  })
  counts['emailCampaigns'] = EMAIL_CAMPAIGNS.length

  // ── Social accounts + posts ──────────────────────────────────────────────────
  const socialAccountIds = SOCIAL_PLATFORMS.map(() => randomUUID())
  await db.socialAccount.createMany({
    data: SOCIAL_PLATFORMS.map((platform, i) => {
      const handle = pick(
        ['aurelia.jewels', 'nestpoint.home', 'lumiere.skin', 'thegrowthagency'],
        i,
      )
      return {
        id: socialAccountIds[i],
        organizationId,
        platform,
        status: 'CONNECTED',
        externalId: `demo:${platform}:${handle}`,
        handle,
        displayName: pick(
          [
            'Aurelia Fine Jewellery',
            'NestPoint Smart Home',
            'Lumiere Skincare',
            'The Growth Agency',
          ],
          i,
        ),
        followerCount: 8000 + i * 4200,
        lastSyncedAt: hoursAgo(i + 1),
      }
    }),
  })
  counts['socialAccounts'] = SOCIAL_PLATFORMS.length

  const SOCIAL_POST_STATUSES = [
    'PUBLISHED',
    'SCHEDULED',
    'DRAFT',
    'PUBLISHED',
    'PUBLISHING',
  ] as const
  let socialTargetCount = 0
  for (let i = 0; i < 5; i++) {
    const status = pick(SOCIAL_POST_STATUSES, i)
    const pack = pick(BRAND_PACKS, i)
    const postId = randomUUID()
    const isPublished = status === 'PUBLISHED'
    await db.socialPost.create({
      data: {
        id: postId,
        organizationId,
        campaignId: campaignIds[i % campaignIds.length],
        status,
        body: pick(pack.bodies, i),
        hashtags: pack.hashtags,
        scheduledAt: status === 'SCHEDULED' ? daysAhead(i + 1) : null,
        publishedAt: isPublished ? daysAgo(i + 1) : null,
      },
    })
    const accountId = socialAccountIds[i % socialAccountIds.length]
    await db.socialPostTarget.create({
      data: {
        id: randomUUID(),
        postId,
        socialAccountId: accountId,
        status,
        permalink: isPublished ? `https://social.example.com/p/demo-${String(i)}` : null,
        externalPostId: isPublished ? `demo-social-${String(i)}` : null,
        publishedAt: isPublished ? daysAgo(i + 1) : null,
        impressions: isPublished ? 12000 + i * 3400 : 0,
        likes: isPublished ? 640 + i * 120 : 0,
        comments: isPublished ? 48 + i * 9 : 0,
        shares: isPublished ? 22 + i * 5 : 0,
        clicks: isPublished ? 310 + i * 60 : 0,
        lastMetricsSyncAt: isPublished ? hoursAgo(i + 1) : null,
      },
    })
    socialTargetCount++
  }
  counts['socialPosts'] = 5
  counts['socialPostTargets'] = socialTargetCount

  // ── Lead forms + submissions ─────────────────────────────────────────────────
  const formIds = [randomUUID(), randomUUID(), randomUUID()]
  const FORM_FIELDS = [
    { key: 'name', label: 'Full name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'tel', required: false },
    { key: 'message', label: 'How can we help?', type: 'textarea', required: false },
  ]
  const FORMS = [
    {
      name: 'Festive Gifting Enquiry',
      slug: 'festive-gifting',
      status: 'PUBLISHED',
      headline: 'Book a styling appointment',
      submit: 32,
    },
    {
      name: 'Spring Sale — Get a Quote',
      slug: 'spring-sale-quote',
      status: 'DRAFT',
      headline: 'Build your smart home bundle',
      submit: 0,
    },
    {
      name: 'Skincare Waitlist',
      slug: 'skincare-waitlist',
      status: 'PUBLISHED',
      headline: 'Join the barrier-repair waitlist',
      submit: 61,
    },
  ] as const
  await db.leadForm.createMany({
    data: FORMS.map((f, i) => ({
      id: formIds[i],
      organizationId,
      name: f.name,
      slug: f.slug,
      status: f.status,
      fields: FORM_FIELDS,
      headline: f.headline,
      description:
        'Tell us a little about what you are looking for and we will be in touch within one business day.',
      submitLabel: 'Send',
      successMessage: 'Thanks! We will be in touch shortly.',
      accentColor: pick(['#B8860B', '#2563EB', '#EC4899'], i),
      ownerId: userId,
      tags: ['demo'],
      submitCount: f.submit,
    })),
  })
  counts['leadForms'] = FORMS.length

  const publishedFormId = formIds[0]
  await db.formSubmission.createMany({
    data: Array.from({ length: 8 }, (_, i) => {
      const first = pick(FIRST_NAMES, i + 3)
      return {
        id: randomUUID(),
        organizationId,
        formId: i % 2 === 0 ? publishedFormId : formIds[2],
        data: {
          name: `${first} ${pick(LAST_NAMES, i + 3)}`,
          email: `${first.toLowerCase()}${String(i)}@example.com`,
          phone: `+1415555${String(2000 + i).padStart(4, '0')}`,
          message: pick(
            [
              'Interested in a festive gifting appointment for two necklaces.',
              'Please add me to the skincare waitlist.',
              'Want a quote for a 3-room smart home setup.',
              'Do you ship internationally before Diwali?',
            ],
            i,
          ),
        },
        contactId: i % 3 === 0 ? contactIds[i % contactIds.length] : null,
        ipAddress: '203.0.113.' + String(10 + i),
        userAgent: 'Mozilla/5.0 (demo seed)',
        referrer: 'https://www.instagram.com/',
        createdAt: daysAgo(i),
      }
    }),
  })
  counts['formSubmissions'] = 8

  // ── Landing pages ────────────────────────────────────────────────────────────
  const LANDING = [
    {
      name: 'Diwali Festive Edit',
      slug: 'diwali-festive-edit',
      status: 'PUBLISHED',
      title: 'The Aurelia Festive Edit',
      visits: 4820,
    },
    {
      name: 'Smart Home Spring Sale',
      slug: 'smart-home-spring',
      status: 'PUBLISHED',
      title: 'Spring Sale — Free Installation',
      visits: 9130,
    },
    {
      name: 'Lumiere Waitlist',
      slug: 'lumiere-waitlist',
      status: 'DRAFT',
      title: 'Barrier Repair Serum — Waitlist',
      visits: 0,
    },
  ] as const
  await db.landingPage.createMany({
    data: LANDING.map((l, i) => ({
      id: randomUUID(),
      organizationId,
      name: l.name,
      slug: l.slug,
      status: l.status,
      title: l.title,
      blocks: [
        {
          type: 'hero',
          headline: l.title,
          subhead: pick(BRAND_PACKS, i).objective,
          cta: pick(pick(BRAND_PACKS, i).ctas, 0),
        },
        {
          type: 'features',
          items: ['Handpicked selection', 'Fast, tracked delivery', 'Dedicated support'],
        },
        { type: 'cta', label: pick(pick(BRAND_PACKS, i).ctas, 1) },
      ],
      seoTitle: l.title,
      seoDescription: pick(BRAND_PACKS, i).description,
      formId: i === 0 ? publishedFormId : null,
      visitCount: l.visits,
      publishedAt: l.status === 'PUBLISHED' ? daysAgo(10 + i) : null,
    })),
  })
  counts['landingPages'] = LANDING.length

  // ── Workflows (+ version, runs, run steps) ───────────────────────────────────
  const WORKFLOWS = [
    {
      name: 'New lead welcome',
      trigger: 'lead.created',
      desc: 'Tag, score and send a welcome email when a lead is captured.',
    },
    {
      name: 'Abandoned enquiry nudge',
      trigger: 'form.submitted',
      desc: 'Wait a day, then follow up on unconverted form submissions.',
    },
    {
      name: 'Weekly performance digest',
      trigger: 'schedule.weekly',
      desc: 'Compile channel metrics and email a summary every Monday.',
    },
  ]
  let runCount = 0
  let stepCount = 0
  for (let w = 0; w < WORKFLOWS.length; w++) {
    const wf = WORKFLOWS[w]
    const workflowId = randomUUID()
    const versionId = randomUUID()
    const graph = {
      nodes: [
        { id: 'trigger', type: 'trigger', event: wf.trigger },
        { id: 'action-1', type: 'action', op: 'tag' },
        { id: 'action-2', type: 'action', op: 'send_email' },
      ],
      edges: [
        { from: 'trigger', to: 'action-1' },
        { from: 'action-1', to: 'action-2' },
      ],
    }
    await db.workflow.create({
      data: {
        id: workflowId,
        organizationId,
        name: wf.name,
        description: wf.desc,
        status: 'ACTIVE',
        triggerType: wf.trigger,
        triggerConfig: { event: wf.trigger },
        activeVersion: 1,
        runCount: 3,
        successCount: 2,
        failureCount: 1,
        lastRunAt: hoursAgo(w + 2),
        versions: { create: { id: versionId, version: 1, graph } },
      },
    })

    const RUN_STATUSES = ['SUCCEEDED', 'SUCCEEDED', 'FAILED'] as const
    for (let r = 0; r < 3; r++) {
      const status = RUN_STATUSES[r]
      const runId = randomUUID()
      const started = hoursAgo(w * 6 + r + 1)
      const completed = new Date(started)
      completed.setSeconds(completed.getSeconds() + 12)
      await db.workflowRun.create({
        data: {
          id: runId,
          organizationId,
          workflowId,
          versionId,
          status,
          triggeredBy: 'SYSTEM',
          triggerPayload: { source: 'demo-seed' },
          error: status === 'FAILED' ? 'Email provider timed out.' : null,
          startedAt: started,
          completedAt: completed,
          durationMs: 12000,
          steps: {
            create: [
              {
                id: randomUUID(),
                nodeId: 'action-1',
                position: 0,
                status: 'SUCCEEDED',
                startedAt: started,
                completedAt: started,
                durationMs: 400,
              },
              {
                id: randomUUID(),
                nodeId: 'action-2',
                position: 1,
                status: status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
                error: status === 'FAILED' ? 'Email provider timed out.' : null,
                startedAt: started,
                completedAt: completed,
                durationMs: 11600,
              },
            ],
          },
        },
      })
      runCount++
      stepCount += 2
    }
  }
  counts['workflows'] = WORKFLOWS.length
  counts['workflowRuns'] = runCount
  counts['workflowRunSteps'] = stepCount

  // ── Conversations + messages ─────────────────────────────────────────────────
  let messageCount = 0
  for (let i = 0; i < 6; i++) {
    const channel = pick(CONV_CHANNELS, i)
    const conversationId = randomUUID()
    // Build 4 messages, alternating inbound/outbound, oldest first.
    const msgs = Array.from({ length: 4 }, (_, m) => {
      const inbound = m % 2 === 0
      return {
        id: randomUUID(),
        organizationId,
        conversationId,
        direction: inbound ? 'INBOUND' : 'OUTBOUND',
        status: inbound ? 'DELIVERED' : 'SENT',
        body: inbound ? pick(INBOUND_MSGS, m) : pick(OUTBOUND_MSGS, m),
        sentAt: hoursAgo((4 - m) * 3 + i * 24),
        deliveredAt: hoursAgo((4 - m) * 3 + i * 24),
      } as const
    })
    const last = msgs[msgs.length - 1]
    await db.conversation.create({
      data: {
        id: conversationId,
        organizationId,
        channel,
        contactId: contactIds[i % contactIds.length],
        externalId: `demo:${channel}:${String(i)}`,
        subject: pick(CONV_SUBJECTS, i),
        lastMessageAt: last.sentAt,
        lastMessagePreview: (last.body ?? '').slice(0, 120),
        unreadCount: i % 3 === 0 ? 2 : 0,
        isOpen: i % 4 !== 0,
      },
    })
    await db.message.createMany({ data: msgs.map((m) => ({ ...m })) })
    messageCount += msgs.length
  }
  counts['conversations'] = 6
  counts['messages'] = messageCount

  // ── Support tickets + comments ───────────────────────────────────────────────
  let commentCount = 0
  for (let i = 0; i < 6; i++) {
    const status = pick(TICKET_STATUSES, i)
    const ticketId = randomUUID()
    await db.supportTicket.create({
      data: {
        id: ticketId,
        organizationId,
        subject: pick(TICKET_SUBJECTS, i),
        body: pick(TICKET_BODIES, i),
        status,
        priority: pick(TICKET_PRIORITIES, i),
        requesterId: userId,
        requesterEmail: `customer${String(i)}@example.com`,
        assigneeId: userId,
        contactId: contactIds[i % contactIds.length],
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? daysAgo(i) : null,
      },
    })
    if (i < 2) {
      await db.supportTicketComment.createMany({
        data: [
          {
            id: randomUUID(),
            organizationId,
            ticketId,
            authorId: userId,
            body: 'Thanks for flagging — taking a look now.',
            internal: false,
          },
          {
            id: randomUUID(),
            organizationId,
            ticketId,
            authorId: userId,
            body: 'Root cause identified, deploying a fix shortly.',
            internal: true,
          },
        ],
      })
      commentCount += 2
    }
  }
  counts['supportTickets'] = 6
  counts['supportTicketComments'] = commentCount

  // ── Notifications ────────────────────────────────────────────────────────────
  await db.notification.createMany({
    data: NOTIFICATIONS.map((n, i) => ({
      id: randomUUID(),
      organizationId,
      userId,
      level: n.level,
      title: n.title,
      body: n.body,
      actionUrl: '/dashboard',
      readAt: i % 3 === 0 ? null : daysAgo(i),
      createdAt: daysAgo(i),
    })),
  })
  counts['notifications'] = NOTIFICATIONS.length

  // ── Knowledge base + documents (no chunks — vector pipeline owns those) ───────
  const knowledgeBaseId = randomUUID()
  await db.knowledgeBase.create({
    data: {
      id: knowledgeBaseId,
      organizationId,
      name: 'Brand & Playbook',
      description: 'Brand guidelines, tone of voice and campaign playbooks used by the AI agents.',
      documentCount: 3,
    },
  })
  const KB_DOCS = [
    {
      title: 'Brand Voice Guidelines',
      content:
        'Our tone is warm, confident and specific. We avoid hype and jargon. We lead with the customer benefit, back claims with proof, and keep sentences short. Never use exclamation stacks or all-caps.',
    },
    {
      title: 'Festive Campaign Playbook',
      content:
        'Festive pushes run for three weeks. Week one builds desire with lookbook content, week two drives gifting bundles, week three creates urgency with the last-shipping-date countdown. Always include free resizing and keepsake packaging.',
    },
    {
      title: 'Paid Social Best Practices',
      content:
        'Hook in the first three seconds. Show the product in use, not just on white. Caption for sound-off. Test three creatives per ad set and cut the bottom performer after 48 hours or 1,000 impressions.',
    },
  ]
  await db.knowledgeDocument.createMany({
    data: KB_DOCS.map((d) => ({
      id: randomUUID(),
      organizationId,
      knowledgeBaseId,
      title: d.title,
      sourceType: 'TEXT',
      content: d.content,
      status: 'READY',
      chunkCount: 0,
      indexedAt: daysAgo(3),
    })),
  })
  counts['knowledgeDocuments'] = KB_DOCS.length

  // ── Metric dailies (last 30 days, trending upward) — powers the charts ────────
  await db.metricDaily.createMany({
    data: Array.from({ length: 30 }, (_, k) => {
      // k = 0 is 29 days ago, k = 29 is today; values trend up over time.
      const t = k
      const wobble = k % 7 === 5 || k % 7 === 6 ? 0.85 : 1 // weekends dip a little
      const impressions = Math.round((4000 + t * 190) * wobble)
      const clicks = Math.round(impressions * 0.032)
      const sessions = Math.round(clicks * 0.9)
      const leads = Math.round(clicks * 0.08)
      const conversions = Math.round(leads * 0.22)
      const spend = Math.round((120 + t * 6) * wobble)
      const revenue = Math.round(spend * (2.2 + t * 0.03))
      return {
        id: randomUUID(),
        organizationId,
        date: dateOnlyAgo(29 - k),
        channel: null,
        campaignId: null,
        impressions,
        clicks,
        sessions,
        leads,
        conversions,
        spend,
        revenue,
      }
    }),
  })
  counts['metricDaily'] = 30

  // ── AI usage (recent, varied) — powers the AI-usage analytics page ────────────
  const AI_N = 15
  await db.aiUsage.createMany({
    data: Array.from({ length: AI_N }, (_, i) => {
      const op = pick(AI_OPERATIONS, i)
      return {
        id: randomUUID(),
        organizationId,
        userId,
        kind: op.kind,
        provider: op.provider,
        model: op.model,
        operation: op.operation,
        inputTokens: op.inTok,
        outputTokens: op.outTok,
        cachedTokens: Math.round(op.inTok * 0.25),
        units: op.kind === 'IMAGE' ? 1 : 0,
        costUsd: op.cost,
        latencyMs: 600 + (i % 5) * 350,
        succeeded: i % 9 !== 0,
        errorCode: i % 9 === 0 ? 'rate_limited' : null,
        createdAt: daysAgo(i % 14),
      }
    }),
  })
  counts['aiUsage'] = AI_N

  return counts
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
