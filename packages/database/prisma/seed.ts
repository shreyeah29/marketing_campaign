/**
 * Development and demo seed.
 *
 * Runs as the database OWNER via DIRECT_DATABASE_URL. The owner is exempt from
 * row-level security, which is precisely why seeding works and why the running
 * application must never use this connection string.
 *
 * Idempotent: safe to run repeatedly. Every write is an upsert on a stable key.
 */

import { randomUUID } from 'node:crypto'

import {
  AgentId,
  AiProvider,
  CampaignStatus,
  ChannelType,
  ContentStatus,
  ContentType,
  ConversationChannel,
  GenerationStatus,
  LeadStatus,
  MediaType,
  MemberRole,
  MessageDirection,
  MessageStatus,
  PlanTier,
  Priority,
  PrismaClient,
  ProviderKind,
  RunStatus,
  SocialPostStatus,
  SubscriptionStatus,
  TaskStatus,
  WorkflowStatus,
} from '../src/index.js'

const connectionString = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL']

if (!connectionString) {
  throw new Error(
    'Seeding requires DIRECT_DATABASE_URL (the owner connection). Refusing to run without it.',
  )
}

const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } })

const ORG_ID = '00000000-0000-7000-8000-000000000001'
const USER_ID = '00000000-0000-7000-8000-000000000002'
const TEAMMATE_ID = '00000000-0000-7000-8000-000000000003'

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000)
const daysAhead = (n: number): Date => new Date(Date.now() + n * 86_400_000)

