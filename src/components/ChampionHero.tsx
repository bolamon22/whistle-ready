'use client'
import { useEffect, useState } from 'react'
import { Trophy, Share2, Route, Camera, Film, Eye, Check, Play } from 'lucide-react'

// The champions across the top of a division's bracket once the final is scored (Bo,
// Oct 17 2026: "a hero type image of the champion team", then "a five second video of
// the champion team ... winning and holding their trophies"; approved mockup: the
// "Champion Photo Hero" canvas). The photo or clip comes from the Awards page and
// shows here only once a director, admin or field director turns on Show on the public
// bracket there (api/tournaments/[id]/champion-media). Without one, BracketChart keeps
// its plain champion banner.

export type ChampMedia = {
  /** The photo, or the video's cover frame. */
  url: string
  videoUrl?: string
  /** Staff preview of something not public yet (the Awards page's Preview link). */
  preview?: boolean
  /** Staff preview with nothing added yet: the built-in sample picture. */
  sample?: boolean
}

export const SAMPLE_CHAMP_PICTURE = '/champions-sample.svg'

// result: "Beat H44 8–6 in the final"; detail: "Sun 1:50 PM · Field 5", shown from md up
// (on a phone it wrapped one word onto a line of its own).
export default function ChampionHero({ media, team, logo, division, flight, eventName, year, result, detail, chips, onPath }: {
  media: ChampMedia; team: string; logo?: string; division: string; flight?: string; eventName?: string; year?: string
  result: string; detail?: string; chips: string[]; onPath: () => void
}) {
  const [copied, setCopied] = useState(false)
  // Muted, looping and inline, so phones play it in place like a moving photo. Families
  // who asked their phone for less motion or less data get the photo and a Play button.
  const [autoplay, setAutoplay] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  useEffect(() => {
    try {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const saveData = !!(navigator as any).connection?.saveData
      setAutoplay(!calm && !saveData)
    } catch { setAutoplay(true) }
  }, [])
  const hasVideo = !!media.videoUrl && !videoFailed
  const showVideo = hasVideo && (autoplay || playing)

  const share = async () => {
    let url = ''
    try {
      const u = new URL(window.location.href)
      u.search = ''; u.hash = ''
      u.searchParams.set('division', division); u.searchParams.set('tab', 'bracket')
      url = u.toString()
    } catch { return }
    const title = `${team}: ${division} champions${eventName ? `, ${eventName}` : ''}`
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title, text: title, url }); return } catch (e: any) { if (e?.name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* no clipboard here */ }
  }

  const initials = team.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || team.substring(0, 2).toUpperCase()
  const label = media.sample ? 'Sample picture' : hasVideo ? 'Champions’ video' : 'Champions’ photo'
  return (
    <div className="space-y-2">
      {(media.preview || media.sample) && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900" data-testid="champ-preview-note">
          <Eye size={15} className="mt-0.5 flex-shrink-0" />
          {media.sample
            ? 'Preview with a sample picture: only staff see this. Add the champions’ photo or video on the Awards page.'
            : 'Preview: only staff see this until Show on the public bracket is turned on in Awards.'}
        </p>
      )}
      <section aria-label={`${[division, flight].filter(Boolean).join(' ')} champions`} className="relative h-[480px] overflow-hidden rounded-2xl bg-[#0b1f3a] shadow-lg md:h-[470px]">
        {media.url && <img src={media.url} alt={media.sample ? 'Sample picture of a team holding up a trophy' : `${team}, the ${division} champions`} className="absolute inset-0 h-full w-full object-cover object-[50%_40%]" />}
        {showVideo && (
          <video src={media.videoUrl} poster={media.url || undefined} autoPlay muted loop playsInline preload="auto"
            onError={() => setVideoFailed(true)} aria-label={`Video of ${team}, the ${division} champions`}
            className="absolute inset-0 h-full w-full object-cover object-[50%_40%]" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#040c18]/95 via-[#040c18]/55 to-transparent md:via-[#040c18]/30" />
        <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-r from-[#040c18]/85 via-[#040c18]/40 to-transparent md:block" />
        <span className="absolute right-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#040c18]/45 px-2.5 py-1 text-[11px] font-semibold text-white/90">{hasVideo ? <Film size={12} /> : <Camera size={12} />}{label}</span>
        {hasVideo && !showVideo && (
          <button type="button" onClick={() => setPlaying(true)} className="absolute left-1/2 top-[34%] inline-flex min-h-[44px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/95 px-5 text-sm font-semibold text-[#0b1f3a] shadow-lg"><Play size={16} />Play the video</button>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-[18px] md:flex-row md:items-end md:justify-between md:p-10">
          <div className="flex min-w-0 max-w-[600px] flex-col gap-2.5">
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-200 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-900 md:text-xs"><Trophy size={14} />{year ? `${year} champions` : 'Champions'}</span>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-200 md:text-[13px]">{[division, flight, eventName].filter(Boolean).join(' \u00b7 ')}</p>
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              {logo
                ? <span className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-[3px] border-amber-200 bg-white md:h-16 md:w-16"><img src={logo} alt="" className="h-full w-full object-contain" /></span>
                : <span aria-hidden className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-[3px] border-amber-200 bg-[#0e7490] text-xl font-extrabold text-white md:h-16 md:w-16 md:text-[26px]">{initials}</span>}
              <h2 className="min-w-0 break-words text-[40px] font-extrabold leading-none tracking-tight text-white md:text-[64px]">{team}</h2>
            </div>
            <p className="text-[15px] leading-snug text-white/90 md:text-[17px]">{result}{detail && <span className="hidden md:inline">{' \u00b7 '}{detail}</span>}</p>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {chips.map(c => <span key={c} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white md:px-3 md:text-[13px]">{c}</span>)}
              </div>
            )}
          </div>
          <div className="flex gap-2 md:flex-shrink-0">
            <button type="button" onClick={share} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-white/95 px-5 text-sm font-semibold text-[#0b1f3a] md:flex-none">
              {copied ? <><Check size={16} />Link copied</> : <><Share2 size={16} />Share</>}
            </button>
            <button type="button" onClick={onPath} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white md:flex-none">
              <Route size={16} /><span className="md:hidden">Their path</span><span className="hidden md:inline">Light up their path</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
