import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

// Self-hosted Inter (bundled + cached by the SW) — no render-blocking request
// to Google Fonts on launch. `display: swap` avoids invisible text while loading.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Passbokning · PostNord',
  description: 'Schemaläggningssystem för extraanställda chaufförer',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Passbokning',
  },
  icons: {
    icon: '/pn-logo.png',
    apple: '/pn-logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0033A0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
