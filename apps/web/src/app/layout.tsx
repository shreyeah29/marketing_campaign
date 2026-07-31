import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Broadsheet design system — loaded once, globally, before the app's own CSS so
// app-level rules still win where genuinely needed during the retheme.
import '../broadsheet/styles.css'
import '../broadsheet/extensions.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'VSP AI Marketing OS',
  description: 'Modular multi-tenant AI business operating system',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
