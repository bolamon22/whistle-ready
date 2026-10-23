'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import EventBackLink from '@/components/EventBackLink'
import { Trophy, Medal, Camera, Check, Film, Eye, Printer } from 'lucide-react'
import { uploadChampionPhoto, uploadChampionVideo, CHAMP_VIDEO_MAX_SECONDS } from '@/lib/championMedia'

// Awards and champion photos (Bo, Oct 14 2026): after each championship the field
// director (or field ops) hands out the medals or trophy and takes the champions'
// photo, and ticks both here so nothing is missed by the end of the day. One row per
// division: its championship game, or the division itself when it's pool play only.
// Data: api/tournaments/[id]/awards.
// The photo, and a short video of them with the trophy (Oct 17 2026), go across the top
// of the division's public bracket once a director, admin or field director turns on
// Show on the public bracket (components/ChampionHero). Preview opens it for staff only.

type Row = { key: string; division: string
  game: { id: string; gameNumber: string; date: string; startTime: string; location: string; team1: string; team2: string; score1: number | null; score2: number | null } | null
  mark: { awards?: boolean; photo?: boolean; photoUrl?: string; videoUrl?: string; posterUrl?: string; public?: boolean; note?: string; by?: string; at?: string } }

const time12 = (t: string) => { const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(t || ''); if (!m) return t; if (m[3]) return `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}`; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}` }
const dayLabel = (d: string) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : ''
const placeholder = (t: string) => /^(winner|loser|seed|tbd|w-b|l-b)/i.test(t || '')

export default function AwardsPage() {
  const { id } = useParams()
  const tid = Array.isArray(id) ? id[0] : String(id)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const fileFor = useRef<string>('')
  const fileInput = useRef<HTMLInputElement>(null)
  const videoFor = useRef<string>('')
  const videoInput = useRef<HTMLInputElement>(null)
  // Uploading a clip takes a few seconds on a field's signal: say how far it has got.
  const [progress, setProgress] = useState<Record<string, string>>({})
  // Who may put a row on the public bracket (lib/awards AWARD_PUBLISH_ROLES).
  const [canPublish, setCanPublish] = useState(false)

  function load() {
    fetch(`/api/tournaments/${encodeURIComponent(tid)}/awards`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not load awards'); return }
      setRows(d.rows || [])
      setCanPublish(!!d.canPublish)
    }).catch(() => setErr('Could not load awards'))
  }
  useEffect(load, [tid])

  async function save(key: string, patch: Record<string, unknown>) {
    setBusy(key)
    const r = await fetch(`/api/tournaments/${encodeURIComponent(tid)}/awards`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...patch }) }).catch(() => null)
    setBusy('')
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r?.ok) { toast.error(d.error || 'Could not save'); return }
    setRows(rs => (rs || []).map(x => x.key === key ? { ...x, mark: d.mark } : x))
  }
  // Shrunk to 2000px before it uploads (lib/championMedia): families download this
  // file on the public bracket, and a phone photo is several megabytes.
  async function upload(file: File) {
    const key = fileFor.current
    if (!key || !file) return
    setBusy(key)
    let url = ''
    try { url = await uploadChampionPhoto(file) } catch (e: any) {
      setBusy('')
      toast.error(`${String(e?.message || 'The photo didn’t upload. Try again.')} Or just tick Photo taken.`)
      return
    }
    setBusy('')
    await save(key, { photoUrl: url })
    toast.success('Photo saved')
  }
  async function uploadVideo(file: File) {
    const key = videoFor.current
    if (!key || !file) return
    setBusy(key)
    setProgress(p => ({ ...p, [key]: 'Checking the video…' }))
    try {
      const v = await uploadChampionVideo(file, tid, key, pct => setProgress(p => ({ ...p, [key]: `Uploading the video… ${pct}%` })))
      setBusy('')
      await save(key, { videoUrl: v.videoUrl, posterUrl: v.posterUrl })
      toast.success('Video saved')
    } catch (e: any) {
      setBusy('')
      toast.error(String(e?.message || 'The video didn’t upload. Try again.').replace(/^Error:\s*/, ''), { duration: 7000 })
    } finally {
      setProgress(p => { const n = { ...p }; delete n[key]; return n })
    }
  }

  const winner = (g: NonNullable<Row['game']>) => g.score1 == null || g.score2 == null ? '' : g.score1 > g.score2 ? g.team1 : g.score2 > g.score1 ? g.team2 : ''
  const done = (rows || []).filter(r => r.mark.awards && r.mark.photo).length

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster position="top-right" />
      <EventBackLink id={tid} />
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Trophy size={22} className="text-amber-500" /> Awards and champion photos</h1>
      <p className="text-sm text-slate-500 mb-4">After each championship, hand out the awards and take the champions&apos; photo, then tick both here.{rows && rows.length > 0 ? ` ${done} of ${rows.length} divisions done.` : ''}</p>
      {/* When each championship should end, so awards go out on time (Bo, Oct 23 2026). */}
      <a href={`/tournaments/${tid}/print-schedule?day=all&layout=champ`} className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:min-h-0 sm:py-2"><Printer size={15} aria-hidden /> Championship times to print</a>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-400">No divisions have games yet.</p>}
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
      {/* No capture attribute: a clip is often shot first and picked from the camera roll. */}
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadVideo(f) }} />

      <div className="space-y-2.5">
        {(rows || []).map(r => {
          const g = r.game
          const w = g ? winner(g) : ''
          const all = !!(r.mark.awards && r.mark.photo)
          const btn = (on: boolean) => `flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold border ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`
          return (
            <div key={r.key} className={`rounded-2xl border p-3.5 ${all ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900">{r.division}</p>
                  {g ? (
                    <p className="text-xs text-slate-500 mt-0.5">Championship #{g.gameNumber} · {dayLabel(g.date)} {time12(g.startTime)} · {(g.location.split(' - ').pop() || '').trim()}</p>
                  ) : <p className="text-xs text-slate-500 mt-0.5">Pool play only: the winner of the standings</p>}
                  {g && (w
                    ? <p className="text-sm font-bold text-slate-800 mt-1">Champions: {w} <span className="font-normal text-slate-500">({Math.max(g.score1!, g.score2!)}–{Math.min(g.score1!, g.score2!)})</span></p>
                    : <p className="text-xs text-slate-500 mt-1">{placeholder(g.team1) || placeholder(g.team2) ? 'Not decided yet' : `${g.team1} vs ${g.team2}`}{g.score1 == null ? ' · not played yet' : ''}</p>)}
                </div>
                {all && <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check size={14} /> Done</span>}
              </div>
              <div className="flex gap-2 mt-3">
                <button type="button" disabled={busy === r.key} onClick={() => save(r.key, { awards: !r.mark.awards })} aria-pressed={!!r.mark.awards} className={btn(!!r.mark.awards)}><Medal size={15} /> Awards given</button>
                <button type="button" disabled={busy === r.key} onClick={() => save(r.key, { photo: !r.mark.photo })} aria-pressed={!!r.mark.photo} className={btn(!!r.mark.photo)}><Camera size={15} /> Photo taken</button>
              </div>
              <div className="flex items-center gap-3 mt-2">
                {r.mark.photoUrl && <a href={r.mark.photoUrl} target="_blank" rel="noreferrer"><img src={r.mark.photoUrl} alt={`${r.division} champions`} className="h-14 w-20 object-cover rounded-lg border border-slate-200" /></a>}
                <button type="button" disabled={busy === r.key} onClick={() => { fileFor.current = r.key; fileInput.current?.click() }} className="text-xs font-semibold text-teal-700 hover:text-teal-900">{r.mark.photoUrl ? 'Replace photo' : 'Add the photo'}</button>
                {r.mark.by && <span className="text-[11px] text-slate-400 ml-auto">{r.mark.by} · {r.mark.at ? new Date(r.mark.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span>}
              </div>
              <div className="flex items-center gap-3 mt-2">
                {r.mark.videoUrl && <video src={r.mark.videoUrl} poster={r.mark.posterUrl || undefined} muted playsInline preload="metadata" aria-label={`${r.division} champions' video`} className="h-14 w-20 object-cover rounded-lg border border-slate-200 bg-slate-900" />}
                <button type="button" disabled={busy === r.key} onClick={() => { videoFor.current = r.key; videoInput.current?.click() }} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"><Film size={14} />{r.mark.videoUrl ? 'Replace video' : 'Add a video'}</button>
                {r.mark.videoUrl && <button type="button" disabled={busy === r.key} onClick={() => save(r.key, { videoUrl: '' })} className="text-xs font-semibold text-slate-400 hover:text-red-700">Remove video</button>}
                {progress[r.key]
                  ? <span className="text-[11px] text-slate-500 ml-auto" role="status">{progress[r.key]}</span>
                  : !r.mark.videoUrl && <span className="text-[11px] text-slate-400 ml-auto">Up to {CHAMP_VIDEO_MAX_SECONDS} seconds; 5 is plenty</span>}
              </div>
              {(r.mark.photoUrl || r.mark.videoUrl) && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span id={`pub-${r.key}`} className="text-sm font-bold text-slate-800">Show on the public bracket</span>
                    <button type="button" role="switch" aria-checked={!!r.mark.public} aria-labelledby={`pub-${r.key}`} disabled={busy === r.key || !canPublish}
                      onClick={() => save(r.key, { public: !r.mark.public })}
                      className={`relative h-8 w-[52px] flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${r.mark.public ? 'bg-teal-600' : 'bg-slate-300'}`}>
                      <span aria-hidden className={`absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow transition-all ${r.mark.public ? 'left-[23px]' : 'left-[3px]'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{r.mark.public
                    ? `Families see the ${r.mark.videoUrl ? 'video' : 'photo'} across the top of the ${r.division} bracket once the final is scored.`
                    : canPublish ? 'Only staff can see it until you turn this on.' : 'Only staff can see it. A director or field director puts it on the public bracket.'}</p>
                </div>
              )}
              {g && (
                <a href={`/tournaments/${encodeURIComponent(tid)}/public?division=${encodeURIComponent(r.division)}&tab=bracket&preview=champions`} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900"><Eye size={14} />Preview on the bracket</a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
