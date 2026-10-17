'use client'
import { useEffect, useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import { howToVideo, howToSrc, howToPoster, howToMinutes } from '@/lib/howToVideos'

/** Full-screen player for one how-to video. Escape or the X closes it. */
export function HowToPlayer({ id, onClose }: { id: string; onClose: () => void }) {
  const v = howToVideo(id)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!v) return null
  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={v.title} onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close video" className="absolute top-3 right-3 text-white/80 hover:text-white p-2"><X size={26} /></button>
      <video src={howToSrc(id)} poster={howToPoster(id)} controls autoPlay playsInline onClick={e => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-xl bg-black" />
      <p className="text-white/80 text-sm mt-3">{v.title}</p>
    </div>
  )
}

/** "Watch how (1 min video)": plays a how-to video in place (members-only ones only
 *  play for a signed-in club director or staff, see lib/howToVideos). */
export default function HowToVideoLink({ id, label = 'Watch how', className = '', openOnWatch = false }: { id: string; label?: string; className?: string; openOnWatch?: boolean }) {
  const [open, setOpen] = useState(false)
  // ?watch=<id> (the emailed link to a members-only video) plays it on arrival.
  useEffect(() => { if (openOnWatch && new URLSearchParams(window.location.search).get('watch') === id) setOpen(true) }, [openOnWatch, id])
  const v = howToVideo(id)
  if (!v) return null
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
