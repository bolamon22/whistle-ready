'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, History, Printer } from 'lucide-react'
import { formatDate, formatTime } from '@/lib/utils'
import { eventDayList } from '@/lib/eventDays'
import { gameGender } from '@/lib/gameGender'
import { teamsSide } from '@/lib/eventTeams'
import { cpGame, ROLE_SHORT, type CpGame } from '@/lib/checkpointDiff'

// Print the schedule with its officials (Bo, Oct 21 2026: assigners want "a printable
// version pdf of the schedule"). Every day or one, all games or one side's, sorted by
// time or grouped by field, refs and scorekeepers. The browser's Print saves it as a PDF.
// ?checkpoint=<id> prints the officials as a checkpoint had them (lib/assignCheckpoint).
// Opened from the Assigner's ⋯ menu and from Checkpoints.

type T = { name: string; logoUrl?: string; startDate?: string; endDate?: string; dates?: string; teams?: unknown }
type Cp = { id: string; at: string; reason: string; data: CpGame[] }
const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 99999 }
const time = (t: string) => (/^\d{1,2}:\d{2}/.test(t || '') ? formatTime(t) : 'TBD')
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const byField = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export default function PrintSchedule({ params }: { params: { id: string } }) {
  const [t, setT] = useState<T | null>(null)
  const [games, setGames] = useState<CpGame[] | null>(null)
  const [cp, setCp] = useState<Cp | null>(null)
  const [err, setErr] = useState('')
  const [day, setDay] = useState('all')
  const [side, setSide] = useState<'all' | 'boys' | 'girls'>('all')
  const [layout, setLayout] = useState<'time' | 'field'>('time')
  const [show, setShow] = useState<'both' | 'refs' | 'sk'>('both')
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('checkpoint')
    Promise.all([
      fetch(`/api/tournaments/${params.id}`).then(r => (r.ok ? r.json() : null)),
      cid ? fetch(`/api/tournaments/${params.id}/checkpoints?cp=${encodeURIComponent(cid)}`).then(r => (r.ok ? r.json() : null)) : fetch(`/api/tournaments/${params.id}/games`).then(r => (r.ok ? r.json() : null)),
    ]).then(([tt, g]) => {
      if (!tt || !g || (cid && !Array.isArray(g.checkpoint?.data))) { setErr('That didn’t load. Please try again.'); return }
      setT(tt)
      if (cid) { setCp(g.checkpoint); setGames(g.checkpoint.data) } else setGames((Array.isArray(g) ? g : []).map(cpGame))
    }).catch(() => setErr('That didn’t load. Please try again.'))
  }, [params.id])

  const eventSide = teamsSide(t?.teams)
  const days = useMemo(() => eventDayList(t, (games || []).map(g => g.date)).filter(d => (games || []).some(g => g.date === d)), [t, games])
  const shown = useMemo(() => (games || [])
    .filter(g => !g.isCanceled && (day === 'all' || g.date === day))
    .filter(g => side === 'all' || gameGender(g.division, eventSide) === side || gameGender(g.division, eventSide) === 'both')
    .sort((a, b) => a.date.localeCompare(b.date) || mins(a.startTime) - mins(b.startTime) || byField(a.location, b.location)), [games, day, side, eventSide])
  const refCols = useMemo(() => {
    const r = new Set<string>()
    for (const g of shown) for (const o of g.officials) if (o.role !== 'scorekeeper') r.add(o.role)
    return ['ref1', 'ref2', 'ref3'].filter(x => r.has(x) || x !== 'ref3')
  }, [shown])
  const cols = [...(show !== 'sk' ? refCols : []), ...(show !== 'refs' ? ['scorekeeper'] : [])]
  const name = (g: CpGame, role: string) => g.officials.filter(o => o.role === role).map(o => o.name).join(', ')
  const groups = useMemo(() => {
    const out: { key: string; title: string; games: CpGame[] }[] = []
    for (const g of shown) {
      const k = layout === 'field' ? `${g.date}|${g.location}` : g.date
      let grp = out.find(x => x.key === k)
      if (!grp) { grp = { key: k, title: layout === 'field' ? `${formatDate(g.date)} · ${g.location || 'No field'}` : formatDate(g.date), games: [] }; out.push(grp) }
      grp.games.push(g)
    }
    if (layout === 'field') out.sort((a, b) => a.key.split('|')[0].localeCompare(b.key.split('|')[0]) || byField(a.key.split('|')[1], b.key.split('|')[1]))
    return out
  }, [shown, layout])

  const sel = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm sm:min-h-0 sm:py-2'
  const note = [day === 'all' ? 'Every day' : formatDate(day), side !== 'all' ? `${side === 'boys' ? 'Boys' : 'Girls'} games` : '', show === 'refs' ? 'Refs only' : show === 'sk' ? 'Scorekeepers only' : '', cp ? `Officials as of the checkpoint ${when(cp.at)}` : ''].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <style>{`@media print {
        @page { size: landscape; margin: 0.35in }
        body * { visibility: hidden !important }
        #ps-print, #ps-print * { visibility: visible !important }
        #ps-print { position: absolute; left: 0; top: 0; width: 100% }
        #ps-print table { font-size: 10px }
        #ps-print tr { break-inside: avoid }
        #ps-print .ps-group { break-inside: auto }
        #ps-print h2 { break-after: avoid }
        html, body, #ps-print { background: #fff !important }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
      }`}</style>
      <div className="pt-6 print:hidden">
        <Link href={`/tournaments/${params.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ChevronLeft size={14} aria-hidden /> Assigner</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Print the schedule</h1>
        <p className="text-sm text-slate-500">Pick what to print, then click <b className="font-semibold">Print</b>. To get a PDF, choose <b className="font-semibold">Save as PDF</b> as the printer.</p>
        {cp && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"><History size={15} aria-hidden />Showing officials as of the checkpoint {when(cp.at)}, not now. <Link href={`/tournaments/${params.id}/print-schedule`} className="font-semibold underline">Print today&apos;s</Link></p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={day} onChange={e => setDay(e.target.value)} aria-label="Day" className={sel}>
            <option value="all">Every day</option>
            {days.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
          </select>
          <select value={side} onChange={e => setSide(e.target.value as 'all' | 'boys' | 'girls')} aria-label="Games" className={sel}>
            <option value="all">All games</option><option value="boys">Boys games</option><option value="girls">Girls games</option>
          </select>
          <select value={show} onChange={e => setShow(e.target.value as 'both' | 'refs' | 'sk')} aria-label="Officials" className={sel}>
            <option value="both">Refs and scorekeepers</option><option value="refs">Refs only</option><option value="sk">Scorekeepers only</option>
          </select>
          <select value={layout} onChange={e => setLayout(e.target.value as 'time' | 'field')} aria-label="Layout" className={sel}>
            <option value="time">By time</option><option value="field">By field</option>
          </select>
          <button type="button" onClick={() => window.print()} disabled={!shown.length} className="btn-primary inline-flex min-h-[44px] items-center gap-1.5 sm:ml-auto sm:min-h-0"><Printer size={15} aria-hidden />Print</button>
        </div>
      </div>

      {err && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</p>}
      {!games && !err && <p className="p-10 text-center text-sm text-slate-400">Loading…</p>}
      {games && shown.length === 0 && <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No games to print with these picks.</p>}

      {shown.length > 0 && (
        <div id="ps-print" className="mt-4">
          <div className="mb-3">
            <p className="text-lg font-bold text-slate-900">{t?.name}</p>
            <p className="text-xs text-slate-600">{note} · {shown.length} game{shown.length === 1 ? '' : 's'} · printed {when(new Date().toISOString())}</p>
          </div>
          {groups.map(grp => (
            <section key={grp.key} className="ps-group mb-4">
              <h2 className="mb-1 text-sm font-bold text-slate-800">{grp.title}</h2>
              {/* Phones: a card per game. Wider screens and paper: the table. */}
              <div className="space-y-1.5 sm:hidden print:hidden">
                {grp.games.map(g => (
                  <div key={g.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                    <p className="font-semibold text-slate-900">{time(g.startTime)}{layout === 'time' && g.location ? ` · ${g.location}` : ''} <span className="font-normal text-slate-500">#{g.gameNumber} · {g.division}</span></p>
                    <p className="text-slate-600">{g.team1} vs {g.team2}</p>
                    <p className="mt-1 text-xs text-slate-700">{cols.map(c => `${ROLE_SHORT[c] || c}: ${name(g, c) || 'open'}`).join(' · ')}</p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white sm:block print:block print:rounded-none print:border-0">
                <table className="w-full table-fixed text-left text-xs">
                  {/* The same widths for every day and field, so the columns line up down the page. */}
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    {layout === 'time' && <col style={{ width: '9%' }} />}
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '11%' }} />
                    <col />
                    {cols.map(c => <col key={c} style={{ width: '12%' }} />)}
                  </colgroup>
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Time</th>
                      {layout === 'time' && <th className="px-2 py-1.5">Field</th>}
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">Division</th>
                      <th className="px-2 py-1.5">Teams</th>
                      {cols.map(c => <th key={c} className="px-2 py-1.5">{ROLE_SHORT[c] || c}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grp.games.map(g => (
                      <tr key={g.id}>
                        <td className="whitespace-nowrap px-2 py-1">{time(g.startTime)}</td>
                        {layout === 'time' && <td className="whitespace-nowrap px-2 py-1">{g.location}</td>}
                        <td className="px-2 py-1">{g.gameNumber}</td>
                        <td className="px-2 py-1">{g.division}</td>
                        <td className="px-2 py-1">{g.team1} vs {g.team2}</td>
                        {cols.map(c => <td key={c} className="px-2 py-1">{name(g, c) || <span className="text-slate-400">open</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
