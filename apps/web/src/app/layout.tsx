import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'

import './globals.css'

/**
 * Two faces, split by job, loaded from disk.
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
 * `next/font/local`, not `next/font/google`.
 *
 * The Google loader downloads the font at build time, which put
 * `fonts.gstatic.com` in the critical path of every CI run and every deploy. It
 * failed three retries once already and passed on a re-run — flaky rather than
 * broken, which is the version that waits for a demo. These files are in the
 * repository, so a build needs no network and cannot fail this way again.
 *
 * Both are variable fonts: one file per family covering the whole weight range,
 * so `weight` is a range rather than a list and there is no separate file per
 * step. The ranges below were read out of each file's `fvar` table rather than
 * taken from documentation — Space Grotesk carries 300–700, Plex Sans 100–700,
 * which covers every weight the tokens ask for (400/500/700 and 400/500).
 */
const spaceGrotesk = localFont({
  src: '../../public/fonts/SpaceGrotesk-Variable.ttf',
  weight: '300 700',
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})

const plexSans = localFont({
  src: [
    { path: '../../public/fonts/IBMPlexSans-Variable.ttf', weight: '100 700', style: 'normal' },
    // The italic is a separate file, and it is used: the media library sets the
    // "no prompt was recorded" line in italic to mark it as absence rather than
    // content. Without this face the browser would synthesise a slant.
    {
      path: '../../public/fonts/IBMPlexSans-Italic-Variable.ttf',
      weight: '100 700',
      style: 'italic',
    },
  ],
  variable: '--font-body',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
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
