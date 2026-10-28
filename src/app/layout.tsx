import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from './providers'
import { IosSplashLinks } from '@/components/IosSplashLinks'

// Self-hosted Inter (bundled + cached by the SW) — no render-blocking request
// to Google Fonts on launch. `display: swap` avoids invisible text while loading.
// The font file lives in the repo (variable weight, latin subset, OFL — see
// fonts/Inter-OFL.txt) rather than next/font/google, which downloads it at build
// time: when Vercel's build can't reach Google Fonts, the whole build fails.
const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
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
        <IosSplashLinks />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
