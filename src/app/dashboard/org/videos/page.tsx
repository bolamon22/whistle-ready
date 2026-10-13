'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

type Lib = { id: string; num: string; title: string; blurb: string; secs: number; series: 'staff' | 'ref' | 'assigner' | 'family'; audience: string; src: string; poster: string }
type Person = { id: string; name: string; email: string; roles: string[]; assigned: string[]; events?: string[]; watched: Record<string, { plays: number; first: string; last: string }> }
type Ev = { id: string; name: string; startDate: string }
type SendLog = { event?: string; at: string; by: string; videoIds: string[]; roles: string[]; people: string[]; emails?: string[]; meCopy?: boolean; sent: number; to?: { name: string; email: string }[]; failed?: string[] }

const LIB: Lib[] = [
  ...TRAINING_VIDEOS.map(v => ({ ...v, series: (v.series || 'staff') as 'staff' | 'ref' | 'assigner', audience: audienceFor(v.id), src: videoSrc(v.id), poster: posterSrc(v.id) })),
  ...HOW_TO_VIDEOS.map((v, i) => ({ id: v.id, num: `F0${i + 1}`, title: v.title, blurb: v.blurb, secs: v.secs, series: 'family' as const, audience: v.audience, src: howToSrc(v.id), poster: howToPoster(v.id) })),
]
const SERIES: { key: Lib['series']; label: string; note: string }[] = [
  { key: 'staff', label: 'Staff training', note: 'Phone videos for scorekeepers, refs, field ops and trainers. Inside their login on the Training page, and linked from the screens they teach.' },
  { key: 'ref', label: 'Ref training', note: 'Phone videos for referees: their games and crew, finding their name on the schedule, and game day. Assigners watch these too.' },
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
  // The same page at /dashboard/assigner/videos is the assigner's view (Bo, Oct 13
  // 2026: assigners send the videos to their officials). Staff videos only; the API
  // keeps their people and sends to the staff groups they run (lib/payScope).
  const asg = (usePathname() || '').startsWith('/dashboard/assigner')
  const lib = asg ? LIB.filter(v => v.series === 'staff' || v.series === 'ref') : LIB
  const series = asg ? SERIES.filter(s => s.key === 'staff' || s.key === 'ref') : SERIES
  const forFilters = asg ? FOR_FILTERS.filter(([k]) => !['assigner', 'parent', 'club_director'].includes(k)) : FOR_FILTERS
  const [tab, setTab] = useState<'videos' | 'watched' | 'sent'>('videos')
  const [playing, setPlaying] = useState<Lib | null>(null)
  const [scriptFor, setScriptFor] = useState<Lib | null>(null)
  const [notes, setNotes] = useState<Record<string, { text: string; by: string; at: string }>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [preChosen, setPreChosen] = useState<string[]>([])
  const [people, setPeople] = useState<Person[] | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [sends, setSends] = useState<SendLog[]>([])
  const [fSeries, setFSeries] = useState<string>('all')
  const [fFor, setFFor] = useState<string>('all')
  const [fQ, setFQ] = useState('')
  const shown = useMemo(() => lib.filter(v => (fSeries === 'all' || v.series === fSeries) && (fFor === 'all' || rolesOf(v).includes(fFor))
    && (!fQ.trim() || `${v.num} ${v.title} ${v.blurb}`.toLowerCase().includes(fQ.trim().toLowerCase()))), [fSeries, fFor, fQ])
  const filtered = fSeries !== 'all' || fFor !== 'all' || !!fQ.trim()

  const loadPeople = () => fetch('/api/training?report=1').then(r => r.ok ? r.json() : null).then(d => { setPeople(Array.isArray(d?.people) ? d.people : []); setEvents(Array.isArray(d?.events) ? d.events : []) }).catch(() => setPeople([]))
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
      <Link href={asg ? '/dashboard/assigner' : '/'} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Home</Link>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{asg ? 'Training videos' : 'Video library'}</h1>
          <p className="text-sm text-slate-500 mt-1">{asg ? `${lib.length} videos for your officials. Send them out, and see who has watched.` : `${lib.length} videos. Play them, read the scripts, send them to your staff, and see who has watched.`}</p>
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
            {series.length > 1 && <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">Type</span>}
            {series.length > 1 && [['all', 'All'] as [string, string], ...series.map(s => [s.key, s.label] as [string, string])].map(([k, label]) => {
              const n = k === 'all' ? lib.length : lib.filter(v => v.series === k).length
              return <Chip key={k} on={fSeries === k} onClick={() => setFSeries(k)}>{label} <span className="opacity-60">{n}</span></Chip>
            })}
            <div className="relative ml-auto w-full sm:w-56"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Search videos" aria-label="Search videos" className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">For</span>
            <Chip on={fFor === 'all'} onClick={() => setFFor('all')}>Everyone</Chip>
            {forFilters.map(([k, label]) => <Chip key={k} on={fFor === k} onClick={() => setFFor(k)}>{label}</Chip>)}
            {filtered && <button type="button" onClick={() => { setFSeries('all'); setFFor('all'); setFQ('') }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 ml-1">Clear filters</button>}
          </div>
        </div>
      )}
      {tab === 'videos' && filtered && shown.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No videos match those filters.</p>}

      {tab === 'videos' && series.filter(s => shown.some(v => v.series === s.key)).map(s => {
        const list = shown.filter(v => v.series === s.key); const ids = list.map(v => v.id); const bundle = s.key !== 'family'
        const nOn = ids.filter(id => picked.has(id)).length
        return (
        <section key={s.key} className="mb-8">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{s.label} <span className="text-sm font-semibold text-slate-400">{list.length}{filtered ? ` of ${lib.filter(v => v.series === s.key).length}` : ''}</span></h2>
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

      {tab === 'watched' && <Watched people={people} events={events} onNudge={(w, v) => { setPicked(new Set(v)); setPreChosen(w); setSending(true) }} />}
      {tab === 'sent' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {sends.length === 0 && <p className="p-6 text-sm text-slate-400 text-center">Nothing sent yet. Tick videos on the Videos tab, then Send.</p>}
          {sends.map((s, i) => (
            <div key={i} className="p-4 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-800">{s.sent} {s.sent === 1 ? 'person' : 'people'}</span><span className="text-xs text-slate-400">{new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{s.by ? ` · ${s.by}` : ''}</span></div>
              <p className="text-slate-600 mt-1">{bundleSummary(s.videoIds)}</p>
              {(() => { const to = [...s.roles.map(r => TRAINING_ROLE_LABELS[r] || r), ...(s.people.length ? [`${s.people.length} picked by name`] : []), ...(s.emails || []), ...(s.meCopy ? ['you'] : [])]; return to.length ? <p className="text-xs text-slate-400 mt-0.5">To: {to.join(', ')}</p> : null })()}
              {s.event && <p className="text-xs text-slate-500 mt-0.5">Event: {s.event}</p>}
              {s.to && s.to.length > 0 && <p className="text-xs text-slate-600 mt-1">Sent to: {s.to.map(t => t.name && t.name !== t.email ? `${t.name} (${t.email})` : t.email).join(', ')}</p>}
              {s.failed && s.failed.length > 0 && <p className="text-xs text-red-600 mt-0.5">Didn’t go through: {s.failed.join(', ')}</p>}
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
      {scriptFor && <ScriptPanel readOnly={asg} v={scriptFor} note={notes[scriptFor.id]?.text || ''} onClose={() => setScriptFor(null)} onSaved={n => setNotes(n)} />}
      {sending && <SendDialog events={events} initialChosen={preChosen} roleKeys={asg ? ROLE_KEYS.filter(r => r !== 'assigner' && (people || []).some(p => p.roles.includes(r))) : ROLE_KEYS} ids={Array.from(picked)} people={people || []} onClose={() => { setSending(false); setPreChosen([]) }} onSent={() => { setSending(false); setPreChosen([]); setPicked(new Set()); loadSends(); setTab('sent') }} />}
    </div>
  )
}

function ScriptPanel({ v, note, onClose, onSaved, readOnly }: { v: Lib; note: string; onClose: () => void; onSaved: (n: any) => void; readOnly?: boolean }) {
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
        {!readOnly && <div>
          <label htmlFor="script-note" className="text-sm font-semibold text-slate-800">Changes you want</label>
          <p className="text-xs text-slate-500 mb-1.5">Write the new wording, or what to change (e.g. “Step 3: say the ref tent is by Field 1”). Changing words is quick; a new screen means filming it again.</p>
          <textarea id="script-note" value={text} onChange={e => setText(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>}
      </div>
    </div>
  )
}

function SendDialog({ ids, people, events, roleKeys, initialChosen, onClose, onSent }: { ids: string[]; people: Person[]; events: Ev[]; roleKeys: string[]; initialChosen?: string[]; onClose: () => void; onSent: () => void }) {
  // Nobody is picked to start: a send goes only to who you choose (Bo, Oct 13 2026 --
  // an Assigners pre-pick sent a "sample to myself" to the assigners too).
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [eventId, setEventId] = useState('')
  const onEv = eventId ? people.filter(p => p.events?.includes(eventId)) : people
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialChosen || []))
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [meCopy, setMeCopy] = useState(true)
  const [emailsText, setEmailsText] = useState('')
  const emails = emailsText.split(/[\s,;]+/).map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  const emailsKey = emails.join(',')
  const [preview, setPreview] = useState<{ count: number; names: string[]; noEmail: string[]; newPeople?: string[]; emailOn: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const body = (extra: object) => JSON.stringify({ videoIds: ids, roles: Array.from(roles), workerIds: Array.from(chosen), emails, meCopy, eventId, note, ...extra })
  useEffect(() => {
    if (!roles.size && !chosen.size && !meCopy && !emails.length && !eventId) { setPreview(null); return }
    let live = true
    fetch('/api/training/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ preview: true }) }).then(r => r.ok ? r.json() : null).then(d => { if (live) setPreview(d) }).catch(() => {})
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, chosen, meCopy, emailsKey, eventId])
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n) }
  const matches = q.trim() ? people.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []
  const send = async () => {
    const list = preview?.names || []
    if (!confirm(`Email ${ids.length === 1 ? 'this video' : `these ${ids.length} videos`} to ${list.length} ${list.length === 1 ? 'person' : 'people'}?\n\n${list.join('\n')}`)) return
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
        {events.length > 0 && (
          <div>
            <label htmlFor="send-event" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Working an event</label>
            <select id="send-event" value={eventId} onChange={e => setEventId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Any event (whole Staff Pool)</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {people.filter(p => p.events?.includes(ev.id)).length} on staff</option>)}
            </select>
            {eventId && <p className="text-[11px] text-slate-500 mt-1">Only people on this event&apos;s staff roster. Pick a role below to narrow it, or none for everyone working it ({onEv.length}).</p>}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{eventId ? 'Who is a…' : 'To everyone who is a…'}</p>
          <div className="flex flex-wrap gap-2">
            {roleKeys.map(r => (
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
          <label htmlFor="send-emails" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">…and/or email addresses</label>
          <input id="send-emails" value={emailsText} onChange={e => setEmailsText(e.target.value)} placeholder="name@example.com, another@example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <p className="text-[11px] text-slate-400 mt-1">Someone not on staff yet gets a link to create their login first, then the videos.</p>
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" checked={meCopy} onChange={e => setMeCopy(e.target.checked)} className="accent-teal-600" /> Send me a copy too</label>
        </div>
        <div>
          <label htmlFor="send-note" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Note (optional)</label>
          <textarea id="send-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={800} placeholder="Please watch these before Monster Mash on Oct 24." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700" aria-live="polite">
          {!preview ? <span className="text-slate-400">Pick a role, a person or an email address.</span> : <>
            <p><b>{preview.count}</b> {preview.count === 1 ? 'person' : 'people'} will get an email with a link to watch inside their login.</p>
            {preview.names.length > 0 && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{preview.names.join(', ')}</p>}
            {(preview.newPeople?.length || 0) > 0 && <p className="text-xs text-teal-700 mt-1">Not on staff yet (gets the create-your-login link): {preview.newPeople!.join(', ')}</p>}
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

// Who's watched (Bo, Oct 13 2026: "sort ... by most recent viewers", plus "a scoreboard
// of who's completed and who hasn't, who spent the most time learning"). Time is an
// estimate: each counted play x the video's length (a play counts at 85%).
type Sort = 'recent' | 'most' | 'least' | 'time' | 'name'
type Status = '' | 'done' | 'started' | 'none'
const minsOf = (secs: number) => Math.round(secs / 60)
function Watched({ people, events, onNudge }: { people: Person[] | null; events: Ev[]; onNudge: (workerIds: string[], videoIds: string[]) => void }) {
  const [role, setRole] = useState('')
  const [video, setVideo] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [ev, setEv] = useState('')
  const [status, setStatus] = useState<Status>('')
  const [open, setOpen] = useState<string | null>(null)
  if (!people) return <p className="text-sm text-slate-400 p-6 text-center">Loading…</p>
  const secsOf = (id: string) => trainingVideo(id)?.secs || 0
  const rows = people.filter(p => (!ev || p.events?.includes(ev)) && (!role || p.roles.includes(role)) && (!video || p.assigned.includes(video)) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())))
    .map(p => {
      const ids = video ? [video] : p.assigned
      const done = ids.filter(id => p.watched[id]).length
      const last = Object.values(p.watched).map(w => w.last).sort().pop() || ''
      const plays = Object.values(p.watched).reduce((n, w) => n + w.plays, 0)
      const secs = Object.entries(p.watched).reduce((n, [id, w]) => n + w.plays * secsOf(id), 0)
      const st: Status = ids.length && done === ids.length ? 'done' : done > 0 ? 'started' : 'none'
      return { p, ids, done, last, plays, secs, st, pct: ids.length ? done / ids.length : 0 }
    })
  const counts = { done: rows.filter(r => r.st === 'done').length, started: rows.filter(r => r.st === 'started').length, none: rows.filter(r => r.st === 'none').length }
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const thisWeek = rows.filter(r => r.last && r.last >= weekAgo).length
  const totalSecs = rows.reduce((n, r) => n + r.secs, 0)
  const top = rows.filter(r => r.secs > 0).sort((a, b) => b.secs - a.secs || b.done - a.done).slice(0, 5)
  // Per video: share of the people it's for who have watched it.
  const vids = TRAINING_VIDEOS.map(v => { const for_ = rows.filter(r => r.p.assigned.includes(v.id)); const got = for_.filter(r => r.p.watched[v.id]).length; return { v, of: for_.length, got, pct: for_.length ? got / for_.length : 0 } }).filter(x => x.of > 0)
  const best = vids.slice().sort((a, b) => b.pct - a.pct || b.got - a.got)[0]
  const worst = vids.slice().sort((a, b) => a.pct - b.pct || a.got - b.got)[0]
  const list = rows.filter(r => !status || r.st === status).sort((a, b) =>
    sort === 'recent' ? (b.last || '').localeCompare(a.last || '') || a.p.name.localeCompare(b.p.name)
    : sort === 'most' ? b.pct - a.pct || b.secs - a.secs
    : sort === 'least' ? a.pct - b.pct || a.p.name.localeCompare(b.p.name)
    : sort === 'time' ? b.secs - a.secs || b.pct - a.pct
    : a.p.name.localeCompare(b.p.name))
  const nudge = (st: Status) => {
    const who = rows.filter(r => r.st === st)
    const vidIds = Array.from(new Set(who.flatMap(r => r.ids.filter(id => !r.p.watched[id]))))
    if (who.length && vidIds.length) onNudge(who.map(r => r.p.id), vidIds)
  }
  const Tile = ({ k, label, n, tone, hint }: { k: Status; label: string; n: number; tone: string; hint: string }) => (
    <button type="button" onClick={() => setStatus(status === k ? '' : k)} aria-pressed={status === k}
      className={`text-left rounded-xl border p-3.5 bg-white hover:border-teal-400 ${status === k ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
      <span className={`block text-2xl font-bold ${tone}`}>{n}</span>
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <span className="block text-xs text-slate-400">{rows.length ? Math.round(n / rows.length * 100) : 0}% · {hint}</span>
    </button>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search size={14} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name" className="rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm w-48" /></div>
        <select value={role} onChange={e => setRole(e.target.value)} aria-label="Role" className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"><option value="">All roles</option>{ROLE_KEYS.map(r => <option key={r} value={r}>{TRAINING_ROLE_LABELS[r]}</option>)}</select>
        <select value={video} onChange={e => setVideo(e.target.value)} aria-label="Video" className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white max-w-xs"><option value="">Every video</option>{TRAINING_VIDEOS.map(v => <option key={v.id} value={v.id}>{v.num} {v.title}</option>)}</select>
        {events.length > 0 && <select value={ev} onChange={e => setEv(e.target.value)} aria-label="Event" className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white max-w-[14rem]"><option value="">Any event</option>{events.map(x => <option key={x.id} value={x.id}>Working {x.name}</option>)}</select>}
        <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="recent">Most recent viewers</option><option value="most">Most complete</option><option value="least">Least complete</option><option value="time">Most time watching</option><option value="name">Name A–Z</option>
        </select>
        <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Users size={13} /> {rows.length} people</span>
      </div>

      {/* Scoreboard -- follows the role and video filters above */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile k="done" label="Finished" n={counts.done} tone="text-emerald-700" hint={video ? 'watched it' : 'all their videos'} />
        <Tile k="started" label="In progress" n={counts.started} tone="text-amber-600" hint="started, not done" />
        <Tile k="none" label="Not started" n={counts.none} tone="text-slate-800" hint="nothing watched yet" />
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <span className="block text-2xl font-bold text-teal-700">{minsOf(totalSecs)} min</span>
          <span className="block text-sm font-semibold text-slate-700">Time watching</span>
          <span className="block text-xs text-slate-400">{thisWeek} watched in the last 7 days</span>
        </div>
      </div>
      {(counts.none > 0 || counts.started > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {counts.none > 0 && <button type="button" onClick={() => nudge('none')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:border-teal-400"><Mail size={14} /> Remind the {counts.none} who haven&apos;t started</button>}
          {counts.started > 0 && <button type="button" onClick={() => nudge('started')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:border-teal-400"><Mail size={14} /> Remind the {counts.started} in progress</button>}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Top learners</p>
          {top.length === 0 ? <p className="text-sm text-slate-400">Nobody has watched yet.</p> : (
            <ol className="space-y-1.5">{top.map((r, i) => (
              <li key={r.p.id} className="flex items-center gap-2 text-sm">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                <span className="flex-1 font-medium text-slate-800 truncate">{r.p.name}</span>
                <span className="text-xs text-slate-500">{r.done}/{r.ids.length} · {r.plays} plays · {minsOf(r.secs) || '<1'} min</span>
              </li>))}</ol>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Videos</p>
          {best && <p className="text-slate-700"><span className="text-xs text-slate-400 block">Most watched</span>{best.v.num} {best.v.title} <span className="text-slate-500">· {best.got} of {best.of} ({Math.round(best.pct * 100)}%)</span></p>}
          {worst && worst !== best && <p className="text-slate-700 mt-2"><span className="text-xs text-slate-400 block">Least watched</span>{worst.v.num} {worst.v.title} <span className="text-slate-500">· {worst.got} of {worst.of} ({Math.round(worst.pct * 100)}%)</span></p>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">{video ? 'This video' : 'Their videos'}</th><th className="px-4 py-2.5 font-semibold">Time</th><th className="px-4 py-2.5 font-semibold">Last watched</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(({ p, ids, done, last, secs }) => {
              const isOpen = open === p.id
              return [
                <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : p.id)}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.roles.map(r => TRAINING_ROLE_LABELS[r] || r).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5">
                    {video ? (p.watched[video] ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 size={15} /> Watched · {p.watched[video].plays}×</span> : <span className="text-slate-400">Not yet</span>)
                      : <span className="inline-flex items-center gap-2"><span className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-teal-500" style={{ width: `${ids.length ? Math.round(done / ids.length * 100) : 0}%` }} /></span><b className={done === ids.length && ids.length ? 'text-emerald-700' : 'text-slate-700'}>{done}/{ids.length}</b></span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{secs ? `${minsOf(secs) || '<1'} min` : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(last) || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                </tr>,
                isOpen && (
                  <tr key={p.id + ':d'}><td colSpan={6} className="bg-slate-50 px-4 py-3">
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
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">A video counts as watched when it plays to 85%. Each time after that adds a play. Time is an estimate: plays × each video&apos;s length.</p>
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
