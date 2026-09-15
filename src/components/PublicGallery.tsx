'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Share2, Check, Camera, ArrowLeft, Images, Play } from 'lucide-react'

type Photo = { id?: string; url: string; caption?: string; credit?: string; tournamentId?: string; kind?: 'photo' | 'video' }
type Tourn = { id: string; name: string }

// Contributed media does NOT ship inside this page. The gallery page used to
// render every photo record into its own HTML -- 84,521 bytes for 193 photos,
// measured Sep 15 2026 -- which does not survive a weekend of uploads. So the page
// ships the curated set plus these counts, and an album fetches its own photos from
// /api/gallery/feed when somebody actually opens it.
type Feed = {
  orgSlug: string
  total: number
  byTournament: Record<string, number>
  covers: Record<string, string>
}

// Public photo gallery. When photos are tagged to more than one tournament it shows
// folders (albums) — one per tournament plus an "All photos" album and "Other" for
// untagged — each with a cover photo. Opening a folder shows its photos with a
// click-to-expand lightbox (prev/next + keyboard) and per-photo share (deep link).
export default function PublicGallery({ photos, tournaments, covers = {}, creditLinks = {}, feed }: { photos: Photo[]; tournaments: Tourn[]; covers?: Record<string, string>; creditLinks?: Record<string, string>; feed?: Feed }) {
  // A credit only becomes a link when the server matched it to a photographer we
  // credential. Everything else stays the grey text it has always been, so an
  // unrecognised credit can never render as a link to nowhere.
  const creditHref = (c?: string) => (c ? creditLinks[c] || '' : '')
  const nameOf = useMemo(() => { const m: Record<string, string> = {}; tournaments.forEach(t => { m[t.id] = t.name }); return m }, [tournaments])

  // An album's count is curated + contributed, and an event can now earn an album
  // on contributed photos alone -- which is the normal case the first time a
  // photographer uploads to an event Bo never hand-picked photos for.
  const contributedFor = useCallback((id: string) => (feed?.byTournament?.[id] || 0), [feed])

  const albums = useMemo(() => {
    const byT: Record<string, Photo[]> = {}
    const other: Photo[] = []
    photos.forEach(p => { const tid = p.tournamentId || ''; if (tid && nameOf[tid]) (byT[tid] ||= []).push(p); else other.push(p) })
    const list: { id: string; name: string; photos: Photo[]; cover: Photo | null; count: number }[] = []
    tournaments.forEach(t => {
      const ps = byT[t.id] || []
      const extra = feed?.byTournament?.[t.id] || 0
      if (!ps.length && !extra) return
      const coverUrl = feed?.covers?.[t.id] || ''
      list.push({
        id: t.id, name: t.name, photos: ps, count: ps.length + extra,
        cover: ps.find(p => p.id === covers[t.id]) || ps[0] || (coverUrl ? { url: coverUrl } : null),
      })
    })
    const otherExtra = feed?.byTournament?.[''] || 0
    if (other.length || otherExtra) {
      list.push({ id: '__other', name: 'Other', photos: other, count: other.length + otherExtra, cover: other[0] || (feed?.covers?.[''] ? { url: feed.covers[''] } : null) })
    }
    return list
  }, [photos, tournaments, nameOf, covers, feed])

  const useAlbums = albums.length > 1
  const totalCount = photos.length + (feed?.total || 0)

  const [folder, setFolder] = useState<string | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  // Contributed photos, per album key ('__all', '__other' or a tournament id).
  const [fetched, setFetched] = useState<Record<string, Photo[]>>({})
  const [nextOffset, setNextOffset] = useState<Record<string, number | null>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const folderKey = !useAlbums || folder === null ? '__all' : folder

  const loadMore = useCallback(async (key: string) => {
    if (!feed?.orgSlug) return
    const offset = nextOffset[key] ?? 0
    if (offset === null) return
    setLoadingKey(key)
    try {
      const q = new URLSearchParams({ org: feed.orgSlug, offset: String(offset), limit: '60' })
      // '__all' asks for everything; '__other' is the empty tournament id, which is
      // exactly what untagged rows carry.
      if (key !== '__all') q.set('t', key === '__other' ? '' : key)
      const r = await fetch(`/api/gallery/feed?${q}`)
      if (!r.ok) return
      const d = await r.json()
      const items: Photo[] = Array.isArray(d.items) ? d.items : []
      setFetched(prev => {
        const have = new Set((prev[key] || []).map(p => p.id))
        return { ...prev, [key]: [...(prev[key] || []), ...items.filter(i => !have.has(i.id))] }
      })
      setNextOffset(prev => ({ ...prev, [key]: d.nextOffset ?? null }))
    } catch { /* the curated photos are still on screen */ } finally { setLoadingKey(null) }
  }, [feed, nextOffset])

  // First page for whichever album is open, once.
  useEffect(() => {
    if (!feed?.total) return
    const key = folderKey
    if (fetched[key] !== undefined) return
    const has = key === '__all' ? feed.total : (feed.byTournament?.[key === '__other' ? '' : key] || 0)
    if (!has) return
    setFetched(prev => ({ ...prev, [key]: [] }))
    loadMore(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderKey, feed])

  const current = useMemo(() => {
    const curated = (!useAlbums || folder === '__all' || folder === null)
      ? photos
      : (albums.find(a => a.id === folder)?.photos || photos)
    // Curated first: those are the ones somebody chose on purpose.
    return [...curated, ...(fetched[folderKey] || [])]
  }, [useAlbums, folder, albums, photos, fetched, folderKey])

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const ph = sp.get('photo'); const fo = sp.get('folder')
    if (ph) {
      const al = useAlbums ? albums.find(a => a.photos.some(q => q.id === ph)) : null
      if (useAlbums) setFolder(al ? al.id : '__all')
      const set = al ? al.photos : photos
      const idx = set.findIndex(q => q.id === ph)
      if (idx >= 0) setTimeout(() => setActive(idx), 0)
      return
    }
    if (fo && useAlbums) setFolder(fo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback(() => setActive(null), [])
  const go = useCallback((d: number) => setActive(a => { if (a === null) return a; const n = a + d; return n < 0 ? current.length - 1 : n >= current.length ? 0 : n }), [current.length])

  useEffect(() => {
    if (active === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close, go])

  async function share(p: Photo) {
    const url = `${location.origin}${location.pathname}?photo=${encodeURIComponent(p.id || '')}`
    try { if ((navigator as any).share) { await (navigator as any).share({ title: p.caption || 'Photo', text: p.caption || '', url }); return } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* ignore */ }
  }

  function openFolder(id: string) { setFolder(id); try { history.replaceState(null, '', id === '__all' ? location.pathname : `?folder=${encodeURIComponent(id)}`) } catch {}; window.scrollTo({ top: 0 }) }
  function backToAlbums() { setFolder(null); setActive(null); try { history.replaceState(null, '', location.pathname) } catch {} }

  if (!photos.length) return <p className="text-slate-400">No photos yet — check back soon.</p>

  const cur = active !== null ? current[active] : null

  if (useAlbums && folder === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <AlbumCard name="All photos" count={totalCount} cover={photos[0] || (albums.find(a => a.cover)?.cover ?? null)} onClick={() => openFolder('__all')} />
        {albums.map(a => <AlbumCard key={a.id} name={a.name} count={a.count} cover={a.cover} onClick={() => openFolder(a.id)} />)}
      </div>
    )
  }

  const heading = useAlbums ? (folder === '__all' ? 'All photos' : (albums.find(a => a.id === folder)?.name || '')) : ''
  // The real size of the album, not how much of it has loaded -- "24" under a
  // heading on an album of 800 is a bug report waiting to happen.
  const headingCount = folder === '__all' || folder === null
    ? totalCount
    : (albums.find(a => a.id === folder)?.count ?? current.length)
  const more = nextOffset[folderKey]

  return (
    <>
      {useAlbums && <button onClick={backToAlbums} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"><ArrowLeft size={16} /> All albums</button>}
      {heading && <h2 className="text-xl font-bold text-slate-900 mb-4">{heading} <span className="text-slate-400 font-normal text-base">· {headingCount.toLocaleString('en-US')}</span></h2>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {current.map((ph, i) => {
          const href = creditHref(ph.credit)
          return (
            <div key={ph.id || i} className="group rounded-2xl overflow-hidden border border-slate-200 bg-white">
              <button onClick={() => setActive(i)} className="block w-full text-left">
                <div className="aspect-square overflow-hidden relative">
                  {ph.kind === 'video' ? (
                    // The poster frame is the video itself with preload=metadata:
                    // a few KB rather than the whole clip, and no second file to
                    // generate, store and keep in sync.
                    <video src={ph.url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                  ) : (
                    <img src={ph.url} alt={ph.caption || ''} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  )}
                  {ph.kind === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center"><Play size={16} fill="currentColor" /></span>
                    </span>
                  )}
                </div>
              </button>
              {(ph.caption || ph.credit) && (
                <div className="px-3 py-2">
                  {ph.caption && <p className="text-xs text-slate-600 truncate">{ph.caption}</p>}
                  {ph.credit && (href ? (
                    <Link href={href} className="text-[11px] text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1 min-w-0">
                      <Camera size={11} className="shrink-0" /><span className="truncate">{ph.credit}</span>
                    </Link>
                  ) : (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 min-w-0">
                      <Camera size={11} className="shrink-0" /><span className="truncate">{ph.credit}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {more !== null && more !== undefined && (
        <div className="mt-8 text-center">
          <button onClick={() => loadMore(folderKey)} disabled={loadingKey === folderKey}
            className="text-sm font-semibold border border-slate-300 rounded-lg px-5 py-2.5 text-slate-700 hover:bg-white disabled:opacity-50">
            {loadingKey === folderKey ? 'Loading…' : `Load more — ${(headingCount - current.length).toLocaleString('en-US')} left`}
          </button>
        </div>
      )}
      {loadingKey === folderKey && more === undefined && (
        <p className="mt-8 text-center text-sm text-slate-400">Loading…</p>
      )}

      {cur && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={close}>
          <button onClick={close} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={26} /></button>
          {current.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"><ChevronLeft size={36} /></button>}
          {current.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"><ChevronRight size={36} /></button>}
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            {cur.kind === 'video'
              ? <video src={cur.url} controls autoPlay loop playsInline className="max-h-[78vh] w-auto mx-auto rounded-lg" />
              : <img src={cur.url} alt={cur.caption || ''} className="max-h-[78vh] w-auto mx-auto rounded-lg object-contain" />}
            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="text-white min-w-0">
                {cur.caption && <p className="text-sm font-medium">{cur.caption}</p>}
                <p className="text-xs text-white/60 truncate">
                  {cur.credit && (creditHref(cur.credit) ? (
                    <>Photo: <Link href={creditHref(cur.credit)} className="text-white/90 underline decoration-white/40 underline-offset-2 hover:decoration-white">{cur.credit}</Link></>
                  ) : <>Photo: {cur.credit}</>)}
                  {cur.credit && cur.tournamentId && nameOf[cur.tournamentId] ? ' · ' : ''}
                  {cur.tournamentId ? nameOf[cur.tournamentId] : ''}
                </p>
              </div>
              <button onClick={() => share(cur)} className="shrink-0 inline-flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1.5">
                {copied ? <><Check size={15} /> Link copied</> : <><Share2 size={15} /> Share</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AlbumCard({ name, count, cover, onClick }: { name: string; count: number; cover: Photo | null; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left rounded-2xl overflow-hidden border border-slate-200 bg-white">
      <div className="aspect-[4/3] overflow-hidden relative">
        {cover ? <img src={cover.url} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full bg-slate-100" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-xs text-white/80 flex items-center gap-1"><Images size={12} /> {count} photo{count === 1 ? '' : 's'}</p>
        </div>
      </div>
    </button>
  )
}
