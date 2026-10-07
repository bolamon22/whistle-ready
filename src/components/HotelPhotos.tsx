'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react'

// A hotel's photos on the families' pages. Bo sent the gallery on Legacy's hotel
// page (Oct 7 2026: "Are we able to show the images that the hotel provides so
// they can see the images on the page? Maybe with some thumbnails."). Three sizes:
//   grid  - the hotels page: the main photo with up to four tiles beside it and
//           the photo count, like that page; on a phone the tiles sit in a row
//           under the main photo.
//   thumb - the event page's Hotels section: one photo with the count.
//   mini  - the side rail's hotel list.
// Any photo opens the viewer on that photo: every photo large, arrows, arrow
// keys, swipe on a phone, Esc or X to close.
//
// Staff add the photos in Builder > Hotels; lib/eventHotels says where they come from.

export type HotelPhotosLayout = 'grid' | 'thumb' | 'mini'

// Wider screens: 4 columns x 2 rows, the main photo on the left half, so one to
// four tiles always fill the right half.
const TILE_SPAN: Record<number, string[]> = {
  1: ['sm:col-span-2 sm:row-span-2'],
  2: ['sm:col-span-2', 'sm:col-span-2'],
  3: ['sm:col-span-2', '', ''],
  4: ['', '', '', ''],
}

const seeAll = (n: number, name: string) => `See ${n} photo${n === 1 ? '' : 's'} of ${name}`

export default function HotelPhotos({ photos, name, layout = 'grid' }: { photos: string[]; name: string; layout?: HotelPhotosLayout }) {
  const [at, setAt] = useState<number | null>(null)
  if (!photos.length) return null
  const n = photos.length
  const viewer = at !== null && <PhotoViewer photos={photos} name={name} start={at} onClose={() => setAt(null)} />

  if (layout === 'mini') return (
    <>
      <button type="button" onClick={() => setAt(0)} aria-label={seeAll(n, name)} className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
        <img src={photos[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      </button>
      {viewer}
    </>
  )

  if (layout === 'thumb') return (
    <>
      <button type="button" onClick={() => setAt(0)} aria-label={seeAll(n, name)} className="group relative shrink-0 w-24 h-[72px] sm:w-32 sm:h-24 rounded-xl overflow-hidden bg-slate-100">
        <img src={photos[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        {n > 1 && <Count n={n} small />}
      </button>
      {viewer}
    </>
  )

  const tiles = photos.slice(1, 5)
  const more = n - 1 - tiles.length
  return (
    <>
      <div className={`grid grid-cols-4 gap-1.5 sm:gap-2 ${tiles.length ? 'sm:grid-rows-2 sm:h-64' : ''}`}>
        <button type="button" onClick={() => setAt(0)} aria-label={seeAll(n, name)}
          className={`group relative col-span-4 aspect-[16/10] overflow-hidden rounded-xl bg-slate-100 ${tiles.length ? 'sm:col-span-2 sm:row-span-2 sm:aspect-auto' : 'sm:aspect-auto sm:h-64'}`}>
          <img src={photos[0]} alt={name} decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          {n > 1 && <Count n={n} />}
        </button>
        {tiles.map((src, k) => (
          <button key={src + k} type="button" onClick={() => setAt(k + 1)} aria-label={`Photo ${k + 2} of ${n}, ${name}`}
            className={`group relative aspect-[4/3] sm:aspect-auto overflow-hidden rounded-lg sm:rounded-xl bg-slate-100 ${TILE_SPAN[tiles.length][k]}`}>
            <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            {more > 0 && k === tiles.length - 1 && <span className="absolute inset-0 bg-slate-900/50 text-white text-lg font-bold flex items-center justify-center">+{more}</span>}
          </button>
        ))}
      </div>
      {viewer}
    </>
  )
}

function Count({ n, small = false }: { n: number; small?: boolean }) {
  return small
    ? <span className="absolute left-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm"><Images size={11} aria-hidden />{n}</span>
    : <span className="absolute left-2.5 bottom-2.5 sm:left-3 sm:bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-slate-800 shadow"><Images size={15} aria-hidden />{n}</span>
}

/** Every photo, one at a time, over the page. */
function PhotoViewer({ photos, name, start, onClose }: { photos: string[]; name: string; start: number; onClose: () => void }) {
  const n = photos.length
  const [i, setI] = useState(start)
  const close = useRef(onClose)
  close.current = onClose
  const closeBtn = useRef<HTMLButtonElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)
  const go = (d: number) => setI(x => (x + d + n) % n)

  // Arrow keys and Esc; the page behind holds still; focus comes back where it was.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      else if (e.key === 'ArrowRight') setI(x => (x + 1) % n)
      else if (e.key === 'ArrowLeft') setI(x => (x - 1 + n) % n)
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      back?.focus?.()
    }
  }, [n])

  // Keep the current thumbnail in view, and fetch the neighbours so the arrows are instant.
  useEffect(() => {
    const s = strip.current
    const el = s?.querySelector<HTMLElement>(`[data-i="${i}"]`)
    if (s && el) s.scrollTo({ left: el.offsetLeft - (s.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
    if (n > 1) for (const k of [i + 1, i - 1]) { const im = new Image(); im.src = photos[(k + n) % n] }
  }, [i, n, photos])

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Photos of ${name}`} className="fixed inset-0 z-[1000] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{name}</div>
          <div className="text-xs text-white/60">{i + 1} of {n}</div>
        </div>
        <button ref={closeBtn} type="button" onClick={() => close.current()} aria-label="Close photos" className="p-2 -mr-2 rounded-full hover:bg-white/10"><X size={24} /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-20 pb-2"
        onClick={e => { if (e.target === e.currentTarget) close.current() }}
        onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null }}
        onTouchEnd={e => {
          const x0 = touchX.current, x1 = e.changedTouches[0]?.clientX
          touchX.current = null
          if (n > 1 && x0 != null && x1 != null && Math.abs(x1 - x0) > 40) go(x1 < x0 ? 1 : -1)
        }}>
        <img key={i} src={photos[i]} alt={`${name}, photo ${i + 1} of ${n}`} draggable={false} className="max-w-full max-h-full object-contain rounded-lg select-none" />
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 hover:bg-black/60 sm:bg-white/10 sm:hover:bg-white/20"><ChevronLeft size={26} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 hover:bg-black/60 sm:bg-white/10 sm:hover:bg-white/20"><ChevronRight size={26} /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <div ref={strip} className="relative overflow-x-auto">
          <div className="flex gap-2 w-max mx-auto px-4 py-3">
            {photos.map((src, k) => (
              <button key={src + k} data-i={k} type="button" onClick={() => setI(k)} aria-label={`Photo ${k + 1}`} aria-current={k === i ? 'true' : undefined}
                className={`shrink-0 w-16 h-12 sm:w-20 sm:h-14 rounded-md overflow-hidden ring-2 transition ${k === i ? 'ring-white' : 'ring-transparent opacity-50 hover:opacity-90'}`}>
                <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
