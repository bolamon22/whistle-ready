'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowRight, ChevronLeft, History, Printer, Save } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils'
import { ROLE_SHORT, touchesOfficials, type Change, type CpGame, type DiffRow } from '@/lib/checkpointDiff'

// Checkpoints (lib/assignCheckpoint; Bo, Oct 21 2026: if the schedule changes on the
// assigners, "they know what the old ref assignments were"). Whistle Ready saves one by
// itself just before a schedule change, and anyone who can open the Assigner can save
// one. Pick one to see each game that changed since, with its officials then and now.

type Meta = { id: string; at: string; by: string; reason: string; games: number }
type Detail = { checkpoint: Meta & { data: CpGame[] }; current: CpGame[]; diff: DiffRow[] }
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const time = (t: string) => (/^\d{1,2}:\d{2}/.test(t || '') ? formatTime(t) : 'no time')
const slot = (g: CpGame) => `${g.date ? formatDate(g.date) : 'No day'} · ${time(g.startTime)} · ${g.location || 'no field'}`
const crew = (g: CpGame) => g.officials.length ? g.officials.map(o => `${ROLE_SHORT[o.role] || o.role} ${o.name}`).join(', ') : 'nobody'
const LABEL: Record<Change, string> = { moved: 'Moved', teams: 'New teams', canceled: 'Canceled', removed: 'Removed', officials: 'Different officials' }
const TONE: Record<Change, string> = { moved: 'bg-amber-50 text-amber-800', teams: 'bg-amber-50 text-amber-800', canceled: 'bg-red-50 text-red-700', removed: 'bg-red-50 text-red-700', officials: 'bg-slate-100 text-slate-700' }

export default function Checkpoints({ params }: { params: { id: string } }) {
  const [list, setList] = useState<Meta[] | null>(null)
  const [pick, setPick] = useState('')
  const [d, setD] = useState<Detail | null>(null)
  const [onlyOfficials, setOnlyOfficials] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/tournaments/${params.id}/checkpoints`)
    const j = await r.json().catch(() => null)
    if (!r.ok || !j) { setErr(j?.error || 'That didn’t load. Please try again.'); return }
    setList(j.checkpoints)
    const want = new URLSearchParams(window.location.search).get('cp')
    setPick(p => p && j.checkpoints.some((c: Meta) => c.id === p) ? p : want && j.checkpoints.some((c: Meta) => c.id === want) ? want : j.checkpoints[0]?.id || '')
  }, [params.id])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    if (!pick) { setD(null); return }
    setD(null); setErr('')
    // ?cp=, never ?id= (route/checkpoints explains). Only a real answer is shown, so a bad
    // one says so instead of crashing the page.
    fetch(`/api/tournaments/${params.id}/checkpoints?cp=${encodeURIComponent(pick)}`).then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.checkpoint && Array.isArray(j.diff)) setD(j); else setErr('That checkpoint didn’t load. Please try again.') })
      .catch(() => setErr('That checkpoint didn’t load. Please try again.'))
  }, [params.id, pick])

  async function saveNow() {
    setBusy(true)
    try {
      const r = await fetch(`/api/tournaments/${params.id}/checkpoints`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j) { toast.error(j?.error || 'That didn’t save. Please try again.'); return }
      toast.success('Checkpoint saved'); setPick(j.id); await loadList()
    } finally { setBusy(false) }
  }

  const rows = (d?.diff || []).filter(r => !onlyOfficials || touchesOfficials(r) || r.changes.includes('officials'))
  const counts = (d?.diff || []).reduce((m, r) => { for (const c of r.changes) m[c] = (m[c] || 0) + 1; return m }, {} as Record<string, number>)
  const affected = (d?.diff || []).filter(touchesOfficials).length

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-4 pt-6">
        <Link href={`/tournaments/${params.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ChevronLeft size={14} aria-hidden /> Assigner</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Checkpoints</h1>
            <p className="text-sm text-slate-500">Whistle Ready saves who was on each game just before the schedule changes. Pick one to see what changed since and who had those games.</p>
          </div>
          <button type="button" onClick={saveNow} disabled={busy} className="btn-secondary inline-flex min-h-[44px] items-center gap-1.5 sm:min-h-0"><Save size={15} aria-hidden />{busy ? 'Saving…' : 'Save a checkpoint now'}</button>
        </div>
      </div>
      {err && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</p>}
      {!list && !err && <p className="p-10 text-center text-sm text-slate-400">Loading…</p>}
      {list && list.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No checkpoints yet. One is saved by itself the first time the schedule changes after officials are assigned, or click <b className="font-semibold">Save a checkpoint now</b>.</p>}

      {list && list.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="cp-pick">Checkpoint</label>
            <select id="cp-pick" value={pick} onChange={e => setPick(e.target.value)} className="min-h-[44px] max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:min-h-0 sm:py-2">
              {list.map(c => <option key={c.id} value={c.id}>{when(c.at)} · {c.reason === 'manual' ? `saved${c.by ? ` by ${c.by}` : ''}` : 'before a schedule change'}</option>)}
            </select>
            {pick && <Link href={`/tournaments/${params.id}/print-schedule?checkpoint=${encodeURIComponent(pick)}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 sm:py-2"><Printer size={15} aria-hidden />Print it</Link>}
          </div>
          {!d && !err && <p className="p-6 text-center text-sm text-slate-400">Loading…</p>}
          {d && (
            <>
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <p className="flex items-start gap-1.5"><History size={15} className="mt-0.5 flex-shrink-0 text-teal-600" aria-hidden />
                  <span>{d.diff.length === 0 ? 'Nothing has changed since this checkpoint.' : <>Since {when(d.checkpoint.at)}: <b>{affected}</b> game{affected === 1 ? '' : 's'} with officials moved, changed teams, were canceled or removed.</>}</span>
                </p>
                {d.diff.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Object.keys(LABEL) as Change[]).filter(c => counts[c]).map(c => <span key={c} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[c]}`}>{LABEL[c]}: {counts[c]}</span>)}
                  </div>
                )}
              </div>
              {d.diff.length > 0 && (
                <label className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-700 sm:min-h-0">
                  <input type="checkbox" checked={onlyOfficials} onChange={e => setOnlyOfficials(e.target.checked)} /> Only games that had officials
                </label>
              )}
              <div className="space-y-2">
                {rows.map(r => (
                  <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-900">#{r.before.gameNumber} · {r.before.division}</span>
                      {r.changes.map(c => <span key={c} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[c]}`}>{LABEL[c]}</span>)}
                    </div>
                    <p className="text-slate-600">{r.before.team1} vs {r.before.team2}{r.after && r.changes.includes('teams') ? <> <ArrowRight size={12} className="inline" aria-hidden /> {r.after.team1} vs {r.after.team2}</> : null}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Then</p>
                        <p className="text-slate-800">{slot(r.before)}</p>
                        <p className="text-slate-700">{crew(r.before)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Now</p>
                        {r.after ? <><p className="text-slate-800">{r.after.isCanceled ? 'Canceled · ' : ''}{slot(r.after)}</p><p className="text-slate-700">{crew(r.after)}</p></> : <p className="text-red-700">This game isn&apos;t on the schedule any more.</p>}
                      </div>
                    </div>
                  </div>
                ))}
                {d.diff.length > 0 && rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">None of the changed games had officials.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
