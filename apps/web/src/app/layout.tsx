import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'VSP AI Marketing OS',
  description: 'Modular multi-tenant AI business operating system',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
