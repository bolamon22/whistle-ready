'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Share2, Check, Camera, ArrowLeft, Images } from 'lucide-react'

type Photo = { id?: string; url: string; caption?: string; credit?: string; tournamentId?: string }
type Tourn = { id: string; name: string }

// Public photo gallery. When photos are tagged to more than one tournament it shows
// folders (albums) — one per tournament plus an "All photos" album and "Other" for
// untagged — each with a cover photo. Opening a folder shows its photos with a
// click-to-expand lightbox (prev/next + keyboard) and per-photo share (deep link).
export default function PublicGallery({ photos, tournaments, covers = {} }: { photos: Photo[]; tournaments: Tourn[]; covers?: Record<string, string> }) {
  const nameOf = useMemo(() => { const m: Record<string, string> = {}; tournaments.forEach(t => { m[t.id] = t.name }); return m }, [tournaments])

  const albums = useMemo(() => {
    const byT: Record<string, Photo[]> = {}
    const other: Photo[] = []
    photos.forEach(p => { const tid = p.tournamentId || ''; if (tid && nameOf[tid]) (byT[tid] ||= []).push(p); else other.push(p) })
    const list: { id: string; name: string; photos: Photo[]; cover: Photo }[] = []
    tournaments.forEach(t => { const ps = byT[t.id]; if (ps && ps.length) list.push({ id: t.id, name: t.name, photos: ps, cover: ps.find(p => p.id === covers[t.id]) || ps[0] }) })
    if (other.length) list.push({ id: '__other', name: 'Other', photos: other, cover: other[0] })
    return list
  }, [photos, tournaments, nameOf, covers])

  const useAlbums = albums.length > 1

  const [folder, setFolder] = useState<string | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const current = useMemo(() => {
    if (!useAlbums || folder === '__all' || folder === null) return photos
    return albums.find(a => a.id === folder)?.photos || photos
  }, [useAlbums, folder, albums, photos])

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
        <AlbumCard name="All photos" count={photos.length} cover={photos[0]} onClick={() => openFolder('__all')} />
        {albums.map(a => <AlbumCard key={a.id} name={a.name} count={a.photos.length} cover={a.cover} onClick={() => openFolder(a.id)} />)}
      </div>
    )
  }

  const heading = useAlbums ? (folder === '__all' ? 'All photos' : (albums.find(a => a.id === folder)?.name || '')) : ''

  return (
    <>
      {useAlbums && <button onClick={backToAlbums} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"><ArrowLeft size={16} /> All albums</button>}
      {heading && <h2 className="text-xl font-bold text-slate-900 mb-4">{heading} <span className="text-slate-400 font-normal text-base">· {current.length}</span></h2>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {current.map((ph, i) => (
          <button key={ph.id || i} onClick={() => setActive(i)} className="group block rounded-2xl overflow-hidden border border-slate-200 bg-white text-left">
            <div className="aspect-square overflow-hidden">
              <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </div>
            {(ph.caption || ph.credit) && (
              <div className="px-3 py-2">
                {ph.caption && <p className="text-xs text-slate-600 truncate">{ph.caption}</p>}
                {ph.credit && <p className="text-[11px] text-slate-400 truncate flex items-center gap-1"><Camera size={11} /> {ph.credit}</p>}
              </div>
            )}
          </button>
        ))}
      </div>

      {cur && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={close}>
          <button onClick={close} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={26} /></button>
          {current.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"><ChevronLeft size={36} /></button>}
          {current.length > 1 && <button onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"><ChevronRight size={36} /></button>}
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img src={cur.url} alt={cur.caption || ''} className="max-h-[78vh] w-auto mx-auto rounded-lg object-contain" />
            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="text-white min-w-0">
                {cur.caption && <p className="text-sm font-medium">{cur.caption}</p>}
                <p className="text-xs text-white/60 truncate">{[cur.credit ? `Photo: ${cur.credit}` : '', cur.tournamentId ? nameOf[cur.tournamentId] : ''].filter(Boolean).join(' · ')}</p>
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

function AlbumCard({ name, count, cover, onClick }: { name: string; count: number; cover: Photo; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left rounded-2xl overflow-hidden border border-slate-200 bg-white">
      <div className="aspect-[4/3] overflow-hidden relative">
        {cover ? <img src={cover.url} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full bg-slate-100" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-xs text-white/80 flex items-center gap-1"><Images size={12} /> {count} photo{count === 1 ? '' : 's'}</p>
        </div>
      </div>
    </button>
  )
}
