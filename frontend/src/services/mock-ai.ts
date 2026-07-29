// Mock AI Service - Replace with real ILLMService implementation
// This abstraction layer ensures UI/UX remains unchanged when switching to real APIs

export interface AIServiceInterface {
  generateCampaign(prompt: string): Promise<CampaignResult>
  generateContent(type: string, brief: string): Promise<string>
  generateInsights(data: Record<string, unknown>): Promise<string[]>
}

export interface CampaignSection {
  id: string
  title: string
  content: string
  type: string
}

export interface CampaignResult {
  sections: CampaignSection[]
  summary: string
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const MockAIService: AIServiceInterface = {
  async generateCampaign(prompt: string): Promise<CampaignResult> {
    await delay(1800)
    const business = prompt.includes('VSP Law') ? 'VSP Law Associates' : 'Your Business'
    const audience = prompt.includes('NRI') ? 'NRIs in Dallas' : 'Target Audience'

    return {
      summary: `Comprehensive 360° marketing campaign for ${business} targeting ${audience}`,
      sections: [
        {
          id: 'strategy',
          title: 'Campaign Strategy',
          type: 'strategy',
          content: `**Campaign Name:** "${business} — Your Legal Home Away From Home"\n\n**Objective:** Generate 150+ qualified leads per month from the NRI community in Dallas, TX.\n\n**Duration:** 90-day sprint with ongoing evergreen campaigns.\n\n**Key Pillars:**\n1. Trust & Credibility — Showcase 20+ years of NRI legal expertise\n2. Emotional Connection — "Home is where your rights are protected"\n3. Ease of Process — Highlight remote consultation capabilities\n4. Community Presence — Partner with Indian cultural associations in Dallas\n\n**Budget Allocation:** $15,000/month total across all channels`
        },
        {
          id: 'audience',
          title: 'Target Audience',
          type: 'audience',
          content: `**Primary Segment:** NRI Indians aged 30–55 in Dallas-Fort Worth Metro\n\n**Demographics:**\n- Income: $100K–$300K household\n- Profession: IT professionals, doctors, business owners\n- Education: Post-graduate\n\n**Psychographics:**\n- Concerned about property disputes back home\n- Need power of attorney services\n- Inheritance & succession planning\n- NRI investment compliance\n\n**Pain Points:**\n1. Trust issues with India-based lawyers\n2. Time zone differences making communication hard\n3. Language barriers in legal documentation\n4. Fear of property fraud targeting NRIs\n\n**Targeting Keywords:** NRI lawyer Dallas, Indian property law USA, POA services NRI, NRI legal consultation`
        },
        {
          id: 'budget',
          title: 'Budget & Projections',
          type: 'budget',
          content: `**Total Monthly Budget: $15,000**\n\n| Channel | Budget | Expected Leads | CPL |\n|---------|--------|---------------|-----|\n| Facebook/Instagram | $4,500 | 60 | $75 |\n| Google Ads | $3,500 | 45 | $78 |\n| LinkedIn | $2,000 | 20 | $100 |\n| WhatsApp Campaigns | $1,000 | 30 | $33 |\n| Email Marketing | $500 | 25 | $20 |\n| SEO & Content | $2,000 | 20 | $100 |\n| Influencer/Community | $1,500 | 15 | $100 |\n\n**Projected ROI:** 8–12x (average case value $8,000–$25,000)\n**Break-even:** 2 closed cases per month`
        },
        {
          id: 'facebook',
          title: 'Facebook Ads',
          type: 'social',
          content: `**Campaign 1: Lead Generation**\nHeadline: "NRI Legal Experts in Dallas — Get Free 30-Min Consultation"\nBody: "Facing property disputes in India? Inheritance issues? Our Dallas-based NRI legal team has helped 500+ families protect their assets. No India trip required. Book your free consultation today."\nCTA: Book Free Consultation\nAudience: Indian-Americans, Dallas, 28–60, Interests: India, NRI, Property Investment\n\n**Campaign 2: Retargeting**\nHeadline: "Still thinking? Let's solve your legal worries today."\nBody: "You visited our page but haven't booked yet. Our NRI specialists handle property, succession, POA & immigration matters remotely. 100% confidential."\n\n**Campaign 3: Video Ad**\nConcept: Testimonial-style — "How we helped Raj Sharma recover his Mumbai flat from Dallas without a single India trip"`
        },
        {
          id: 'instagram',
          title: 'Instagram Posts',
          type: 'social',
          content: `**Post 1 — Awareness**\nCaption: "🇮🇳 NRI & worried about your property back home? You don't need to fly to India to protect what's yours. @VSPLawAssociates handles it all — remotely, securely, confidently. 💼 Book your free NRI legal consultation → Link in bio. #NRILawyer #DallasNRI #IndianAmericans #NRILegal"\n\n**Post 2 — Educational Carousel**\nSlide 1: "5 Legal Documents Every NRI Must Have"\nSlide 2-6: POA, Will, Property Registration, OCI, NRI Bank Authority\nSlide 7: CTA — "Get yours drafted by experts"\n\n**Reel Concept:** "A Day in the Life of Our NRI Legal Team" — 45 second behind-the-scenes showing consultations, documentation, client calls from USA to India`
        },
        {
          id: 'linkedin',
          title: 'LinkedIn Posts',
          type: 'social',
          content: `**Post 1 — Thought Leadership**\n"I've worked with 500+ NRI clients in the past decade. Here's what they ALL got wrong about property rights in India... [Thread]\n\n1/ Most NRIs assume their name on a property deed is enough protection. It isn't.\n2/ Without a registered POA, your property can be challenged, sold, or encumbered without your knowledge.\n3/ Succession planning is not just a 'when I die' conversation — it's a 'while I'm alive and abroad' conversation.\n\nAt VSP Law Associates, we specialize in protecting the assets of Indians living abroad. DM me for a confidential consultation."\n\n**Post 2 — Social Proof**\n"We helped a Dallas-based software engineer recover a ₹2.8 Cr property that was illegally transferred by a distant relative. All handled remotely via secure video consultation and e-signing. This is why NRI legal protection matters."`
        },
        {
          id: 'google-ads',
          title: 'Google Ads',
          type: 'ads',
          content: `**Search Campaign 1**\nKeywords: "NRI lawyer Dallas", "Indian property lawyer USA", "NRI legal consultation", "POA for NRI", "India property dispute USA"\n\nAd Copy:\nHeadline 1: NRI Legal Experts in Dallas\nHeadline 2: Free 30-Min Consultation\nHeadline 3: Property | Succession | POA\nDescription: Trusted by 500+ NRI families. We handle India property disputes, wills & POA — all remotely from Dallas. Call now.\nCTA: Call Now / Book Free Consult\n\n**Display Campaign**\nBanner targeting: Indian news sites (NDTV USA, Times of India USA), Desi community sites\nMessage: "Your property in India deserves protection — even from 10,000 miles away"`
        },
        {
          id: 'blog',
          title: 'Blog Content',
          type: 'content',
          content: `**Article 1:** "Complete NRI Guide to Protecting Your Property in India (2024)"\nTarget keyword: "NRI property rights India" — 2,400 searches/mo\nLength: 3,500 words\nCoverage: POA, legal heir certificate, succession, encumbrance certificate\n\n**Article 2:** "How to Give Power of Attorney from USA to India: Step-by-Step Guide"\nTarget keyword: "power of attorney India from USA" — 1,900 searches/mo\n\n**Article 3:** "Top 10 Legal Mistakes NRIs Make with Indian Property"\nTarget: "NRI legal mistakes property" — 800 searches/mo\n\n**Article 4:** "NRI Inheritance Laws in India: What You MUST Know"\nTarget: "NRI inheritance India" — 1,200 searches/mo\n\nAll articles to include CTA blocks, lead forms, and WhatsApp click-to-chat buttons`
        },
        {
          id: 'email',
          title: 'Email Sequence',
          type: 'email',
          content: `**5-Part Welcome Sequence:**\n\nEmail 1 (Day 0): "Welcome — Your NRI Legal Protection Starts Now"\nSubject: "Welcome! Here's your free NRI Property Checklist"\nContent: Deliver lead magnet, introduce firm, set expectations\n\nEmail 2 (Day 2): "The #1 mistake NRIs make (and how to avoid it)"\nContent: Educational value bomb about POA — soft pitch at end\n\nEmail 3 (Day 5): "Real story: How we saved ₹3 Cr for a Dallas family"\nContent: Case study — no names, build trust\n\nEmail 4 (Day 8): "Your questions answered — NRI Legal Q&A"\nContent: Address top 5 FAQs, build authority\n\nEmail 5 (Day 12): "Ready to protect your Indian assets?"\nContent: Hard CTA — Book free consultation, limited slots`
        },
        {
          id: 'whatsapp',
          title: 'WhatsApp Campaign',
          type: 'whatsapp',
          content: `**Broadcast List 1: New Leads**\nMessage: "Namaste! 🙏 I'm Priya from VSP Law Associates, Dallas. We specialize in NRI legal matters — property disputes, POA, succession planning. Most of our clients are NRIs just like you who needed trusted legal help in India without flying back. Can I ask — do you currently have a registered POA for your Indian property? (Reply YES/NO/MAYBE) — I'll send you a free guide based on your answer."\n\n**Broadcast List 2: Nurture (Opted-in):**\nMessage: "Quick update — we just helped a client in Houston recover possession of her father's property in Hyderabad. All done remotely. If you're dealing with anything similar, I'm just a message away. No pressure, no sales pitch — just genuine help. 💼"\n\n**Template: Appointment Reminder**\n"Hi [Name]! Your consultation with Mr. VSP is scheduled for [Date] at [Time] IST / [Time] CST. Join via: [Zoom Link]. Please keep your property documents handy. See you then! 🙏"`
        },
        {
          id: 'video',
          title: 'Video Script',
          type: 'video',
          content: `**YouTube/Reel Script (60 seconds)**\n\n[HOOK — 0-5s]\nVisual: Indian family in USA looking worried at papers\nVO: "Are you an NRI worried about your property back home?"\n\n[PROBLEM — 5-15s]\nVisual: Map from Dallas to India with question marks\nVO: "Property disputes, illegal transfers, missing documents — these are real threats NRIs face every day. But flying to India isn't always an option."\n\n[SOLUTION — 15-35s]\nVisual: Lawyer on video call with NRI family\nVO: "That's why hundreds of Dallas-area NRIs trust VSP Law Associates. We handle India property law, POA, succession planning — 100% remotely. Our team is in both Dallas AND India, so you get the best of both worlds."\n\n[SOCIAL PROOF — 35-50s]\nVisual: Client testimonial overlay\nVO: "We've recovered properties, resolved disputes, and protected assets for over 500 NRI families. No India trip required."\n\n[CTA — 50-60s]\nVisual: Booking page mockup\nVO: "Book your FREE 30-minute consultation today. Link in bio or WhatsApp us right now. Your property deserves protection — even from 10,000 miles away."`
        },
        {
          id: 'landing-page',
          title: 'Landing Page Copy',
          type: 'content',
          content: `**HERO SECTION**\nHeadline: "Protect Your Indian Property From Dallas — No India Trip Required"\nSubheadline: "VSP Law Associates: Dallas's Most Trusted NRI Legal Experts. 500+ Families Protected. Free 30-Min Consultation."\nCTA: [Book Free Consultation Now] [WhatsApp Us]\n\n**SOCIAL PROOF BAR**\n"⭐⭐⭐⭐⭐ 4.9/5 from 180+ NRI clients | 500+ cases handled | 20+ years experience | Dallas & India offices"\n\n**SERVICES SECTION**\n• NRI Property Protection & Dispute Resolution\n• Power of Attorney (POA) Drafting & Registration\n• Succession Planning & Will Drafting\n• NRI Investment & FEMA Compliance\n• Property Purchase/Sale Assistance from USA\n• Legal Heir Certificate & Probate\n\n**PROCESS SECTION**\nStep 1: Book Free Consultation (30 mins via Zoom)\nStep 2: Document Review & Legal Strategy\nStep 3: We Handle Everything in India\nStep 4: You Stay in Dallas — Stress-Free\n\n**FAQ:** Why choose VSP? | Can you handle cases in all Indian states? | Fees? | Timeline?`
        },
        {
          id: 'seo',
          title: 'SEO Suggestions',
          type: 'seo',
          content: `**Primary Keywords:**\n- NRI lawyer Dallas (590 searches/mo)\n- Indian property lawyer USA (880 searches/mo)\n- NRI legal consultation (1,200 searches/mo)\n- POA for NRI from USA (720 searches/mo)\n\n**Long-tail Opportunities:**\n- "how to register power of attorney in India from USA"\n- "NRI property dispute resolution without visiting India"\n- "best NRI property lawyer in Dallas Texas"\n- "Indian succession law NRI United States"\n\n**Technical SEO:**\n- Schema markup: LegalService, LocalBusiness, FAQPage\n- Google My Business: Optimize for "NRI lawyer near me"\n- Backlinks: Indian-American community sites, NRI forums (nriol.com, sindhisamaj.com)\n- Local citations: Dallas Indian community directories\n\n**Content Velocity:** 2 blog posts/week for first 3 months to establish topical authority`
        },
        {
          id: 'cta',
          title: 'CTA Strategy',
          type: 'cta',
          content: `**Primary CTAs (High Intent):**\n1. "Book Free 30-Min NRI Consultation" — Primary button, every page\n2. "WhatsApp Us Now" — Floating button, mobile-first\n3. "Download Free NRI Legal Checklist" — Lead magnet, top of funnel\n\n**Secondary CTAs:**\n4. "Watch: How We Recovered a ₹2.8Cr Property" — Video testimonial\n5. "Ask Your NRI Legal Question" — Community engagement\n6. "Get Case Assessment" — Mid-funnel form\n\n**Urgency/Scarcity:**\n- "Only 8 free consultation slots left this week"\n- "Property registration deadlines — act before March 31"\n- "NRI tax compliance deadline: File by July 31"\n\n**Follow-up Sequence:**\n- Day 0: Confirmation email + WhatsApp\n- Day 1: Pre-consultation reminder\n- Day 3: Post-consult follow-up\n- Day 7: Case proposal\n- Day 14: Check-in if no response`
        },
      ]
    }
  },

  async generateContent(type: string, brief: string): Promise<string> {
    await delay(1200)
    const samples: Record<string, string> = {
      blog: `# ${brief || 'How AI is Transforming Modern Marketing'}\n\nIn the rapidly evolving landscape of digital marketing, artificial intelligence has emerged as the defining competitive advantage for forward-thinking brands...\n\n## The Shift to Intelligent Marketing\n\nGone are the days of spray-and-pray marketing. Today's most successful campaigns leverage predictive analytics, behavioral segmentation, and real-time personalization at scale...\n\n## Key Strategies for 2024\n\n1. **Hyper-personalization at scale** — Using AI to deliver individualized experiences to millions simultaneously\n2. **Predictive lead scoring** — Identifying high-value prospects before they raise their hand\n3. **Automated content generation** — Creating first drafts 10x faster without sacrificing quality\n\n## Implementation Roadmap\n\nStart with data infrastructure, build your ML models on clean first-party data, then gradually replace manual processes with AI-assisted workflows...`,
      email: `Subject: The one thing holding your marketing back (and how to fix it)\n\nHi {{first_name}},\n\nI'll be direct: most marketing teams are flying blind.\n\nThey're spending hours on campaigns that could be optimized in seconds. Creating content that could be personalized automatically. Missing leads that AI would have caught.\n\nThe good news? You don't need a 50-person team or a $1M tech stack to fix this.\n\nHere's what the top 1% of marketing teams do differently:\n\n✓ They use AI for the heavy lifting, humans for strategy\n✓ They measure everything, optimize continuously\n✓ They treat every touchpoint as a data point\n\nWant to see how this looks in practice?\n\n[Book a 30-minute strategy call →]\n\nBest,\nThe VSP AI Team`,
      linkedin: `The marketing industry has a dirty secret: most "data-driven" decisions are actually gut-feel decisions with data sprinkled on top.\n\nHere's what actually separates high-performing marketing teams from everyone else:\n\n→ They instrument everything (not just the obvious metrics)\n→ They run experiments constantly (not just A/B tests)\n→ They let AI surface patterns humans would miss\n\nI've analyzed 1,000+ marketing campaigns in the last year. The #1 predictor of campaign success? Speed of iteration.\n\nNot budget. Not team size. Not brand awareness.\n\nThe teams that test, learn, and adapt fastest always win.\n\nWhat's your current iteration speed? Drop a number in the comments (days between significant campaign changes).\n\n#Marketing #AI #GrowthMarketing #MarTech`,
    }
    return samples[type] || `Generated ${type} content for: ${brief}\n\nThis is a detailed piece of ${type} content crafted to achieve maximum engagement and conversion...`
  },

  async generateInsights(_data: Record<string, unknown>): Promise<string[]> {
    await delay(800)
    return [
      'LinkedIn campaigns are showing 34% higher lead quality than Facebook — consider reallocating 15% of Facebook budget to LinkedIn',
      'Email open rates peak on Tuesday 10am and Thursday 2pm — schedule sends accordingly for 22% lift',
      'Mobile traffic accounts for 68% of visits but only 31% of conversions — mobile UX optimization could unlock $45K/mo revenue',
      'Your NRI audience segment has a 3.2x higher LTV — this segment deserves a dedicated nurture track',
      'Content with video elements gets 4.7x more engagement — prioritize video content for next quarter',
    ]
  }
}
