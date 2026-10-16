import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicHeader from '../../PublicHeader'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { GUIDES, guideBySlug, fmtGuideDate } from '@/lib/guides'
import { BRAND } from '@/lib/brandFaq'

// One guide (lib/guides). Static: the content lives in the repo.

export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const g = guideBySlug(params.slug)
  if (!g) return {}
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    authors: [{ name: g.author.name }],
    openGraph: { type: 'article', title: g.title, description: g.description, url: `/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated, authors: [g.author.name] },
  }
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const g = guideBySlug(params.slug)
  if (!g) notFound()
  const url = `${BRAND.url}/guides/${g.slug}`
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: g.title,
        description: g.description,
        url,
        mainEntityOfPage: url,
        datePublished: g.published,
        dateModified: g.updated,
        author: { '@type': 'Person', name: g.author.name, description: g.author.bio },
        publisher: { '@type': 'Organization', '@id': `${BRAND.url}/#organization`, name: BRAND.legalName, logo: { '@type': 'ImageObject', url: BRAND.logo } },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Whistle Ready', item: BRAND.url },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${BRAND.url}/guides` },
          { '@type': 'ListItem', position: 3, name: g.title, item: url },
        ],
      },
    ],
  }
  return (
    <div className="-m-3 sm:-m-6 bg-white text-slate-700 min-h-screen">
      <PublicHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <p className="text-sm"><Link href="/guides" className="text-teal-700 hover:underline">Guides</Link> <span className="text-slate-400">· {g.audience}</span></p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">{g.title}</h1>
        <p className="mt-3 text-sm text-slate-500">By {g.author.name} · Updated {fmtGuideDate(g.updated)}</p>
        <div className="mt-8 text-[16px]" dangerouslySetInnerHTML={{ __html: mdToHtml(g.body) }} />
        <aside className="mt-12 pt-6 border-t border-slate-200 text-sm text-slate-500">
          <p className="font-semibold text-slate-700">About the author</p>
          <p className="mt-1">{g.author.bio}</p>
        </aside>
        <p className="mt-8 text-sm"><Link href="/guides" className="text-teal-700 hover:underline">← All guides</Link></p>
      </article>
    </div>
  )
}
