'use client'
import { useCallback, useEffect, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { HOW_TO_VIDEOS, howToPoster, howToMinutes } from '@/lib/howToVideos'
import { HowToPlayer } from '@/components/HowToVideoLink'

/** The video cards. ?v=<id> (the links in our emails) opens that one straight away.
 *  Only the videos set to Public (page.tsx passes their ids) are on this page. */
export default function HowToGrid({ ids }: { ids: string[] }) {
  const list = HOW_TO_VIDEOS.filter(v => ids.includes(v.id))
  const [open, setOpen] = useState('')
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('v') || ''
    if (ids.includes(v)) setOpen(v)
  }, [ids])
  const close = useCallback(() => setOpen(''), [])
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        {list.map(v => (
          <button key={v.id} type="button" onClick={() => setOpen(v.id)}
            className="text-left bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-teal-300 transition">
            <div className="relative aspect-[9/16] max-h-80 w-full bg-slate-100 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={howToPoster(v.id)} alt="" className="w-full h-full object-cover object-center" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 bg-teal-700 text-white text-sm font-semibold pl-2.5 pr-3.5 py-1.5 rounded-full shadow"><PlayCircle size={18} /> Play</span>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{v.audience} · {howToMinutes(v.secs)}</p>
              <h2 className="font-bold text-slate-900 mt-1">{v.title}</h2>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{v.blurb}</p>
            </div>
          </button>
        ))}
      </div>
      {open && <HowToPlayer id={open} onClose={close} />}
    </>
  )
}
