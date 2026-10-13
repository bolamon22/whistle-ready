'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import EventBackLink from '@/components/EventBackLink'
import { TriangleAlert, ChevronLeft, Trash2, Check, Download, Lock, Plus } from 'lucide-react'
import TrainingLink from '@/components/TrainingLink'

const TYPES = ['Medical', 'Safety', 'Facility', 'Weather', 'Other']
const SEVERITIES = ['Low', 'Medium', 'High']
const sevClass = (s: string) => s === 'High' ? 'bg-red-100 text-red-700' : s === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'

// Injury report (Bo, Oct 13 2026): a Medical incident records who was hurt, the
// injury, a suspected concussion, what was done, the outcome and whether a parent
// was told, with dated follow-ups. Details show only to directors, admins, athletic
// trainers and the person who logged it (api/tournaments/[id]/incidents).
const WHO = [['player', 'Player'], ['coach', 'Coach'], ['staff', 'Staff'], ['spectator', 'Spectator']] as const
const BODY = ['Head / face', 'Neck', 'Shoulder', 'Arm / elbow', 'Wrist / hand', 'Chest / ribs', 'Back', 'Hip / groin', 'Thigh', 'Knee', 'Lower leg', 'Ankle / foot', 'Heat illness', 'Other']
const OUTCOMES = ['Returned to play', 'Out for the rest of the game', 'Out for the day', 'Sent to a doctor or urgent care', 'Taken to the ER', '911 called']
const PARENT = [['yes', 'Yes'], ['no', 'Not yet'], ['not_needed', 'Not needed (adult)']] as const
type Injury = { who: string; name: string; team: string; number: string; division: string; gameNumber: string; bodyPart: string; concussion: boolean; treatment: string; outcome: string; parentNotified: string; parentName: string; parentPhone: string; time: string }
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const blank = (): Injury => ({ who: 'player', name: '', team: '', number: '', division: '', gameNumber: '', bodyPart: '', concussion: false, treatment: '', outcome: '', parentNotified: '', parentName: '', parentPhone: '', time: nowHHMM() })
const lbl = (list: readonly (readonly [string, string])[], v?: string) => list.find(x => x[0] === v)?.[1] || v || ''
const time12 = (t?: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}` }
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500'

export default function IncidentsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams()
  const { status } = useSession()
  const [incidents, setIncidents] = useState<any[]>([])
  const [medicalAccess, setMedicalAccess] = useState(false)
  const [type, setType] = useState('Medical')
  const [field, setField] = useState('')
  const [severity, setSeverity] = useState('Medium')
  const [description, setDescription] = useState('')
  const [inj, setInj] = useState<Injury>(blank)
  const [saving, setSaving] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [teams, setTeams] = useState<{ team: string; division: string }[]>([])

  function load() {
    fetch(`/api/tournaments/${id}/incidents`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.incidents)) { setIncidents(d.incidents); setMedicalAccess(!!d.medical) } }).catch(() => {})
  }
  useEffect(() => { if (id) load() }, [id])
  // Team names for the injury form, from the event's games.
  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}/games`).then(r => r.ok ? r.json() : []).then((g: any[]) => {
      const m = new Map<string, { team: string; division: string }>()
      for (const x of Array.isArray(g) ? g : []) for (const t of [x.team1, x.team2]) if (t && !/^(winner|loser|tbd|seed)/i.test(t)) m.set(`${x.division}|${t}`, { team: t, division: x.division || '' })
      setTeams(Array.from(m.values()).sort((a, b) => a.team.localeCompare(b.team)))
    }).catch(() => {})
  }, [id])

  const medical = type === 'Medical'
  const set = (patch: Partial<Injury>) => setInj(v => ({ ...v, ...patch }))
  const needName = medical && inj.who === 'player' && !inj.name.trim()

  async function submit() {
    if (!description.trim() || needName) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, field, severity, description: description.trim(), ...(medical ? { injury: inj } : {}) }),
      })
      if (res.ok) { toast.success(medical ? 'Injury report saved' : 'Incident logged'); setDescription(''); setField(''); setInj(blank()); load() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }
  async function resolve(iid: string) {
    try { const r = await fetch(`/api/tournaments/${id}/incidents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: iid, status: 'resolved' }) }); if (r.ok) load() } catch {}
  }
  async function remove(iid: string) {
    if (!confirm('Delete this incident for good?')) return
    try { const r = await fetch(`/api/tournaments/${id}/incidents?id=${encodeURIComponent(iid)}`, { method: 'DELETE' }); if (r.ok) load() } catch {}
  }
  async function followUp(iid: string, text: string, outcome: string) {
    const r = await fetch(`/api/tournaments/${id}/incidents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: iid, followUp: text, outcome }) }).catch(() => null)
    if (r?.ok) { toast.success('Follow-up added'); load(); return true }
    toast.error('Couldn’t save that'); return false
  }

  // The injury log as a spreadsheet, for the director's records or an insurer.
  function downloadCsv() {
    const rows = incidents.filter(i => i.type === 'Medical' && !i.redacted)
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Logged', 'Time of injury', 'Field', 'Game #', 'Who', 'Name', 'Team', 'Division', '#', 'Injury', 'Suspected concussion', 'What happened', 'Treatment', 'Outcome', 'Parent told', 'Parent name', 'Parent phone', 'Severity', 'Logged by', 'Follow-ups', 'Status']
    const lines = rows.map(i => { const j = i.injury || {}; return [new Date(i.createdAt).toLocaleString(), time12(j.time), i.field, j.gameNumber, lbl(WHO, j.who), j.name, j.team, j.division, j.number, j.bodyPart, j.concussion ? 'Yes' : 'No', i.description, j.treatment, j.outcome, lbl(PARENT, j.parentNotified), j.parentName, j.parentPhone, i.severity, i.by, (i.followUps || []).map((f: any) => `${new Date(f.at).toLocaleString()} ${f.by}: ${f.outcome ? `[${f.outcome}] ` : ''}${f.text}`).join(' | '), i.status].map(q).join(',') })
    const blob = new Blob([[head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `injury-log-${id}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const teamDivs = useMemoTeams(teams, inj.team)
  if (status === 'loading') return <div className="p-10 text-center text-gray-400">Loading…</div>

  const open = incidents.filter(i => i.status !== 'resolved')
  const resolved = incidents.filter(i => i.status === 'resolved')
  const canSubmit = description.trim() && !saving && !needName

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster position="top-right" />
      {!embedded && <>
        <EventBackLink id={id} />
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><TriangleAlert size={22} className="text-teal-600" /> Incidents</h1>
        <p className="text-sm text-slate-500 mb-5">Log injuries and safety or facility issues so the team can track them. For emergencies, call 911 first.</p>
        <TrainingLink id={type === 'Medical' ? 'injury-report' : 'incidents'} className="-mt-3 mb-5" />
      </>}

      {/* report form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1" htmlFor="inc-type">Type</label>
            <select id="inc-type" value={type} onChange={e => setType(e.target.value)} className={inputCls}>
              {TYPES.map(t => <option key={t} value={t}>{t === 'Medical' ? 'Medical / injury' : t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1" htmlFor="inc-sev">Severity</label>
            <select id="inc-sev" value={severity} onChange={e => setSeverity(e.target.value)} className={inputCls}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {medical && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 mb-3 space-y-2.5">
            <p className="text-xs font-bold text-rose-800 uppercase tracking-wide">Injury report</p>
            <div>
              <p className="block text-[11px] text-slate-500 mb-1">Who was hurt</p>
              <div className="flex flex-wrap gap-1.5">
                {WHO.map(([k, l]) => <button key={k} type="button" onClick={() => set({ who: k })} aria-pressed={inj.who === k}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${inj.who === k ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{l}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-name">Name{inj.who === 'player' ? '' : ' (optional)'}</label><input id="inj-name" value={inj.name} onChange={e => set({ name: e.target.value })} placeholder={inj.who === 'player' ? 'Player’s name' : 'Name'} className={inputCls} /></div>
              <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-num">Jersey #</label><input id="inj-num" value={inj.number} onChange={e => set({ number: e.target.value })} inputMode="numeric" className={inputCls} /></div>
            </div>
            {(inj.who === 'player' || inj.who === 'coach') && (
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-team">Team</label>
                  <input id="inj-team" list="inj-teams" value={inj.team} onChange={e => { const t = e.target.value; const m = teams.filter(x => x.team === t); set({ team: t, division: m.length === 1 ? m[0].division : inj.division }) }} placeholder="Start typing a team" className={inputCls} />
                  <datalist id="inj-teams">{Array.from(new Set(teams.map(t => t.team))).map(t => <option key={t} value={t} />)}</datalist>
                  {teamDivs.length > 1 && <select value={inj.division} onChange={e => set({ division: e.target.value })} aria-label="Division" className={`${inputCls} mt-1.5`}><option value="">Which division?</option>{teamDivs.map(d => <option key={d} value={d}>{d}</option>)}</select>}
                </div>
                <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-game">Game #</label><input id="inj-game" value={inj.gameNumber} onChange={e => set({ gameNumber: e.target.value })} className={inputCls} /></div>
              </div>
            )}
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-body">Injury</label>
                <select id="inj-body" value={inj.bodyPart} onChange={e => set({ bodyPart: e.target.value })} className={inputCls}><option value="">Pick one</option>{BODY.map(b => <option key={b}>{b}</option>)}</select></div>
              <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-time">Time</label><input id="inj-time" type="time" value={inj.time} onChange={e => set({ time: e.target.value })} className={inputCls} /></div>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
              <input type="checkbox" checked={inj.concussion} onChange={e => set({ concussion: e.target.checked })} className="mt-0.5 accent-rose-600" />
              <span><b>Suspected concussion</b>{inj.concussion && <span className="block text-xs text-rose-700 mt-0.5">Remove them from play. No return today without written clearance from a doctor.</span>}</span>
            </label>
          </div>
        )}

        <label className="block text-[11px] text-slate-500 mb-1" htmlFor="inc-field">Field / location{medical ? '' : ' (optional)'}</label>
        <input id="inc-field" value={field} onChange={e => setField(e.target.value)} placeholder="e.g. Field 5" className={`${inputCls} mb-2`} />
        <label className="block text-[11px] text-slate-500 mb-1" htmlFor="inc-desc">What happened</label>
        <textarea id="inc-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder={medical ? 'How it happened and what you saw' : 'Describe the incident…'} className={`${inputCls} rounded-xl mb-2`} />

        {medical && (
          <div className="space-y-2 mb-3">
            <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-treat">Treatment given</label>
              <textarea id="inj-treat" value={inj.treatment} onChange={e => set({ treatment: e.target.value })} rows={2} placeholder="e.g. Ice, taped ankle, cleaned and bandaged" className={`${inputCls} rounded-xl`} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1" htmlFor="inj-out">Outcome</label>
              <select id="inj-out" value={inj.outcome} onChange={e => set({ outcome: e.target.value })} className={inputCls}><option value="">Pick one</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></div>
            <div>
              <p className="block text-[11px] text-slate-500 mb-1">Parent or guardian told?</p>
              <div className="flex flex-wrap gap-1.5">
                {PARENT.map(([k, l]) => <button key={k} type="button" onClick={() => set({ parentNotified: k })} aria-pressed={inj.parentNotified === k}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${inj.parentNotified === k ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>{l}</button>)}
              </div>
              {inj.parentNotified === 'yes' && <div className="grid grid-cols-2 gap-2 mt-2">
                <input value={inj.parentName} onChange={e => set({ parentName: e.target.value })} placeholder="Parent’s name" aria-label="Parent's name" className={inputCls} />
                <input value={inj.parentPhone} onChange={e => set({ parentPhone: e.target.value })} placeholder="Phone" aria-label="Parent's phone" inputMode="tel" className={inputCls} />
              </div>}
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Lock size={11} /> Injury details are seen only by athletic trainers and tournament directors.</p>
          </div>
        )}

        <button type="button" onClick={submit} disabled={!canSubmit}
          className={`w-full py-2.5 rounded-xl font-bold ${canSubmit ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>{saving ? 'Saving…' : medical ? 'Save injury report' : 'Log incident'}</button>
        {needName && description.trim() && <p className="text-xs text-amber-700 mt-1.5">Add the player&apos;s name to save.</p>}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Open <span className="text-slate-300">· {open.length}</span></h2>
        {medicalAccess && incidents.some(i => i.type === 'Medical') && <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"><Download size={13} /> Injury log (spreadsheet)</button>}
      </div>
      {open.length === 0 && <p className="text-sm text-slate-400 mb-4">No open incidents. 🎉</p>}
      <div className="space-y-2 mb-6">
        {open.map(i => <IncidentCard key={i.id} i={i} onResolve={() => resolve(i.id)} onRemove={() => remove(i.id)} onFollowUp={(t, o) => followUp(i.id, t, o)} />)}
      </div>

      {resolved.length > 0 && (
        <>
          <button type="button" onClick={() => setShowResolved(s => !s)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 mb-2">{showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})</button>
          {showResolved && <div className="space-y-2">{resolved.map(i => <IncidentCard key={i.id} i={i} done onFollowUp={(t, o) => followUp(i.id, t, o)} />)}</div>}
        </>
      )}
    </div>
  )
}

// Divisions for the typed team (a club can field the same name in two divisions).
function useMemoTeams(teams: { team: string; division: string }[], team: string) {
  return useMemo(() => Array.from(new Set(teams.filter(t => t.team === team).map(t => t.division).filter(Boolean))), [teams, team])
}

function IncidentCard({ i, done, onResolve, onRemove, onFollowUp }: { i: any; done?: boolean; onResolve?: () => void; onRemove?: () => void; onFollowUp: (text: string, outcome: string) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const j = i.injury
  const who = j ? (WHO.find(w => w[0] === j.who)?.[1] || 'Player') : ''
  return (
    <div className={`border rounded-xl p-3 ${done ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {done ? <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Resolved</span>
          : <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${sevClass(i.severity)}`}>{i.severity}</span>}
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${j ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}>{j ? 'Injury' : i.type}</span>
        {j?.concussion && <span className="text-[10px] font-bold uppercase tracking-wide bg-rose-600 text-white px-2 py-0.5 rounded-full">Suspected concussion</span>}
        {i.field && <span className="text-[11px] text-slate-500">{i.field}</span>}
        <span className="text-[11px] text-slate-400 ml-auto">{i.by} · {new Date(i.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      {j && (
        <div className="text-sm text-slate-800 mb-1">
          <p className="font-semibold">{j.name || who}{j.number ? ` #${j.number}` : ''}{j.team ? ` · ${j.team}` : ''}{j.division ? ` (${j.division})` : ''}{j.who !== 'player' ? ` · ${who}` : ''}</p>
          <p className="text-xs text-slate-500">{[j.bodyPart, j.time && `at ${time12(j.time)}`, j.gameNumber && `game #${j.gameNumber}`].filter(Boolean).join(' · ')}</p>
        </div>
      )}
      <p className={`text-sm ${i.redacted ? 'text-slate-500 italic flex items-center gap-1' : 'text-slate-800'}`}>{i.redacted && <Lock size={12} />}{i.description}</p>
      {j && (j.treatment || j.outcome || j.parentNotified) && (
        <dl className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
          {j.treatment && <><dt className="text-slate-400">Treatment</dt><dd className="text-slate-700">{j.treatment}</dd></>}
          {j.outcome && <><dt className="text-slate-400">Outcome</dt><dd className="text-slate-800 font-semibold">{j.outcome}</dd></>}
          {j.parentNotified && <><dt className="text-slate-400">Parent told</dt><dd className="text-slate-700">{j.parentNotified === 'yes' ? `Yes${j.parentName ? `, ${j.parentName}` : ''}${j.parentPhone ? ` (${j.parentPhone})` : ''}` : j.parentNotified === 'no' ? 'Not yet' : 'Not needed'}</dd></>}
        </dl>
      )}
      {(i.followUps || []).length > 0 && (
        <ul className="mt-2 border-t border-slate-100 pt-2 space-y-1">
          {i.followUps.map((f: any, k: number) => <li key={k} className="text-xs text-slate-600"><span className="text-slate-400">{new Date(f.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {f.by}:</span> {f.outcome && <b className="text-slate-800">{f.outcome}. </b>}{f.text}</li>)}
        </ul>
      )}
      {adding && (
        <div className="mt-2 space-y-1.5">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="e.g. Mom picked him up; urgent care says wrist sprain" aria-label="Follow-up" className={`${inputCls} rounded-xl`} />
          <select value={outcome} onChange={e => setOutcome(e.target.value)} aria-label="New outcome" className={inputCls}><option value="">Outcome unchanged</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500 px-2">Cancel</button>
            <button type="button" disabled={!text.trim() && !outcome} onClick={async () => { if (await onFollowUp(text.trim(), outcome)) { setAdding(false); setText(''); setOutcome('') } }} className="text-xs font-semibold bg-teal-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">Save follow-up</button>
          </div>
        </div>
      )}
      <div className="flex gap-2 mt-2">
        {onResolve && <button type="button" onClick={onResolve} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg"><Check size={13} /> Resolve</button>}
        {j && !i.redacted && !adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg"><Plus size={13} /> Follow-up</button>}
        {onRemove && <button type="button" onClick={onRemove} className="text-slate-300 hover:text-red-500 ml-auto" title="Delete"><Trash2 size={14} /></button>}
      </div>
    </div>
  )
}
