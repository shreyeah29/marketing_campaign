import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'

import './globals.css'

// Two families, self-hosted (design brief 1.3): General Sans for the interface,
// IBM Plex Mono for every number, ID and timestamp. No CDN dependency.
const generalSans = localFont({
  src: [
    { path: '../../public/fonts/GeneralSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/GeneralSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/GeneralSans-Semibold.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/GeneralSans-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['Inter', 'system-ui', 'sans-serif'],
})

const plexMono = localFont({
  src: [
    { path: '../../public/fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

export const metadata: Metadata = {
  title: 'VSP AI Marketing OS',
  description: 'Modular multi-tenant AI business operating system',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${generalSans.variable} ${plexMono.variable}`}>
      <head>
        {/* Apply the saved theme before first paint so dark-mode users never see a
            light flash. Light is the default (no attribute needed). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('vsp:theme')==='dark')document.documentElement.dataset.theme='dark';}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
