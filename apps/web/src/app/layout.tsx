import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google'

import './globals.css'

/**
 * Two faces, split by job.
 *
 * Space Grotesk carries the chrome and every figure — headings, section labels,
 * KPI numbers. Its tight tracking and squared terminals are what make the metric
 * tiles read as instrumentation rather than prose, and the token ramp tracks it
 * negatively (-0.03em on metrics) to lean into that.
 *
 * IBM Plex Sans carries running text, where Space Grotesk's character would
 * fight a paragraph. Plex is quieter and has the taller x-height that keeps 13px
 * secondary text legible on a near-black ground.
 *
 * Both come through next/font/google, which self-hosts the files at build time —
 * so there is no CDN request at runtime and no layout shift from a late swap.
 * The variable names are what globals.css reads: `--font-display` and
 * `--font-body`.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-display',
  display: 'swap',
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Marketing OS',
  description: 'Modular multi-tenant AI business operating system',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `color-scheme: dark` is set on :root in globals.css so form controls,
    // scrollbars and the canvas the browser paints behind the page all match.
    // There is no theme attribute to restore before paint any more — the design
    // is dark and only dark, so the old inline script had nothing left to do.
    <html lang="en" className={`${spaceGrotesk.variable} ${plexSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
