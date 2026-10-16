'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ChevronRight, Play, X, GraduationCap } from 'lucide-react'
import { trainingGroups, groupsFor, videosFor, trainingVideo, videoSrc, posterSrc, minutesLabel, type TrainingVideo } from '@/lib/training'

// Training videos for staff (Oct 2026). Each person sees the groups for their roles
// first ("Start here" for everyone), the rest folded under "More videos". A video
// counts as watched once it plays to 85%, so the Staff roster can show who's ready.

export default function TrainingPage() {
  const [roles, setRoles] = useState<string[] | null>(null)
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  // Their organization's plan (api/training): only the videos about pages it has.
  const [planOff, setPlanOff] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/training').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d) { setRoles(Array.isArray(d.roles) ? d.roles : []); setWatched(new Set(Array.isArray(d.watched) ? d.watched : [])); setPlanOff(Array.isArray(d.planOff) ? d.planOff : []) }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])
  // A "Watch how" link elsewhere in the app opens straight to its video.
  // (Read from the URL here, not useSearchParams, which would need a Suspense boundary.)
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('v'); if (v && trainingVideo(v)) setPlaying(v) }, [])

  // Called once per viewing (the player guards it), so every rewatch adds to the play count.
  function markWatched(id: string) {
    setWatched(s => new Set(s).add(id))
    fetch('/api/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: id }) }).catch(() => {})
  }

  const mine = groupsFor(roles, planOff)
  const mineKeys = new Set(mine.map(g => g.key))
  const other = trainingGroups(planOff).filter(g => !mineKeys.has(g.key))
  const want = videosFor(roles, planOff)
  const done = want.filter(v => watched.has(v)).length
  const pct = want.length ? Math.round((done / want.length) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard/staff" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ArrowLeft size={15} /> My portal</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><GraduationCap size={24} className="text-teal-600" /> Training videos</h1>
      <p className="text-sm text-slate-500 mt-1">Short videos of the real screens, about a minute each. Watch the ones for your job before your first game day.</p>

      {loaded && (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-800">{done} of {want.length} watched</span>
            {done === want.length && want.length > 0 && <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> All done</span>}
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {mine.map(g => <Group key={g.key} label={g.label} ids={g.ids} watched={watched} onPlay={setPlaying} />)}

      {other.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowMore(s => !s)} className="text-sm font-semibold text-teal-700 hover:underline inline-flex items-center gap-1">
            {showMore ? 'Hide' : 'More videos'} <ChevronRight size={15} className={showMore ? 'rotate-90 transition-transform' : 'transition-transform'} />
          </button>
          {showMore && other.map(g => <Group key={g.key} label={g.label} ids={g.ids} watched={watched} onPlay={setPlaying} />)}
        </div>
      )}

      {playing && <Player id={playing} onClose={() => setPlaying(null)} onWatched={markWatched}
        next={(() => { const i = want.indexOf(playing); return i >= 0 && i < want.length - 1 ? want[i + 1] : null })()} onNext={setPlaying} />}
    </div>
  )
}

function Group({ label, ids, watched, onPlay }: { label: string; ids: string[]; watched: Set<string>; onPlay: (id: string) => void }) {
  const vids = ids.map(trainingVideo).filter((v): v is TrainingVideo => !!v)
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</h2>
      <ul className="space-y-2">
        {vids.map(v => (
          <li key={v.id}>
            <button type="button" onClick={() => onPlay(v.id)}
              className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-2.5 text-left hover:border-teal-300 hover:bg-teal-50/40 transition-colors">
              <div className="relative w-16 h-20 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={posterSrc(v.id)} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center"><Play size={13} className="text-teal-700 ml-0.5" fill="currentColor" /></span></span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-snug">{v.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{v.blurb}</p>
                <p className="text-[11px] text-slate-400 mt-1">{minutesLabel(v.secs)}</p>
              </div>
              {watched.has(v.id)
                ? <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" aria-label="Watched" />
                : <span className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" aria-label="Not watched yet" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Player({ id, next, onClose, onWatched, onNext }: { id: string; next: string | null; onClose: () => void; onWatched: (id: string) => void; onNext: (id: string) => void }) {
  const v = trainingVideo(id)
  const ref = useRef<HTMLVideoElement>(null)
  const [ended, setEnded] = useState(false)
  // One count per viewing: reset when a new video opens or this one is replayed from the start.
  const counted = useRef(false)
  useEffect(() => { setEnded(false); counted.current = false }, [id])
  const count = () => { if (!counted.current) { counted.current = true; onWatched(id) } }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!v) return null
  const nv = next ? trainingVideo(next) : null
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col" role="dialog" aria-label={v.title}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="text-sm font-semibold truncate">{v.title}</p>
        <button type="button" onClick={onClose} aria-label="Close video" className="p-2 rounded-lg hover:bg-white/10"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <video key={id} ref={ref} src={videoSrc(id)} poster={posterSrc(id)} controls autoPlay playsInline preload="metadata"
          controlsList="nodownload noplaybackrate" disablePictureInPicture onContextMenu={e => e.preventDefault()}
          className="max-h-full max-w-full rounded-xl bg-black"
          onTimeUpdate={e => { const t = e.currentTarget; if (t.duration && t.currentTime / t.duration >= 0.85) count() }}
          onPlay={e => { if (e.currentTarget.currentTime < 1) counted.current = false }}
          onEnded={() => { count(); setEnded(true) }} />
      </div>
      <div className="px-4 py-3 flex justify-end gap-2">
        {nv && (
          <button type="button" onClick={() => onNext(nv.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ${ended ? 'bg-teal-600 hover:bg-teal-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
            Next: {nv.title} <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
