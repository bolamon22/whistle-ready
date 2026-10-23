'use client'

import { Component, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { roleCanAccess } from '@/lib/routeAccess'
import { seesSeeding } from '@/lib/seedingRoles'

// Ready to seed (Bo, Oct 23 2026: "some sort of indication of when divisions need to be
// seeded ... it's hard to tell when they're ready"). Each division with a bracket: how many
// pool games are final, what's still playing, its first bracket game, and whether its seeds
// are saved. A division whose pool games are all final and isn't seeded asks to be seeded,
// in red within an hour of its first bracket game. Read-only: Seed now opens the division's
// Bracket tab, where Seed from standings fills the seeds. Refreshes every minute.
// Data: api/tournaments/[id]/seeding. compact (Scores page): only the divisions that need
// seeding now, and nothing at all otherwise. On the Divisions page (where the scheduler
// seeds, Bo Oct 23 2026) it starts folded unless a division is ready, and Seed now opens the
// division right there (onSeed) instead of reloading the page.

type Spot = { num: string; date: string; time: string; field: string }
type Row = { division: string; poolTotal: number; poolFinal: number; left: Spot[]; firstBracket: Spot | null; flights: { flight: string; count: number; need: number; seeded: boolean }[]; seeded: boolean }

const t12 = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return 'TBD'; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}` }
const at = (s: Spot) => { const [y, mo, d] = (s.date || '').split('-').map(Number); const m = /^(\d{1,2}):(\d{2})/.exec(s.time || ''); return y && m ? new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime() : NaN }
const dayOf = (s: Spot) => s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : ''
const inMins = (ms: number) => { const m = Math.round(ms / 60000); if (m <= 0) return m === 0 ? 'now' : `${-m} min ago`; return m < 90 ? `in ${m} min` : `in ${Math.round(m / 60)} hr` }

// A broken card must never take the page down with it on game day.
class Guard extends Component<{ children: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() { return { bad: true } }
  render() { return this.state.bad ? null : this.props.children }
}

type Props = { tid: string; compact?: boolean; foldUnlessReady?: boolean; onSeed?: (division: string) => void }
export default function SeedingCard(props: Props) {
  return <Guard><Card {...props} /></Guard>
}

function Card({ tid, compact, foldUnlessReady, onSeed }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(!foldUnlessReady)
  const [opened, setOpened] = useState(false)
  const { effectiveRole, planOff } = useRole()
  const canSeed = roleCanAccess(effectiveRole, `/tournaments/${tid}/divisions`, planOff)
  const canScore = roleCanAccess(effectiveRole, `/tournaments/${tid}/scores`, planOff)
  // Directors, admins, schedulers, field directors and assigners only (lib/seedingRoles).
  const allowed = seesSeeding(effectiveRole)

  useEffect(() => {
    if (!allowed) return
    let live = true
    const load = () => fetch(`/api/tournaments/${tid}/seeding`).then(r => (r.ok ? r.json() : null)).then(d => { if (live && d && Array.isArray(d.divisions)) { setRows(d.divisions); setNow(Date.now()) } }).catch(() => {})
    load()
    const iv = window.setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { live = false; window.clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [tid, allowed])

  // Folded until a division is ready (once per visit, so folding it by hand sticks).
  useEffect(() => {
    if (!foldUnlessReady || opened || !rows) return
    if (rows.some(r => !r.seeded && r.poolTotal > 0 && r.poolFinal >= r.poolTotal)) { setOpen(true); setOpened(true) }
  }, [rows, foldUnlessReady, opened])

  if (!allowed || !rows || !rows.length) return null
  const state = (r: Row) => r.seeded ? 'seeded' : r.poolTotal > 0 && r.poolFinal >= r.poolTotal ? 'ready' : r.poolTotal - r.poolFinal === 1 ? 'one' : 'playing'
  const startMs = (r: Row) => (r.firstBracket ? at(r.firstBracket) : NaN)
  const urgent = (r: Row) => state(r) === 'ready' && Number.isFinite(startMs(r)) && startMs(r) - now < 60 * 60000
  const rank = (r: Row) => ({ ready: 0, one: 1, playing: 2, seeded: 3 } as Record<string, number>)[state(r)]
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || (startMs(a) || 9e15) - (startMs(b) || 9e15) || a.division.localeCompare(b.division))
  const ready = sorted.filter(r => state(r) === 'ready')
  const seededN = sorted.filter(r => r.seeded).length
  const seedHref = (r: Row) => `/tournaments/${tid}/divisions?division=${encodeURIComponent(r.division)}&tab=bracket`
  const first = (r: Row) => r.firstBracket ? `First bracket game ${dayOf(r.firstBracket)} ${t12(r.firstBracket.time)} (${r.firstBracket.num}, ${r.firstBracket.field})${Number.isFinite(startMs(r)) && startMs(r) > now - 3 * 3600000 && startMs(r) - now < 12 * 3600000 ? `, ${inMins(startMs(r) - now)}` : ''}` : 'Bracket games not scheduled yet'

  if (compact) {
    if (!ready.length) return null
    return (
      <div className={`rounded-xl border px-3 py-2.5 text-sm ${ready.some(urgent) ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <p className="flex items-center gap-1.5 font-semibold"><Trophy size={15} aria-hidden /> Ready to seed</p>
        <ul className="mt-1 space-y-1">
          {ready.map(r => (
            <li key={r.division} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <b>{r.division}</b><span className="text-xs opacity-80">{first(r)}</span>
              {canSeed && (onSeed ? <button type="button" onClick={() => onSeed(r.division)} className="ml-auto rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700">Seed now</button> : <Link href={seedHref(r)} className="ml-auto rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700">Seed now</Link>)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const chip = (r: Row) => {
    const s = state(r)
    if (s === 'seeded') return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">✓ Seeded</span>
    if (s === 'ready') return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${urgent(r) ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>● Ready to seed</span>
    if (s === 'one') return <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">Waiting on 1 score</span>
    return <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">Playing · {r.poolTotal - r.poolFinal} left</span>
  }
  const why = (r: Row) => {
    const s = state(r)
    if (s === 'one' || s === 'playing') {
      const n = r.left[0]
      return `${s === 'one' && n ? `${n.num} · ${dayOf(n)} ${t12(n.time)}, ${n.field}. ` : ''}${first(r)}`
    }
    if (s === 'seeded') return r.flights.length > 1 ? `${r.flights.map(f => `Flight ${f.flight}`).join(' and ')} seeded` : first(r)
    const part = r.flights.filter(f => f.count > 0 && !f.seeded)
    return `${first(r)}${part.length ? ` · ${part.map(f => `${r.flights.length > 1 ? `Flight ${f.flight}: ` : ''}${f.count} of ${f.need} seeds saved`).join(', ')}` : ''}`
  }

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
      {ready.length > 0 && (
        <div className={`flex flex-wrap items-center gap-2 rounded-t-xl border-b px-4 py-2.5 text-sm ${ready.some(urgent) ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span>⚠️ <b>{ready.map(r => r.division).join(', ')}</b> {ready.length === 1 ? 'is' : 'are'} ready to seed.</span>
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <Trophy size={17} className="text-amber-500" aria-hidden />
        <b className="text-[15px] text-slate-900">Seeding</b>
        <span className="ml-auto text-xs text-slate-500">{ready.length} ready · {seededN} of {rows.length} seeded</span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {sorted.map(r => {
            const s = state(r)
            return (
              <li key={r.division} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${s === 'ready' ? (urgent(r) ? 'bg-red-50/60' : 'bg-amber-50/50') : ''}`}>
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold text-slate-900">{r.division}</p>
                  <p className="text-xs text-slate-500">{r.poolFinal} of {r.poolTotal} pool games final</p>
                  {s !== 'seeded' && s !== 'ready' && r.poolTotal > 0 && <div className="mt-1 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-400" style={{ width: `${Math.round((r.poolFinal / r.poolTotal) * 100)}%` }} /></div>}
                </div>
                <div className="min-w-[12rem] flex-[1.4]">
                  {chip(r)}
                  <p className="mt-0.5 text-xs text-slate-500">{why(r)}</p>
                </div>
                {s === 'ready' && canSeed && (onSeed ? <button type="button" onClick={() => onSeed(r.division)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Seed now</button> : <Link href={seedHref(r)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Seed now</Link>)}
                {s === 'one' && canScore && <Link href={`/tournaments/${tid}/scores`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Post score</Link>}
                {s === 'seeded' && canSeed && (onSeed ? <button type="button" onClick={() => onSeed(r.division)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button> : <Link href={seedHref(r)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</Link>)}
              </li>
            )
          })}
        </ul>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">Ready = every pool game has a final score. Seeded = the bracket&apos;s seeds are saved. Updates every minute.</p>
    </section>
  )
}
