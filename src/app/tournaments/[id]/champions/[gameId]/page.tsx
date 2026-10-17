import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { loadChampionShare } from '@/lib/championShare'
import { tournamentAbs, clip } from '@/lib/seo'
import ChampionHero from '@/components/ChampionHero'

// One champion, for sharing (lib/championShare; Bo, Oct 17 2026). This is the link
// the bracket's Share sends, so a text or a post shows the champions' photo as its
// preview picture; the page itself is the same hero with a way into the bracket.
// A 404 unless the photo or video was put on the public bracket in Awards.

export const dynamic = 'force-dynamic'

// The metadata and the page both need it; one set of queries per request.
const load = cache((id: string, gameId: string) => loadChampionShare(id, gameId))

type Params = { params: { id: string; gameId: string } }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = await load(params.id, params.gameId)
  if (!c) return { title: { absolute: 'Champions' }, robots: { index: false } }
  const title = `${c.champion}: ${[c.division, c.flight].filter(Boolean).join(' ')} champions`
  const description = clip(`Beat ${c.runnerUp} ${c.hi}–${c.lo} in the final at ${c.tournamentName}.`)
  const url = tournamentAbs(c.orgSlug, `/tournaments/${c.tournamentId}/champions/${c.gameId}`)
  const image = tournamentAbs(c.orgSlug, c.imageUrl)
  return {
    title: { absolute: `${title} · ${c.tournamentName}` },
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', title, description, url, images: [{ url: image, alt: `${c.champion}, the ${c.division} champions` }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function ChampionPage({ params }: Params) {
  const c = await load(params.id, params.gameId)
  if (!c) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <ChampionHero
        media={{ url: c.imageUrl, ...(c.videoUrl ? { videoUrl: c.videoUrl } : {}), shareUrl: `/tournaments/${c.tournamentId}/champions/${c.gameId}` }}
        team={c.champion} logo={c.logoUrl || undefined} division={c.division} flight={c.flight || undefined} eventName={c.tournamentName}
        year={c.date.slice(0, 4)} result={`Beat ${c.runnerUp} ${c.hi}–${c.lo} in the final`} detail={[c.when, c.field].filter(Boolean).join(' · ')}
        chips={c.seed ? [`No. ${c.seed} seed`] : []}
        bracketHref={`/tournaments/${c.tournamentId}/public?division=${encodeURIComponent(c.division)}&tab=bracket`} />
    </main>
  )
}
