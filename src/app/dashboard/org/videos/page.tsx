'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { CheckCircle2, ChevronLeft, ChevronDown, ChevronRight, FileText, Mail, PlayCircle, Search, Send, Users, X } from 'lucide-react'
import { TRAINING_VIDEOS, TRAINING_GROUPS, TRAINING_ROLE_LABELS, audienceFor, posterSrc, videoSrc, minutesLabel, trainingVideo } from '@/lib/training'
import { HOW_TO_VIDEOS, howToSrc, howToPoster, howToMinutes } from '@/lib/howToVideos'
import { VIDEO_SCRIPTS } from '@/lib/videoScripts.generated'

// The Video library (Bo, Oct 13 2026: "one location that I can refer to to see all the
// videos"). Every training and how-to video in one place: play it, read its script and
// note changes for the next re-recording, email videos to staff by role or name, and see
// who has watched what and how many times. Staff videos play only inside a login
// (api/training/video) -- there is deliberately no download.

type Lib = { id: string; num: string; title: string; blurb: string; secs: number; series: 'staff' | 'assigner' | 'family'; audience: string; src: string; poster: string }
type Person = { id: string; name: string; email: string; roles: string[]; assigned: string[]; watched: Record<string, { plays: number; first: string; last: string }> }
type SendLog = { at: string; by: string; videoIds: string[]; roles: string[]; people: string[]; sent: number }

