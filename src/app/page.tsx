import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { BRAND, brandJsonLd } from '@/lib/brandFaq'
import Landing from './Landing'
import HomeClient from './HomeClient'
import AppStart from './AppStart'

// The domain root. Signed out: the public landing, rendered on the SERVER so
// crawlers and answer engines that don't run JavaScript read the real page
// (before Oct 15 2026 they got "Loading…": the page was client-only and the
// session is unknown during server render). Signed in: the tournaments
// dashboard, unchanged (HomeClient).
//
// Custom org domains never reach this page: middleware rewrites their root to
// /o/<slug>, so the brand metadata below is whistleready.app's own.

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
  description: BRAND.description,
  alternates: { canonical: '/' },
  // Google Search Console ownership for https://whistleready.app/ (URL-prefix property,
  // HTML-tag method, added Oct 15 2026). Removing it un-verifies the property.
  verification: { google: 'S6DkpOAnlD5-s50zQEbR73xZ4MQGZPT6eTl1oYUpLRc' },
  openGraph: { title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description, url: '/', siteName: BRAND.name, type: 'website' },
}

export default async function HomePage() {
  const session = await getServerSession(authOptions).catch(() => null)
  if (session?.user) return <HomeClient />
  // Inside the iOS app (lib/pushClient isNativeApp) a signed-out visitor is a parent,
  // fan, coach or staff member, not an organizer shopping for software.
  if (/WhistleReadyApp\//.test(headers().get('user-agent') || '')) return <AppStart />
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd()).replace(/</g, '\\u003c') }} />
      <Landing />
    </>
  )
}
