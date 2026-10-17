'use client'
import { useEffect, useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import { howToVideo, howToSrc, howToPoster, howToMinutes, howToVis, type HowToVisMap } from '@/lib/howToVideos'

// The Video library's Visibility picks (api/how-to/visibility), read once per page.
let visLoad: Promise<HowToVisMap> | null = null
export function useHowToVis(): HowToVisMap | null {
  const [m, setM] = useState<HowToVisMap | null>(null)
  useEffect(() => {
    visLoad = visLoad || fetch('/api/how-to/visibility').then(r => r.ok ? r.json() : null).then(d => (d?.visibility || {}) as HowToVisMap).catch(() => ({}))
    let live = true; visLoad.then(v => { if (live) setM(v) }); return () => { live = false }
  }, [])
  return m
}

/** Full-screen player for one how-to video. Escape or the X closes it. */
export function HowToPlayer({ id, onClose }: { id: string; onClose: () => void }) {
  const v = howToVideo(id)
  const vis = useHowToVis()
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!v) return null
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={v.title} onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close video" className="absolute top-3 right-3 text-white/80 hover:text-white p-2"><X size={26} /></button>
      {vis && <video src={howToSrc(id, vis)} poster={howToPoster(id)} controls autoPlay playsInline onClick={e => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl bg-black" />}
      <p className="text-white/80 text-sm mt-3">{v.title}</p>
    </div>
  )
}

/** "Watch how (1 min video)": plays a how-to video in place (members-only ones only
 *  play for a signed-in club director or staff, see lib/howToVideos). */
export default function HowToVideoLink({ id, label = 'Watch how', className = '', openOnWatch = false, members = false }: { id: string; label?: string; className?: string; openOnWatch?: boolean; members?: boolean }) {
  const [open, setOpen] = useState(false)
  // `members`: this link is on a signed-in club director's page, so a Club directors
  // video may show; anywhere else only a Public one does.
  const vis = useHowToVis()
  // ?watch=<id> (the emailed link to a members-only video) plays it on arrival.
  useEffect(() => { if (openOnWatch && new URLSearchParams(window.location.search).get('watch') === id) setOpen(true) }, [openOnWatch, id])
  const v = howToVideo(id)
  if (!v || !vis || (!members && howToVis(id, vis) !== 'public')) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline ${className}`}>
        <PlayCircle size={14} /> {label} ({howToMinutes(v.secs)} video)
      </button>
      {open && <HowToPlayer id={id} onClose={() => setOpen(false)} />}
    </>
  )
}