async function main(): Promise<void> {
  // ── Tenant ────────────────────────────────────────────────────────────────
  const organization = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'VSP Law Associates',
      slug: 'vsp-law',
      industry: 'Legal Services',
      website: 'https://vsplawassociates.com',
      timezone: 'America/Chicago',
    },
  })

  await prisma.organizationSettings.upsert({
    where: { organizationId: ORG_ID },
    update: {},
    create: {
      organizationId: ORG_ID,
      tagline: 'Your Legal Home Away From Home',
      brandVoice: 'Professional, empathetic, authoritative. Plain language over legalese.',
      targetAudience:
        'Non-resident Indians in the United States with property or family matters in India',
      valueProps: [
        'Licensed in both jurisdictions',
        'Fixed-fee consultations, no billable surprises',
        'Documents handled remotely end to end',
      ],
      defaultLlmProvider: AiProvider.ANTHROPIC,
      requireContentApproval: true,
      autonomyLevel: 2,
      monthlyAiBudgetUsd: '400.00',
    },
  })

  await prisma.subscription.upsert({
    where: { organizationId: ORG_ID },
    update: {},
    create: {
      organizationId: ORG_ID,
      tier: PlanTier.GROWTH,
      status: SubscriptionStatus.ACTIVE,
      seats: 5,
      currentPeriodStart: daysAgo(12),
      currentPeriodEnd: daysAhead(18),
      entitlements: {
        aiTokensPerMonth: 20_000_000,
        imagesPerMonth: 500,
        voiceMinutesPerMonth: 600,
        seats: 5,
      },
    },
  })

  // ── People ────────────────────────────────────────────────────────────────
  // Passwords are owned by Better Auth (Phase 6), which writes to Account.
  // No credential is created here, so no seeded password can ship to production.
  const owner = await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: {
      id: USER_ID,
      name: 'Sarah Mitchell',
      email: 'sarah@vsplawassociates.com',
      emailVerified: true,
      jobTitle: 'Head of Marketing',
      timezone: 'America/Chicago',
    },
  })

  const teammate = await prisma.user.upsert({
    where: { id: TEAMMATE_ID },
    update: {},
    create: {
      id: TEAMMATE_ID,
      name: 'Dev Anand',
      email: 'dev@vsplawassociates.com',
      emailVerified: true,
      jobTitle: 'Content Lead',
    },
  })

  for (const [user, role] of [
    [owner, MemberRole.OWNER],
    [teammate, MemberRole.MEMBER],
  ] as const) {
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ID, userId: user.id } },
      update: { role },
      create: { organizationId: ORG_ID, userId: user.id, role },
    })
  }

  // ── Brand ─────────────────────────────────────────────────────────────────
  const brandKit = await prisma.brandKit.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: 'Primary' } },
    update: {},
    create: {
      organizationId: ORG_ID,
      name: 'Primary',
      isDefault: true,
      primaryColor: '#6366f1',
      secondaryColor: '#0f172a',
      accentColors: ['#8b5cf6', '#06b6d4'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      visualStyle: 'Editorial, restrained, generous whitespace. Photography over illustration.',
      toneGuidelines: 'Reassuring and precise. Never alarmist about legal risk.',
      doNotUse: 'Gavels, scales of justice, stock handshakes, courthouse columns.',
    },
  })

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const pipeline = await prisma.pipeline.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: 'NRI Consultations' } },
    update: {},
    create: { organizationId: ORG_ID, name: 'NRI Consultations', isDefault: true },
  })

  const stageDefs = [
    { name: 'Enquiry', position: 1, probability: 10 },
    { name: 'Consultation Booked', position: 2, probability: 35 },
    { name: 'Proposal Sent', position: 3, probability: 60 },
    { name: 'Engaged', position: 4, probability: 100, isWon: true },
    { name: 'Lost', position: 5, probability: 0, isLost: true },
  ]

  const stages = []
  for (const stage of stageDefs) {
    stages.push(
      await prisma.pipelineStage.upsert({
        where: { pipelineId_position: { pipelineId: pipeline.id, position: stage.position } },
        update: {},
        create: { pipelineId: pipeline.id, ...stage },
      }),
    )
  }

  // ── CRM ───────────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { organizationId_domain: { organizationId: ORG_ID, domain: 'techcorp.example' } },
    update: {},
    create: {
      organizationId: ORG_ID,
      name: 'TechCorp Inc',
      domain: 'techcorp.example',
      industry: 'Software',
      size: '200-500',
    },
  })

  const contactDefs = [
    {
      email: 'priya@example.com',
      firstName: 'Priya',
      lastName: 'Sharma',
      phone: '+12145550101',
      status: LeadStatus.QUALIFIED,
      score: 87,
      source: 'Facebook Ad',
      value: '15000.00',
      companyId: null as string | null,
    },
    {
      email: 'rajesh@techcorp.example',
      firstName: 'Rajesh',
      lastName: 'Kumar',
      phone: '+12145550102',
      status: LeadStatus.CONTACTED,
      score: 62,
      source: 'Google Ads',
      value: '8000.00',
      companyId: company.id,
    },
    {
      email: 'anita@example.com',
      firstName: 'Anita',
      lastName: 'Patel',
      phone: '+12145550103',
      status: LeadStatus.NEW,
      score: 45,
      source: 'WhatsApp',
      value: '12000.00',
      companyId: null as string | null,
    },
  ]

  const contacts = []
  for (const def of contactDefs) {
    const contact = await prisma.contact.upsert({
      where: { organizationId_email: { organizationId: ORG_ID, email: def.email } },
      update: {},
      create: {
        organizationId: ORG_ID,
        companyId: def.companyId,
        ownerId: owner.id,
        firstName: def.firstName,
        lastName: def.lastName,
        email: def.email,
        phone: def.phone,
        emailOptIn: true,
        whatsappOptIn: def.source === 'WhatsApp',
        consentSource: def.source,
      },
    })
    contacts.push(contact)

    await prisma.lead.upsert({
      where: { id: `lead-${contact.id}` },
      update: {},
      create: {
        id: `lead-${contact.id}`,
        organizationId: ORG_ID,
        contactId: contact.id,
        companyId: def.companyId,
        ownerId: owner.id,
        status: def.status,
        score: def.score,
        source: def.source,
        value: def.value,
        qualificationReason:
          def.score > 80
            ? 'Owns property in Mumbai, explicit timeline within 30 days, budget confirmed.'
            : null,
        scoredAt: daysAgo(2),
      },
    })
  }

  const [priya, rajesh] = contacts
  if (!priya || !rajesh) throw new Error('Seed contacts missing')

  const enquiryStage = stages[0]
  const bookedStage = stages[1]
  if (!enquiryStage || !bookedStage) throw new Error('Seed stages missing')

  await prisma.deal.upsert({
    where: { id: 'deal-seed-0001' },
    update: {},
    create: {
      id: 'deal-seed-0001',
      organizationId: ORG_ID,
      pipelineId: pipeline.id,
      stageId: bookedStage.id,
      contactId: priya.id,
      ownerId: owner.id,
      title: 'Priya Sharma — Power of Attorney, Mumbai flat',
      value: '15000.00',
      probability: 35,
      expectedCloseDate: daysAhead(21),
    },
  })

  await prisma.task.upsert({
    where: { id: 'task-seed-0001' },
    update: {},
    create: {
      id: 'task-seed-0001',
      organizationId: ORG_ID,
      title: 'Review Q3 Facebook creative before the spend increase',
      status: TaskStatus.TODO,
      priority: Priority.HIGH,
      dueAt: daysAhead(1),
      assigneeId: owner.id,
      createdById: owner.id,
    },
  })

  // ── An agent run, with its delegation tree and cost ledger ────────────────
  // Shaped exactly as the orchestrator will write it, so the dashboard has a
  // realistic run to render before Phase 7 exists.
  const cmoRun = await prisma.agentRun.upsert({
    where: { id: 'run-seed-cmo-0001' },
    update: {},
    create: {
      id: 'run-seed-cmo-0001',
      organizationId: ORG_ID,
      agentId: AgentId.CMO,
      status: RunStatus.SUCCEEDED,
      goal: 'Launch a 90-day campaign targeting NRIs in Dallas needing property legal help',
      initiatedByUserId: owner.id,
      plan: {
        steps: [
          { agent: 'SEO_EXPERT', task: 'Keyword and SERP analysis for NRI property law' },
          { agent: 'COPYWRITER', task: 'Long-form pillar article plus three ad variants' },
          { agent: 'DESIGNER', task: 'Ad creative in brand style' },
          { agent: 'EMAIL_SPECIALIST', task: 'Five-part welcome sequence' },
        ],
      },
      result: { campaignsCreated: 1, assetsCreated: 4, estimatedMonthlyLeads: 150 },
      inputTokens: 18_432,
      outputTokens: 7_218,
      totalCostUsd: '0.412000',
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
      durationMs: 42_318,
    },
  })

  await prisma.agentRunStep.upsert({
    where: { runId_position: { runId: cmoRun.id, position: 1 } },
    update: {},
    create: {
      runId: cmoRun.id,
      position: 1,
      type: 'PLAN',
      status: RunStatus.SUCCEEDED,
      title: 'Decompose the goal into specialist assignments',
      output: { delegations: 4 },
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
      durationMs: 3_142,
    },
  })

  const copywriterRun = await prisma.agentRun.upsert({
    where: { id: 'run-seed-copy-0001' },
    update: {},
    create: {
      id: 'run-seed-copy-0001',
      organizationId: ORG_ID,
      agentId: AgentId.COPYWRITER,
      status: RunStatus.SUCCEEDED,
      goal: 'Write the pillar article: NRI property rights in India',
      parentRunId: cmoRun.id,
      depth: 1,
      initiatedByUserId: owner.id,
      inputTokens: 9_004,
      outputTokens: 4_866,
      totalCostUsd: '0.204000',
      startedAt: daysAgo(3),
      completedAt: daysAgo(3),
      durationMs: 21_004,
    },
  })

  await prisma.toolCall.upsert({
    where: { runId_idempotencyKey: { runId: copywriterRun.id, idempotencyKey: 'seed-tool-0001' } },
    update: {},
    create: {
      runId: copywriterRun.id,
      agentId: AgentId.COPYWRITER,
      toolName: 'content.createDocument',
      status: RunStatus.SUCCEEDED,
      input: { type: 'BLOG_POST', title: 'NRI Property Rights in India: The 2026 Guide' },
      output: { documentId: 'content-seed-0001' },
      permissionChecked: 'content:write',
      idempotencyKey: 'seed-tool-0001',
      durationMs: 812,
    },
  })

  for (const usage of [
    { runId: cmoRun.id, model: 'planning', input: 9_428, output: 2_352, cost: '0.208000' },
    { runId: copywriterRun.id, model: 'drafting', input: 9_004, output: 4_866, cost: '0.204000' },
  ]) {
    await prisma.aiUsage.create({
      data: {
        organizationId: ORG_ID,
        agentRunId: usage.runId,
        userId: owner.id,
        kind: ProviderKind.LLM,
        provider: AiProvider.ANTHROPIC,
        model: usage.model,
        operation: 'chat.completion',
        inputTokens: usage.input,
        outputTokens: usage.output,
        costUsd: usage.cost,
        latencyMs: 4_120,
      },
    })
  }

  // ── Campaign and its artefacts ────────────────────────────────────────────
  const campaign = await prisma.campaign.upsert({
    where: { id: 'campaign-seed-0001' },
    update: {},
    create: {
      id: 'campaign-seed-0001',
      organizationId: ORG_ID,
      name: 'NRI Dallas — Property Legal Q3',
      objective: 'Generate 150 qualified consultations per month',
      status: CampaignStatus.ACTIVE,
      budgetTotal: '15000.00',
      budgetSpent: '6980.00',
      startsAt: daysAgo(28),
      endsAt: daysAhead(62),
      agentRunId: cmoRun.id,
      strategy: {
        positioning: 'The firm that handles Indian property matters without you flying home',
        primaryCta: 'Book a fixed-fee 30-minute consultation',
      },
      targetAudience: { ageRange: '30-55', geo: ['Dallas', 'Plano', 'Irving'], income: '100k+' },
    },
  })

  for (const [channel, budget, spent] of [
    [ChannelType.FACEBOOK, '4500.00', '3840.00'],
    [ChannelType.GOOGLE_ADS, '3200.00', '2760.00'],
    [ChannelType.EMAIL, '480.00', '380.00'],
  ] as const) {
    await prisma.campaignChannel.upsert({
      where: { campaignId_channel: { campaignId: campaign.id, channel } },
      update: {},
      create: { campaignId: campaign.id, channel, budget, spent },
    })
  }

  await prisma.contentDocument.upsert({
    where: { id: 'content-seed-0001' },
    update: {},
    create: {
      id: 'content-seed-0001',
      organizationId: ORG_ID,
      campaignId: campaign.id,
      title: 'NRI Property Rights in India: The 2026 Guide',
      type: ContentType.BLOG_POST,
      status: ContentStatus.IN_REVIEW,
      slug: 'nri-property-rights-india-2026',
      metaDescription:
        'What non-resident Indians need to know about owning, inheriting and selling property in India.',
      keywords: ['nri property rights', 'nri legal help', 'power of attorney india'],
      seoScore: 82,
      authorId: teammate.id,
      generatedBy: AgentId.COPYWRITER,
      agentRunId: copywriterRun.id,
      plainText:
        'Owning property in India while living abroad creates three recurring problems: title verification, ' +
        'lawful repatriation of sale proceeds, and executing documents without travelling.',
      body: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'NRI Property Rights in India' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Owning property in India while living abroad creates three recurring problems.',
              },
            ],
          },
        ],
      },
    },
  })

  await prisma.mediaAsset.upsert({
    where: { id: 'media-seed-0001' },
    update: {},
    create: {
      id: 'media-seed-0001',
      organizationId: ORG_ID,
      brandKitId: brandKit.id,
      type: MediaType.IMAGE,
      status: GenerationStatus.READY,
      title: 'NRI Property Guide — lead magnet cover',
      altText: 'Editorial cover image for the NRI property rights guide',
      storageKey: `${ORG_ID}/media/seed-cover.png`,
      mimeType: 'image/png',
      width: 1080,
      height: 1080,
      prompt: 'Editorial cover, warm neutral palette, generous whitespace, no legal cliches',
      generatedBy: AgentId.DESIGNER,
      generatorProvider: AiProvider.IDEOGRAM,
      uploadedById: owner.id,
    },
  })

  await prisma.socialPost.upsert({
    where: { id: 'social-seed-0001' },
    update: {},
    create: {
      id: 'social-seed-0001',
      organizationId: ORG_ID,
      campaignId: campaign.id,
      status: SocialPostStatus.SCHEDULED,
      body: 'Five documents every NRI should have in place before selling property in India. Thread ↓',
      hashtags: ['NRI', 'PropertyLaw', 'India'],
      scheduledAt: daysAhead(2),
      generatedBy: AgentId.COPYWRITER,
    },
  })

  await prisma.emailCampaign.upsert({
    where: { id: 'email-seed-0001' },
    update: {},
    create: {
      id: 'email-seed-0001',
      organizationId: ORG_ID,
      campaignId: campaign.id,
      name: 'NRI Welcome Series — Email 1',
      subject: 'Your NRI property questions, answered',
      status: CampaignStatus.ACTIVE,
      fromName: 'VSP Law Associates',
      fromEmail: 'hello@vsplawassociates.com',
      generatedBy: AgentId.EMAIL_SPECIALIST,
      recipientCount: 1_240,
      sentCount: 1_240,
      deliveredCount: 1_216,
      openCount: 501,
      clickCount: 159,
      bounceCount: 24,
      sentAt: daysAgo(6),
    },
  })

  // ── A WhatsApp conversation ───────────────────────────────────────────────
  const conversation = await prisma.conversation.upsert({
    where: {
      organizationId_channel_externalId: {
        organizationId: ORG_ID,
        channel: ConversationChannel.WHATSAPP,
        externalId: 'wa-seed-0001',
      },
    },
    update: {},
    create: {
      organizationId: ORG_ID,
      channel: ConversationChannel.WHATSAPP,
      externalId: 'wa-seed-0001',
      contactId: priya.id,
      lastMessageAt: daysAgo(1),
      lastMessagePreview: 'Yes, I need a POA for my Mumbai flat',
      unreadCount: 1,
      assignedTo: AgentId.WHATSAPP_AGENT,
    },
  })

  const thread = [
    { direction: MessageDirection.INBOUND, body: 'Hi, I saw your ad about NRI property help' },
    {
      direction: MessageDirection.OUTBOUND,
      body: 'Namaste! Happy to help. Are you looking to sell, inherit, or grant authority to someone in India?',
      agent: AgentId.WHATSAPP_AGENT,
    },
    { direction: MessageDirection.INBOUND, body: 'Yes, I need a POA for my Mumbai flat' },
  ]

  for (const [index, entry] of thread.entries()) {
    await prisma.message.upsert({
      where: { id: `message-seed-000${index + 1}` },
      update: {},
      create: {
        id: `message-seed-000${index + 1}`,
        organizationId: ORG_ID,
        conversationId: conversation.id,
        direction: entry.direction,
        status: MessageStatus.DELIVERED,
        body: entry.body,
        sentByAgent: entry.agent ?? null,
        sentAt: daysAgo(1),
        deliveredAt: daysAgo(1),
      },
    })
  }

  // ── Automation ────────────────────────────────────────────────────────────
  const workflow = await prisma.workflow.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: 'New lead → nurture → call' } },
    update: {},
    create: {
      organizationId: ORG_ID,
      name: 'New lead → nurture → call',
      description: 'Welcome email, WhatsApp follow-up after two days, AI call if still unengaged.',
      status: WorkflowStatus.ACTIVE,
      triggerType: 'event',
      triggerConfig: { event: 'crm.lead.created.v1' },
      runCount: 142,
      successCount: 134,
      failureCount: 8,
      lastRunAt: daysAgo(1),
    },
  })

  await prisma.workflowVersion.upsert({
    where: { workflowId_version: { workflowId: workflow.id, version: 1 } },
    update: {},
    create: {
      workflowId: workflow.id,
      version: 1,
      graph: {
        nodes: [
          { id: 'trigger', type: 'trigger.event', config: { event: 'crm.lead.created.v1' } },
          { id: 'email', type: 'action.email.send', config: { templateRef: 'welcome-1' } },
          { id: 'wait', type: 'control.wait', config: { days: 2 } },
          {
            id: 'branch',
            type: 'control.condition',
            config: { field: 'lead.engaged', equals: false },
          },
          { id: 'whatsapp', type: 'action.whatsapp.send', config: { templateRef: 'nudge-1' } },
          { id: 'call', type: 'action.voice.call', config: { agent: 'VOICE_AGENT' } },
        ],
        edges: [
          { from: 'trigger', to: 'email' },
          { from: 'email', to: 'wait' },
          { from: 'wait', to: 'branch' },
          { from: 'branch', to: 'whatsapp', when: 'true' },
          { from: 'whatsapp', to: 'call' },
        ],
      },
    },
  })

  // ── Knowledge base ────────────────────────────────────────────────────────
  // Chunks are inserted without embeddings; the embeddings worker fills the
  // vector column, since Prisma cannot write an Unsupported type.
  const knowledgeBase = await prisma.knowledgeBase.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: 'Firm Knowledge' } },
    update: {},
    create: {
      organizationId: ORG_ID,
      name: 'Firm Knowledge',
      description: 'Service descriptions, fee schedules and FAQs the agents may cite.',
    },
  })

  await prisma.knowledgeDocument.upsert({
    where: {
      knowledgeBaseId_contentHash: {
        knowledgeBaseId: knowledgeBase.id,
        contentHash: 'seed-hash-0001',
      },
    },
    update: {},
    create: {
      organizationId: ORG_ID,
      knowledgeBaseId: knowledgeBase.id,
      title: 'Fixed-fee consultation policy',
      sourceType: 'TEXT',
      contentHash: 'seed-hash-0001',
      status: GenerationStatus.PENDING,
      content:
        'All initial consultations are fixed fee at $250 for 30 minutes, credited against engagement.',
    },
  })

  // ── Analytics rollups ─────────────────────────────────────────────────────
  const channels = [ChannelType.FACEBOOK, ChannelType.GOOGLE_ADS, ChannelType.EMAIL]
  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(daysAgo(dayOffset).toISOString().slice(0, 10))
    for (const [channelIndex, channel] of channels.entries()) {
      const base = 40 + channelIndex * 25 + (29 - dayOffset) * 3
      await prisma.metricDaily.upsert({
        where: {
          organizationId_date_channel_campaignId: {
            organizationId: ORG_ID,
            date,
            channel,
            campaignId: campaign.id,
          },
        },
        update: {},
        create: {
          organizationId: ORG_ID,
          date,
          channel,
          campaignId: campaign.id,
          impressions: base * 90,
          clicks: base * 4,
          sessions: base * 3,
          leads: Math.max(1, Math.round(base / 12)),
          conversions: Math.max(0, Math.round(base / 60)),
          spend: (base * 1.6).toFixed(2),
          revenue: (base * 7.4).toFixed(2),
        },
      })
    }
  }

  // ── Audit trail ───────────────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      organizationId: ORG_ID,
      actorType: 'SYSTEM',
      action: 'organization.seeded',
      resourceType: 'organization',
      resourceId: ORG_ID,
      after: { seededAt: new Date().toISOString(), runId: randomUUID() },
    },
  })

  const counts = {
    organization: organization.name,
    users: await prisma.user.count(),
    contacts: await prisma.contact.count(),
    leads: await prisma.lead.count(),
    campaigns: await prisma.campaign.count(),
    agentRuns: await prisma.agentRun.count(),
    metricDays: await prisma.metricDaily.count(),
  }

  console.warn('Seed complete:', JSON.stringify(counts, null, 2))
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
