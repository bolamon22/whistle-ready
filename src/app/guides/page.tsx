import type { Metadata } from 'next'
import Link from 'next/link'
import PublicHeader from '../PublicHeader'
import { GUIDES, fmtGuideDate } from '@/lib/guides'
import { BRAND } from '@/lib/brandFaq'

// whistleready.app/guides: the article index (lib/guides). Public; on an org's
// own domain middleware rewrites paths into /o/<slug>, so this is Whistle
// Ready's only.

export const metadata: Metadata = {
  title: 'Guides for running youth sports tournaments',
  description: 'Practical guides for tournament directors, assigners, coaches and parents, from the people who run youth lacrosse tournaments and build Whistle Ready.',
  alternates: { canonical: '/guides' },
}

export default function GuidesIndex() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Whistle Ready guides',
    url: `${BRAND.url}/guides`,
    publisher: { '@id': `${BRAND.url}/#organization` },
    hasPart: GUIDES.map(g => ({ '@type': 'Article', headline: g.title, url: `${BRAND.url}/guides/${g.slug}` })),
  }
  return (
    <div className="-m-3 sm:-m-6 bg-white text-slate-700 min-h-screen">
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Guides</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Running a youth sports tournament</h1>
        <p className="mt-3 text-lg text-slate-600">Practical guides from people who run youth lacrosse tournaments every season.</p>
        <div className="mt-10 space-y-4">
          {GUIDES.map(g => (
            <Link key={g.slug} href={`/guides/${g.slug}`} className="block bg-white border border-slate-200 rounded-xl p-6 hover:border-slate-300 hover:shadow-md transition-all">
              <p className="text-xs font-semibold text-teal-700">{g.audience}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{g.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{g.description}</p>
              <p className="mt-3 text-xs text-slate-400">{g.author.name} · Updated {fmtGuideDate(g.updated)}</p>
            </Link>
          ))}
        </div>
        <p className="mt-12 text-sm text-slate-500"><Link href="/" className="text-teal-700 hover:underline">← Back to Whistle Ready</Link></p>
      </main>
    </div>
  )
}
