'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Eraser, Plus, ArrowRight, ArrowDown } from 'lucide-react'
import { time12, dayDate } from '@/lib/time12'

// BUILD A SCHEDULE (Bo, Oct 19 2026): for a head assigner who is handed the day by a
// tournament director who may not use Whistle Ready, often as a spreadsheet of fields
// across and times down with a division in each box. They aren't scheduling, just
// entering what they were given: set the fields and slots, pick a division, click or
// drag across the boxes. Games are made with teams TBD (api/tournaments/[id]/build-games).

const COLORS = ['#fde2e1', '#dcfce7', '#dbeafe', '#fef3c7', '#ede9fe', '#fed7aa', '#cffafe', '#fce7f3', '#e2e8f0', '#d9f99d', '#fecdd3', '#bae6fd']
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
const hhmm = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? Math.round(n) : lo))

export default function ScheduleBuilder({ tournamentId, days, defaultDay, gamesByDay, knownDivisions, onClose, onDone }: {
  tournamentId: string; days: string[]; defaultDay: string; gamesByDay: Record<string, number>; knownDivisions: string[]
  onClose: () => void; onDone: (day: string) => void
}) {
  const [day, setDay] = useState(defaultDay || days[0] || '')
  const [fieldCount, setFieldCount] = useState(8)
  const [fields, setFields] = useState<string[]>(Array.from({ length: 8 }, (_, i) => `Field ${i + 1}`))
  const [start, setStart] = useState('08:00')
  const [every, setEvery] = useState(60)
  const [slotCount, setSlotCount] = useState(8)
  const [times, setTimes] = useState<string[]>(Array.from({ length: 8 }, (_, i) => hhmm(8 * 60 + i * 60)))
  const [divisions, setDivisions] = useState<string[]>(knownDivisions.length ? knownDivisions.slice(0, 24) : [])
  const [newDiv, setNewDiv] = useState('')
  const [brush, setBrush] = useState<string>(knownDivisions[0] || '')   // '' = eraser
  const [cells, setCells] = useState<Record<string, string>>({})          // "row|col" -> division
  const [replace, setReplace] = useState(true)
  const [saving, setSaving] = useState(false)
  const painting = useRef<null | 'paint' | 'erase'>(null)

  // Field count and slot settings rebuild the headers, keeping names and times already typed.
  function changeFields(n: number) {
    const c = clamp(n, 1, 40); setFieldCount(c)
    setFields(f => Array.from({ length: c }, (_, i) => f[i] ?? `Field ${i + 1}`))
  }
  function rebuildTimes(s = start, e = every, n = slotCount) {
    setTimes(Array.from({ length: clamp(n, 1, 30) }, (_, i) => hhmm(toMin(s) + i * clamp(e, 5, 240))))
  }
  useEffect(() => { const up = () => { painting.current = null }; window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up) }, [])

  const colorOf = (d: string) => COLORS[Math.max(0, divisions.indexOf(d)) % COLORS.length]
  const set = (k: string, mode: 'paint' | 'erase') => setCells(c => { const n = { ...c }; if (mode === 'erase' || !brush) delete n[k]; else n[k] = brush; return n })
  function down(k: string) { const mode = brush && cells[k] !== brush ? 'paint' : 'erase'; painting.current = mode; set(k, mode) }
  function enter(k: string) { if (painting.current) set(k, painting.current) }
  const fillRow = (r: number) => setCells(c => { const n = { ...c }; fields.forEach((_, i) => { if (brush) n[`${r}|${i}`] = brush; else delete n[`${r}|${i}`] }); return n })
  const fillCol = (col: number) => setCells(c => { const n = { ...c }; times.forEach((_, r) => { if (brush) n[`${r}|${col}`] = brush; else delete n[`${r}|${col}`] }); return n })
  function addDivision() {
    const names = newDiv.split(',').map(s => s.trim()).filter(Boolean).filter(s => !divisions.includes(s))
    if (!names.length) return
    setDivisions(d => [...d, ...names]); setBrush(names[0]); setNewDiv('')
  }

  const games = useMemo(() => Object.entries(cells)
    .map(([k, division]) => { const [r, c] = k.split('|').map(Number); return { startTime: times[r], location: (fields[c] || '').trim(), division } })
    .filter(g => g.startTime && g.location && g.division), [cells, times, fields])
  const perDiv = useMemo(() => { const m: Record<string, number> = {}; for (const g of games) m[g.division] = (m[g.division] || 0) + 1; return m }, [games])
  const already = gamesByDay[day] || 0
  const dupFields = fields.filter((f, i) => f.trim() && fields.findIndex(x => x.trim().toLowerCase() === f.trim().toLowerCase()) !== i)

  async function create() {
    if (!day) { toast.error('Pick a day'); return }
    if (!games.length) { toast.error('Fill in at least one box'); return }
    if (dupFields.length) { toast.error(`Two fields are both named ${dupFields[0]}`); return }
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournamentId}/build-games`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: day, games, replaceDay: already > 0 && replace }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error || 'Could not make the games'); return }
    toast.success(`Made ${d.created} games on ${dayDate(day)}`)
    onDone(day)
  }

  const num = 'input h-9 w-20'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col" role="dialog" aria-label="Build a schedule">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-bold">Build a schedule</h2>
            <p className="text-sm text-slate-500 mt-0.5">Enter the day you were given: set the fields and game times, pick a division, then click or drag across the boxes. Games are made with teams TBD.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-end gap-3 text-xs font-semibold text-slate-500">
          <label className="flex flex-col gap-1">Day
            <span className="flex items-center gap-1">
              {days.map(d => <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} className={`h-9 px-2.5 rounded-lg border text-[13px] font-semibold ${day === d ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{dayDate(d)}</button>)}
              <input type="date" className="input h-9 w-auto" value={day} onChange={e => setDay(e.target.value)} aria-label="Another day" />
            </span>
          </label>
          <label className="flex flex-col gap-1">Fields<input type="number" min={1} max={40} className={num} value={fieldCount} onChange={e => changeFields(Number(e.target.value))} /></label>
          <label className="flex flex-col gap-1">First game<input type="time" className="input h-9 w-auto" value={start} onChange={e => { setStart(e.target.value); rebuildTimes(e.target.value) }} /></label>
          <label className="flex flex-col gap-1">Minutes apart<input type="number" min={5} max={240} step={5} className={num} value={every} onChange={e => { setEvery(Number(e.target.value)); rebuildTimes(start, Number(e.target.value)) }} /></label>
          <label className="flex flex-col gap-1">Time slots<input type="number" min={1} max={30} className={num} value={slotCount} onChange={e => { const n = clamp(Number(e.target.value), 1, 30); setSlotCount(n); rebuildTimes(start, every, n) }} /></label>
          <p className="font-normal text-slate-400 basis-full sm:basis-auto sm:ml-auto max-w-xs">Rename a field or change one time right in the grid, for a slot that runs short.</p>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">Division</span>
          {divisions.map(d => (
            <button key={d} type="button" onClick={() => setBrush(d)} aria-pressed={brush === d}
              className={`h-8 px-3 rounded-full text-[13px] font-semibold border ${brush === d ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-transparent'}`} style={{ background: colorOf(d) }}>
              {d}{perDiv[d] ? <span className="ml-1.5 text-slate-500 font-medium">{perDiv[d]}</span> : null}
            </button>
          ))}
          <button type="button" onClick={() => setBrush('')} aria-pressed={brush === ''}
            className={`h-8 px-3 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1 ${brush === '' ? 'border-slate-900 bg-slate-100' : 'border-slate-200 text-slate-500'}`}><Eraser size={13} /> Erase</button>
          <span className="inline-flex items-center gap-1 ml-1">
            <input className="input h-8 w-44" placeholder={divisions.length ? 'Add a division' : 'Divisions, e.g. K-2, JV, VAR'} value={newDiv} onChange={e => setNewDiv(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDivision() } }} />
            <button type="button" onClick={addDivision} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center" aria-label="Add division"><Plus size={15} /></button>
          </span>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3 select-none">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-white text-[11px] font-bold text-slate-400 text-left pr-2">Time</th>
                {fields.map((f, i) => (
                  <th key={i} className="sticky top-0 z-10 bg-white px-0.5 pb-1">
                    <input value={f} onChange={e => setFields(fs => fs.map((x, j) => j === i ? e.target.value : x))} aria-label={`Field ${i + 1} name`}
                      className={`w-24 h-7 rounded-md border px-1.5 text-[12px] font-bold text-center ${dupFields.includes(f) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
                    <button type="button" onClick={() => fillCol(i)} title={brush ? `Fill this field with ${brush}` : 'Clear this field'} className="mt-0.5 w-24 h-5 rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"><ArrowDown size={12} /></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((t, r) => (
                <tr key={r}>
                  <td className="sticky left-0 z-10 bg-white pr-1.5 py-0.5">
                    <div className="flex items-center gap-1">
                      <input type="time" value={t} onChange={e => setTimes(ts => ts.map((x, j) => j === r ? e.target.value : x))} aria-label={`Slot ${r + 1} time`} className="h-8 w-[104px] rounded-md border border-slate-200 px-1 text-[12px] font-semibold" />
                      <button type="button" onClick={() => fillRow(r)} title={brush ? `Fill ${time12(t)} with ${brush}` : `Clear ${time12(t)}`} className="h-8 w-6 rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"><ArrowRight size={12} /></button>
                    </div>
                  </td>
                  {fields.map((_, c) => {
                    const k = `${r}|${c}`, d = cells[k]
                    return (
                      <td key={c} className="p-0.5">
                        <button type="button" onMouseDown={() => down(k)} onMouseEnter={() => enter(k)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); down(k); painting.current = null } }}
                          aria-label={`${time12(t)} ${fields[c]}: ${d || 'empty'}`}
                          className={`block w-24 h-8 rounded-md text-[12px] font-semibold truncate px-1 ${d ? 'text-slate-800 border border-black/5' : 'border border-dashed border-slate-200 text-slate-300 hover:border-slate-400'}`}
                          style={d ? { background: colorOf(d) } : undefined}>{d || ''}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {already > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-amber-800 font-semibold">{dayDate(day)} already has {already} game{already === 1 ? '' : 's'}.</span>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={replace} onChange={() => setReplace(true)} /> Replace them</label>
              <label className="inline-flex items-center gap-1.5"><input type="radio" checked={!replace} onChange={() => setReplace(false)} /> Add to them</label>
            </div>
          )}
          <div className="flex-1" />
          <span className="text-sm text-slate-500">{games.length} game{games.length === 1 ? '' : 's'}</span>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={saving || !games.length} onClick={create}>{saving ? 'Making games…' : already > 0 && replace ? `Replace with ${games.length} games` : `Make ${games.length} games`}</button>
        </div>
      </div>
    </div>
  )
}
