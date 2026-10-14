import Link from 'next/link'
import { headers } from 'next/headers'
import PublicHeader from './PublicHeader'
import { ORG_DOMAINS } from '@/lib/orgDomains'
import { orgBySlug } from '@/lib/org'

// Shared layout for /privacy, /terms and /sms. All are public (middleware
// PUBLIC_ROUTES): Intuit's production review for the QuickBooks connection asks
// for their URLs, a carrier's toll-free review asks for them too, and anyone
// signing up should be able to read them.
//
// WHOSE PAGES THESE ARE depends on the host. On whistleready.app they are
// Whistle Ready's. On an org's own domain they are that org's, and the header
// and byline must name the org -- the business on a toll-free submission has to
// match the site the reviewer is sent to. Resolving it from the host keeps the
// three pages honest on both domains without a second hardcoded name to drift.

export const LEGAL_UPDATED = 'October 5, 2026'
export const LEGAL_EMAIL = 'info@sunshinelax.com'
export const LEGAL_PHONE = '(954) 608-5886'

export default async function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  const host = (headers().get('host') || '').replace(/:\d+$/, '').replace(/^www\./, '').toLowerCase()
  const slug = ORG_DOMAINS[host] || ''
  // Only costs a query on an org's own domain; whistleready.app skips it.
  const org = slug ? await orgBySlug(slug) : null
  const operator = org?.name || 'Whistle Ready'
  const siteLabel = org ? host : 'whistleready.app'

  return (
    <div className="-m-3 sm:-m-6 bg-white text-slate-700 min-h-screen">
      <PublicHeader org={org ? { name: org.name, logoUrl: org.logoUrl, domain: host } : null} />
      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{operator} · Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 space-y-3 text-[15px] leading-7">{intro}</div>
        <div className="mt-10 space-y-9 text-[15px] leading-7">{children}</div>
        <footer className="mt-12 pt-6 border-t border-slate-200 text-sm text-slate-500 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-slate-800">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-800">Terms of Use</Link>
          <a href={`mailto:${LEGAL_EMAIL}`} className="hover:text-slate-800">{LEGAL_EMAIL}</a>
          <Link href="/" className="hover:text-slate-800">{siteLabel}</Link>
        </footer>
      </article>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-slate-400">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

export function Contact() {
  return (
    <p>
      Sunshine Events Group LLC<br />
      11830 Wiles Rd, Coral Springs, FL 33076<br />
      Email: <a href={`mailto:${LEGAL_EMAIL}`} className="text-teal-700 hover:underline">{LEGAL_EMAIL}</a><br />
      Phone: {LEGAL_PHONE}
    </p>
  )
}
