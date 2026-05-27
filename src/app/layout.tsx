import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

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
    <html lang="sv">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