const LIB: Lib[] = [
  ...TRAINING_VIDEOS.map(v => ({ ...v, series: (v.series || 'staff') as 'staff' | 'assigner', audience: audienceFor(v.id), src: videoSrc(v.id), poster: posterSrc(v.id) })),
  ...HOW_TO_VIDEOS.map((v, i) => ({ id: v.id, num: `F0${i + 1}`, title: v.title, blurb: v.blurb, secs: v.secs, series: 'family' as const, audience: v.audience, src: howToSrc(v.id), poster: howToPoster(v.id) })),
]
const SERIES: { key: Lib['series']; label: string; note: string }[] = [
  { key: 'staff', label: 'Staff training', note: 'Phone videos for scorekeepers, refs, field ops and trainers. Inside their login on the Training page, and linked from the screens they teach.' },
  { key: 'assigner', label: 'Assigner training', note: 'Computer videos for the people who staff your games. Inside their login on the Training page.' },
  { key: 'family', label: 'Families & clubs', note: 'Public how-to videos, Sunshine Events Group branded: on the waiver, the club portal, club emails and sunshineeventsgroup.com/how-to. Not tracked.' },
]
const ROLE_KEYS = ['scorekeeper', 'ref', 'field_ops', 'athletic_trainer', 'assigner']
// "Who it's for" filter. Staff roles come from the Training page groups (a group with no
// roles is for every staff role); the family how-to videos go by their audience.
const FOR_FILTERS: [string, string][] = [...ROLE_KEYS.map(k => [k, TRAINING_ROLE_LABELS[k]] as [string, string]), ['parent', 'Parents'], ['club_director', 'Club directors']]
function rolesOf(v: Lib): string[] {
  if (v.series === 'family') return [/parent/i.test(v.audience) ? 'parent' : '', /club/i.test(v.audience) ? 'club_director' : ''].filter(Boolean)
  const gs = TRAINING_GROUPS.filter(g => g.ids.includes(v.id))
  return gs.some(g => !g.roles) ? ROLE_KEYS : Array.from(new Set(gs.flatMap(g => g.roles || [])))
}
/** "All of Assigner training (12)" when a whole series is picked, else the titles (first few). */
function bundleSummary(ids: string[]): string {
  const parts: string[] = []; const loose: string[] = []
  for (const s of SERIES) {
    const all = LIB.filter(v => v.series === s.key).map(v => v.id); const got = all.filter(id => ids.includes(id))
    if (got.length && got.length === all.length && all.length > 1) parts.push(`all of ${s.label} (${all.length})`)
    else loose.push(...got.map(id => LIB.find(v => v.id === id)!.title))
  }
  const shown = loose.slice(0, 3).join(', ') + (loose.length > 3 ? ` and ${loose.length - 3} more` : '')
  const out = [...parts, shown].filter(Boolean).join(' + ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
const noSave = { onContextMenu: (e: React.MouseEvent) => e.preventDefault(), controlsList: 'nodownload', disablePictureInPicture: true } as const

export default function VideoLibrary() {
  const [tab, setTab] = useState<'videos' | 'watched' | 'sent'>('videos')
  const [playing, setPlaying] = useState<Lib | null>(null)
  const [scriptFor, setScriptFor] = useState<Lib | null>(null)
  const [notes, setNotes] = useState<Record<string, { text: string; by: string; at: string }>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [sends, setSends] = useState<SendLog[]>([])
  const [fSeries, setFSeries] = useState<string>('all')
  const [fFor, setFFor] = useState<string>('all')
  const [fQ, setFQ] = useState('')
  const shown = useMemo(() => LIB.filter(v => (fSeries === 'all' || v.series === fSeries) && (fFor === 'all' || rolesOf(v).includes(fFor))
    && (!fQ.trim() || `${v.num} ${v.title} ${v.blurb}`.toLowerCase().includes(fQ.trim().toLowerCase()))), [fSeries, fFor, fQ])
  const filtered = fSeries !== 'all' || fFor !== 'all' || !!fQ.trim()

  const loadPeople = () => fetch('/api/training?report=1').then(r => r.ok ? r.json() : null).then(d => setPeople(Array.isArray(d?.people) ? d.people : [])).catch(() => setPeople([]))
  const loadSends = () => fetch('/api/training/send').then(r => r.ok ? r.json() : null).then(d => setSends(Array.isArray(d?.sends) ? d.sends : [])).catch(() => {})
  useEffect(() => {
    fetch('/api/training/script-notes').then(r => r.ok ? r.json() : null).then(d => { if (d?.notes) setNotes(d.notes) }).catch(() => {})
    loadPeople(); loadSends()
  }, [])

  // How many of the people a video is for have watched it.
  const reach = useMemo(() => {
    const m: Record<string, { done: number; of: number; plays: number }> = {}
    for (const p of people || []) for (const id of p.assigned) {
      const r = m[id] || { done: 0, of: 0, plays: 0 }; r.of++
      if (p.watched[id]) { r.done++; r.plays += p.watched[id].plays }
      m[id] = r
    }
    return m
  }, [people])

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  // One box picks the whole bundle (every video showing in that section).
  const toggleAll = (ids: string[]) => setPicked(s => { const n = new Set(s); const all = ids.every(id => n.has(id)); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n })
  const sendBundle = (ids: string[]) => { setPicked(new Set(ids)); setSending(true) }

  return (
    <div className="max-w-6xl mx-auto" data-testid="video-library">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Home</Link>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Video library</h1>
          <p className="text-sm text-slate-500 mt-1">{LIB.length} videos. Play them, read the scripts, send them to your staff, and see who has watched.</p>
        </div>
        <button type="button" disabled={!picked.size} onClick={() => setSending(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold">
          <Send size={15} /> {picked.size ? `Send ${picked.size} video${picked.size === 1 ? '' : 's'}` : 'Tick videos to send'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5" role="tablist">
        {([['videos', 'Videos'], ['watched', 'Who’s watched'], ['sent', 'Sent']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'videos' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-6 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">Type</span>
            {[['all', 'All'] as [string, string], ...SERIES.map(s => [s.key, s.label] as [string, string])].map(([k, label]) => {
              const n = k === 'all' ? LIB.length : LIB.filter(v => v.series === k).length
              return <Chip key={k} on={fSeries === k} onClick={() => setFSeries(k)}>{label} <span className="opacity-60">{n}</span></Chip>
            })}
            <div className="relative ml-auto w-full sm:w-56"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Search videos" aria-label="Search videos" className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">For</span>
            <Chip on={fFor === 'all'} onClick={() => setFFor('all')}>Everyone</Chip>
            {FOR_FILTERS.map(([k, label]) => <Chip key={k} on={fFor === k} onClick={() => setFFor(k)}>{label}</Chip>)}
            {filtered && <button type="button" onClick={() => { setFSeries('all'); setFFor('all'); setFQ('') }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 ml-1">Clear filters</button>}
          </div>
        </div>
      )}
      {tab === 'videos' && filtered && shown.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No videos match those filters.</p>}

      {tab === 'videos' && SERIES.filter(s => shown.some(v => v.series === s.key)).map(s => {
        const list = shown.filter(v => v.series === s.key); const ids = list.map(v => v.id); const bundle = s.key !== 'family'
        const nOn = ids.filter(id => picked.has(id)).length
        return (
        <section key={s.key} className="mb-8">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{s.label} <span className="text-sm font-semibold text-slate-400">{list.length}{filtered ? ` of ${LIB.filter(v => v.series === s.key).length}` : ''}</span></h2>
              <p className="text-sm text-slate-500">{s.note}</p>
            </div>
            {bundle && (
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 cursor-pointer hover:border-teal-400">
                  <AllBox checked={nOn === ids.length} mixed={nOn > 0 && nOn < ids.length} onChange={() => toggleAll(ids)} label={`Select all ${s.label}`} />
                  Select all {ids.length}
                </label>
                <button type="button" onClick={() => sendBundle(ids)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm font-semibold hover:bg-teal-100">
                  <Send size={14} /> Send all {ids.length}
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(v => {
              const r = reach[v.id]; const sendable = v.series !== 'family'
              return (
                <article key={v.id} className={`bg-white border rounded-xl overflow-hidden flex flex-col ${picked.has(v.id) ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => setPlaying(v)} className="group relative block bg-slate-900 aspect-video overflow-hidden" aria-label={`Play ${v.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.poster} alt="" className="w-full h-full object-cover opacity-90" />
                    <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white opacity-90 group-hover:bg-teal-600"><PlayCircle size={15} /> Play</span>
                    <span className="absolute bottom-2 right-2 text-[11px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">{v.series === 'family' ? howToMinutes(v.secs) : minutesLabel(v.secs)}</span>
                  </button>
                  <div className="p-3.5 flex-1 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      {sendable && <input type="checkbox" checked={picked.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Select ${v.title}`} className="mt-1 accent-teal-600" />}
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 tracking-wide">{v.num} · {v.audience.toUpperCase()}</p>
                        <h3 className="font-semibold text-slate-900 leading-snug">{v.title}</h3>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">{v.blurb}</p>
                    <div className="mt-auto pt-2 flex items-center justify-between gap-2 text-xs">
                      <button type="button" onClick={() => setScriptFor(v)} className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900">
                        <FileText size={13} /> Script{notes[v.id] ? <span className="ml-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5">changes noted</span> : ''}
                      </button>
                      {sendable && people && (r ? <span className="text-slate-500"><b className="text-slate-800">{r.done}</b> of {r.of} watched{r.plays > r.done ? ` · ${r.plays} plays` : ''}</span> : <span className="text-slate-400">Nobody assigned</span>)}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
        )
      })}

      {tab === 'videos' && picked.size > 0 && !sending && (
        <div className="sticky bottom-4 z-30 mt-2 flex justify-center">
          <div className="flex items-center gap-3 bg-slate-900 text-white rounded-full pl-5 pr-2 py-2 shadow-lg text-sm">
            <span className="font-semibold">{picked.size} selected</span>
            <button type="button" onClick={() => setPicked(new Set())} className="text-slate-300 hover:text-white">Clear</button>
            <button type="button" onClick={() => setSending(true)} className="inline-flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-full px-4 py-1.5"><Send size={14} /> Send</button>
          </div>
        </div>
      )}

      {tab === 'watched' && <Watched people={people} />}
      {tab === 'sent' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {sends.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Nothing sent yet. Tick videos on the Videos tab, then Send.</p>}
          {sends.map((s, i) => (
            <div key={i} className="p-4 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-800">{s.sent} {s.sent === 1 ? 'person' : 'people'}</span><span className="text-xs text-slate-400">{new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{s.by ? ` · ${s.by}` : ''}</span></div>
              <p className="text-slate-600 mt-1">{bundleSummary(s.videoIds)}</p>
              {s.roles.length > 0 && <p className="text-xs text-slate-400 mt-0.5">To: {s.roles.map(r => TRAINING_ROLE_LABELS[r] || r).join(', ')}{s.people.length ? ` + ${s.people.length} picked by name` : ''}</p>}
            </div>
          ))}
        </div>
      )}

      {playing && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col" role="dialog" aria-label={playing.title} onClick={() => setPlaying(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white"><p className="text-sm font-semibold">{playing.num} · {playing.title}</p><button type="button" aria-label="Close" className="p-2"><X size={20} /></button></div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3" onClick={e => e.stopPropagation()}>
            <video src={playing.src} poster={playing.poster} controls autoPlay playsInline {...noSave} className="max-h-full max-w-full rounded-xl bg-black" />
          </div>
        </div>
      )}
      {scriptFor && <ScriptPanel v={scriptFor} note={notes[scriptFor.id]?.text || ''} onClose={() => setScriptFor(null)} onSaved={n => setNotes(n)} />}
      {sending && <SendDialog ids={Array.from(picked)} people={people || []} onClose={() => setSending(false)} onSent={() => { setSending(false); setPicked(new Set()); loadSends(); setTab('sent') }} />}
    </div>
  )
}

function ScriptPanel({ v, note, onClose, onSaved }: { v: Lib; note: string; onClose: () => void; onSaved: (n: any) => void }) {
  const s = VIDEO_SCRIPTS[v.id]
  const [text, setText] = useState(note)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const save = async () => {
    setBusy(true)
    const r = await fetch('/api/training/script-notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: v.id, text }) }).catch(() => null)
    const d = r?.ok ? await r.json() : null
    setBusy(false)
    if (d?.notes) { onSaved(d.notes); toast.success(text.trim() ? 'Saved. Ask Claude to re-record it.' : 'Cleared'); onClose() } else toast.error('That didn’t save')
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" role="dialog" aria-label={`Script: ${v.title}`} onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold text-slate-400">{v.num} · SCRIPT</p><h2 className="text-xl font-bold text-slate-900">{v.title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        {!s ? <p className="text-sm text-slate-400">No script on file for this video.</p> : (
          <ol className="space-y-2.5 text-sm text-slate-700">
            <li className="rounded-lg bg-slate-50 border border-slate-200 p-3"><span className="text-[11px] font-bold text-slate-400 block">OPENING</span>{s.intro}</li>
            {s.lines.map((l, i) => <li key={i} className="rounded-lg border border-slate-200 p-3"><span className="text-[11px] font-bold text-teal-700 block">STEP {i + 1}</span>{l}</li>)}
            {s.outro && <li className="rounded-lg bg-slate-50 border border-slate-200 p-3"><span className="text-[11px] font-bold text-slate-400 block">CLOSING</span>{s.outro}</li>}
          </ol>
        )}
        <div>
          <label htmlFor="script-note" className="text-sm font-semibold text-slate-800">Changes you want</label>
          <p className="text-xs text-slate-500 mb-1.5">Write the new wording, or what to change (e.g. “Step 3: say the ref tent is by Field 1”). Changing words is quick; a new screen means filming it again.</p>
          <textarea id="script-note" value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendDialog({ ids, people, onClose, onSent }: { ids: string[]; people: Person[]; onClose: () => void; onSent: () => void }) {
  // A bundle of only assigner videos starts addressed to Assigners.
  const [roles, setRoles] = useState<Set<string>>(() => new Set(ids.length && ids.every(id => trainingVideo(id)?.series === 'assigner') ? ['assigner'] : []))
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<{ count: number; names: string[]; noEmail: string[]; emailOn: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const body = (extra: object) => JSON.stringify({ videoIds: ids, roles: Array.from(roles), workerIds: Array.from(chosen), note, ...extra })
  useEffect(() => {
    if (!roles.size && !chosen.size) { setPreview(null); return }
    let live = true
    fetch('/api/training/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ preview: true }) }).then(r => r.ok ? r.json() : null).then(d => { if (live) setPreview(d) }).catch(() => {})
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, chosen])
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n) }
  const matches = q.trim() ? people.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []
  const send = async () => {
    setBusy(true)
    const r = await fetch('/api/training/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({}) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { toast.error(d.error || 'That didn’t send'); return }
    toast.success(`Sent to ${d.sent} ${d.sent === 1 ? 'person' : 'people'}`)
    if (d.failed?.length) toast.error(`Didn’t go through for: ${d.failed.join(', ')}`)
    onSent()
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Send videos">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">Send {ids.length} video{ids.length === 1 ? '' : 's'}</h2><p className="text-sm text-slate-500">{bundleSummary(ids)}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">To everyone who is a…</p>
          <div className="flex flex-wrap gap-2">
            {ROLE_KEYS.map(r => (
              <button key={r} type="button" onClick={() => flip(roles, setRoles, r)} aria-pressed={roles.has(r)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${roles.has(r) ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{TRAINING_ROLE_LABELS[r]}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">…and/or these people</p>
          <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name" className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm" /></div>
          {matches.length > 0 && <div className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100">{matches.map(p => (
            <button key={p.id} type="button" onClick={() => { flip(chosen, setChosen, p.id); setQ('') }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between"><span>{p.name}</span><span className="text-xs text-slate-400">{p.roles.map(r => TRAINING_ROLE_LABELS[r] || r).join(', ')}</span></button>
          ))}</div>}
          {chosen.size > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{Array.from(chosen).map(id => { const p = people.find(x => x.id === id); return <span key={id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2.5 pr-1 py-1">{p?.name}<button type="button" aria-label="Remove" onClick={() => flip(chosen, setChosen, id)}><X size={12} /></button></span> })}</div>}
        </div>
        <div>
          <label htmlFor="send-note" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Note (optional)</label>
          <textarea id="send-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={800} placeholder="Please watch these before Monster Mash on Oct 24." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700" aria-live="polite">
          {!preview ? <span className="text-slate-400">Pick a role or a person.</span> : <>
            <p><b>{preview.count}</b> {preview.count === 1 ? 'person' : 'people'} will get an email with a link to watch inside their login.</p>
            {preview.names.length > 0 && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{preview.names.join(', ')}</p>}
            {preview.noEmail.length > 0 && <p className="text-xs text-amber-700 mt-1">No email on file: {preview.noEmail.join(', ')}</p>}
          </>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button type="button" onClick={send} disabled={busy || !preview?.count} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"><Mail size={14} />{busy ? 'Sending…' : `Send to ${preview?.count ?? 0}`}</button>
        </div>
      </div>
    </div>
  )
}

function Watched({ people }: { people: Person[] | null }) {
  const [role, setRole] = useState('')
  const [video, setVideo] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  if (!people) return <p className="text-sm text-slate-400 p-6 text-center">Loading…</p>
  const list = people.filter(p => (!role || p.roles.includes(role)) && (!video || p.assigned.includes(video)) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name" className="rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm w-48" /></div>
        <select value={role} onChange={e => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"><option value="">All roles</option>{ROLE_KEYS.map(r => <option key={r} value={r}>{TRAINING_ROLE_LABELS[r]}</option>)}</select>
        <select value={video} onChange={e => setVideo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white max-w-xs"><option value="">Every video</option>{TRAINING_VIDEOS.map(v => <option key={v.id} value={v.id}>{v.num} {v.title}</option>)}</select>
        <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Users size={13} /> {list.length} people</span>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">{video ? 'This video' : 'Their videos'}</th><th className="px-4 py-2.5 font-semibold">Last watched</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(p => {
              const ids = video ? [video] : p.assigned
              const done = ids.filter(id => p.watched[id]).length
              const last = Object.values(p.watched).map(w => w.last).sort().pop() || ''
              const isOpen = open === p.id
              return [
                <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : p.id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.roles.map(r => TRAINING_ROLE_LABELS[r] || r).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5">
                    {video ? (p.watched[video] ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={15} /> Watched · {p.watched[video].plays}×</span> : <span className="text-slate-400">Not yet</span>)
                      : <span className="inline-flex items-center gap-2"><span className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-teal-500" style={{ width: `${ids.length ? Math.round(done / ids.length * 100) : 0}%` }} /></span><b className={done === ids.length && ids.length ? 'text-emerald-700' : 'text-slate-700'}>{done}/{ids.length}</b></span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(last) || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                </tr>,
                isOpen && (
                  <tr key={p.id + ':d'}><td colSpan={5} className="bg-slate-50 px-4 py-3">
                    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      {p.assigned.map(id => { const w = p.watched[id]; const v = trainingVideo(id); return (
                        <li key={id} className="flex items-center gap-2">
                          {w ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> : <span className="w-[15px] h-[15px] rounded-full border-2 border-slate-300 shrink-0" />}
                          <span className="flex-1 truncate text-slate-700">{v?.num} {v?.title}</span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{w ? `${w.plays}× · ${fmtDate(w.last)}` : 'Not yet'}</span>
                        </li>) })}
                    </ul>
                  </td></tr>
                ),
              ]
            })}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">A video counts as watched when it plays to 85%. Each time after that adds to the count.</p>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={on}
    className={`px-3 py-1 rounded-full text-sm font-semibold border ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-teal-400'}`}>{children}</button>
}

function AllBox({ checked, mixed, onChange, label }: { checked: boolean; mixed: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="accent-teal-600" />
}
