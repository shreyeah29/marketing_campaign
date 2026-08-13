import { LandingView } from '@/components/landing-view'

/**
 * Public landing — brand-first entrance with interactive stage and login doors.
 */
export const metadata = {
  title: 'Marketing OS',
  description: 'Your AI marketing team in one platform — generate, approve, publish and measure.',
}

export default function LandingPage() {
  return <LandingView />
}
