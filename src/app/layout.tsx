import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { SITE_URL } from '@/lib/seo'
import { Toaster } from 'react-hot-toast'
import NavBar from './NavBar'
import DynamicTitle from './DynamicTitle'
import Providers from './providers'
import ThemeShell from './ThemeShell'
import EnvBadge from './EnvBadge'
import AppMain from './AppMain'
import Analytics from '@/components/Analytics'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import ClientErrorReporter from './ClientErrorReporter'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Whistle Ready', template: '%s · Whistle Ready' },
  description: 'The Sports Management Master Plan',
  openGraph: { siteName: 'Whistle Ready', type: 'website' },
  twitter: { card: 'summary_large_image' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Whistle Ready', statusBarStyle: 'default' },
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon-192.png', type: 'image/png', sizes: '192x192' }], apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#0f766e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Suspense fallback={null}><Analytics /></Suspense>
        <VercelAnalytics />
        <SpeedInsights />
        <ClientErrorReporter />
        <Providers>
          <ThemeShell />
          <EnvBadge />
          <NavBar />
          <DynamicTitle />
          <AppMain>{children}</AppMain>
          <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', fontFamily: 'inherit', fontSize: '14px' } }}/>
        </Providers>
      </body>
    </html>
  )
}
