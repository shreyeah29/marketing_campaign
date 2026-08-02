import Link from 'next/link'

import { FadeIn, Stagger, StaggerItem } from '@/components/motion'

/**
 * Public landing — brand-first entrance. Two doors only: workspace and operator.
 * Restyled to the brief token layer (Phase 5); no feature laundry list.
 */
export const metadata = {
  title: 'VSP — AI Marketing OS',
  description: 'Your AI marketing team in one platform — generate, approve, publish and measure.',
}

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing__atmosphere" aria-hidden />
      <header className="landing__nav">
        <div className="landing__brand">
          <span className="landing__mark" aria-hidden />
          <span className="type-subhead">VSP</span>
        </div>
        <Link href="/login" className="btn ghost sm">
          Sign in
        </Link>
      </header>

      <main className="landing__hero">
        <Stagger interval={0.06} className="landing__copy">
          <StaggerItem>
            <p className="landing__brand-hero type-title">VSP</p>
          </StaggerItem>
          <StaggerItem>
            <h1 className="landing__headline">Your AI marketing team in one platform</h1>
          </StaggerItem>
          <StaggerItem>
            <p className="landing__sub type-body">
              Generate campaigns, approve every asset, publish across channels, and measure what
              worked — in one workspace.
            </p>
          </StaggerItem>
          <StaggerItem>
            <div className="landing__ctas">
              <Link href="/login" className="btn primary">
                Sign in to workspace
              </Link>
              <Link href="/platform/login" className="btn">
                Operator console
              </Link>
            </div>
          </StaggerItem>
        </Stagger>
      </main>

      <FadeIn delay={0.25} className="landing__foot">
        <p className="type-caption">VSP — AI Marketing OS</p>
      </FadeIn>
    </div>
  )
}
