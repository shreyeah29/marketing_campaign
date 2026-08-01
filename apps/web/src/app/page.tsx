import Link from 'next/link'

import { Icon, type IconName } from '@/components/icon'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/**
 * Public landing page — the front door.
 *
 * Anonymous visitors land here (not in the app). From here they choose their
 * entry: sign in to a workspace, create an account, or reach the operator console.
 * A server component: static, fast, and SEO-friendly — the motion wrappers are
 * client islands that animate the server-rendered children.
 */
export const metadata = {
  title: 'VSP — AI Marketing OS',
  description:
    'Generate campaigns with AI, review and approve every asset, publish automatically, capture leads, and automate it all with a real workflow engine.',
}

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'sparkles',
    title: 'AI Campaign Generation',
    body: 'Describe a campaign in one line — get a strategy, per-platform posts, captions, hashtags and ad copy, ready to review.',
  },
  {
    icon: 'check-square',
    title: 'Content Review Queue',
    body: 'A professional approval board: preview, edit, regenerate, approve or reject, with comments and a full timeline.',
  },
  {
    icon: 'workflow',
    title: 'Workflow Automation',
    body: 'A real execution engine — triggers, conditions, actions, delays and retries, run by background workers.',
  },
  {
    icon: 'users',
    title: 'Built-in CRM',
    body: 'Contacts, leads, deals, tasks and notes with automatic ownership, search, filters and bulk actions.',
  },
  {
    icon: 'bar-chart',
    title: 'Analytics',
    body: 'Dashboards for campaigns, leads, AI usage and revenue — the numbers that matter, in one place.',
  },
  {
    icon: 'building',
    title: 'Multi-tenant & white-label',
    body: 'Every organization gets its own modules, roles, branding and limits. Onboard a client without code.',
  },
]

const STEPS = [
  'Generate with AI',
  'Review & approve',
  'Schedule & publish',
  'Capture leads',
  'Automate & analyze',
]

export default function LandingPage() {
  return (
    <div>
      {/* Nav */}
      <nav className="lp-nav">
        <div className="brand">
          <span className="dot" />
          VSP
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/login" className="btn ghost">
            Log in
          </Link>
          <Link href="/register" className="btn primary">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="lp-wrap">
        <section className="lp-hero">
          <Stagger interval={0.09}>
            <StaggerItem>
              <span className="pill">
                <Icon name="zap" size={14} />
                AI Marketing Operating System
              </span>
            </StaggerItem>
            <StaggerItem>
              <h1>
                Generate, review and <span className="grad">automate</span> your marketing with AI
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="sub">
                One platform to draft campaigns with AI, approve every asset, publish on schedule,
                capture leads into your CRM, and automate the whole flow with a real workflow
                engine.
              </p>
            </StaggerItem>
            <StaggerItem>
              <div className="lp-cta">
                <Link href="/register" className="btn primary">
                  Start free
                  <Icon name="chevron-right" size={15} />
                </Link>
                <Link href="/login" className="btn">
                  Log in to your workspace
                </Link>
              </div>
            </StaggerItem>
          </Stagger>
        </section>

        {/* Features */}
        <section className="lp-section">
          <FadeIn>
            <h2>Everything your marketing team needs</h2>
            <p className="lead">
              From the first idea to published campaigns and captured leads — end to end.
            </p>
          </FadeIn>
          <Stagger className="lp-features">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title} className="card lp-feature">
                <div className="ico">
                  <Icon name={f.icon} size={20} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* How it works */}
        <section className="lp-section">
          <FadeIn>
            <h2>How it works</h2>
            <p className="lead">
              A single, streamlined flow — powered by AI and automated by workers.
            </p>
          </FadeIn>
          <Stagger className="lp-steps">
            {STEPS.map((s, i) => (
              <StaggerItem key={s} className="lp-step">
                <span className="n">{i + 1}</span>
                {s}
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* CTA band */}
        <FadeIn>
          <section className="lp-cta-band">
            <h2 style={{ marginBottom: 10 }}>Ready to run your marketing on autopilot?</h2>
            <p className="lead" style={{ marginBottom: 26 }}>
              Create your workspace in minutes. No credit card required.
            </p>
            <div className="lp-cta">
              <Link href="/register" className="btn primary">
                Create your workspace
              </Link>
              <Link href="/login" className="btn">
                Log in
              </Link>
            </div>
          </section>
        </FadeIn>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="inner">
          <div className="row" style={{ gap: 8 }}>
            <span
              className="dot"
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                display: 'inline-block',
                background: 'var(--grad-brand)',
              }}
            />
            <span>VSP — AI Marketing OS</span>
          </div>
          <div className="row" style={{ gap: 18 }}>
            <Link href="/login">User login</Link>
            <Link href="/register">Sign up</Link>
            <Link href="/platform/login">Operator console</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
