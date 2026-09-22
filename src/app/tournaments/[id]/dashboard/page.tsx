'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Target, ClipboardList, Radio, TriangleAlert, ClipboardCheck, Contact,
  Megaphone, Wallet, ArrowRight, Trophy, ChevronDown, GripVertical, type LucideIcon,
} from 'lucide-react'
import ChatWidget from '../ChatWidget'
import TournamentNav from '../TournamentNav'
import CopyTournamentButton from '@/components/CopyTournamentButton'

interface DashData {
  tournament: {
    id: string; name: string; sport: string; startDate: string; endDate: string
    location: string; logoUrl: string; dates: string
    registrationDivisions?: string
  }
  games: { total: number; active: number; canceled: number; assigned: number; divisions: number }
  staff: { onRoster: number; refPayTotal: number; hourlyPayTotal: number; totalStaffExpense: number; totalStaffPaid: number; refCount: number; skCount: number }
  financials: { otherIncome: number; otherExpenses: number; txByCategory: Record<string, number> }
  registrations: {
    clubs: number; teams: number; invoiced: number; received: number; balance: number
    paidInFull: number; outstanding: number
    byMethod: Record<string, number>; byDivision: Record<string, number>
    hotelYes: number; hotelMaybe: number
  }
  playerCount: number
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// Compact KPI tile.
function Kpi({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 sm:p-4 h-full transition-colors${href ? ' hover:border-teal-300 cursor-pointer' : ''}`}>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// Game Day quick-action card.
function GameDayCard({ href, icon: Icon, label, hint, accent }: { href: string; icon: LucideIcon; label: string; hint?: string; accent?: boolean }) {
  return (
    <Link href={href}
      className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-3 hover:border-teal-300 transition-colors">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}><Icon size={20} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-800 leading-tight">{label}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <ArrowRight size={16} className="text-slate-300 flex-shrink-0 sm:hidden" />
    </Link>
  )
}

type DivTeam = { teamName: string; clubName: string; logoUrl: string }

export default function DashboardPage() {
  const { id } = useParams()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamsByDiv, setTeamsByDiv] = useState<Record<string, DivTeam[]>>({})
  const [openDiv, setOpenDiv] = useState<string | null>(null)
  // Whether the public can register right now. Defaults to true so the badge doesn't
  // flash "closed" while loading; the API returns the real value.
  const [regOpen, setRegOpen] = useState(true)
  // Division tile order. null = follow the saved order; an array = the order being
  // dragged right now (applied optimistically so the tiles move under the finger).
  const [divOrder, setDivOrder] = useState<string[] | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [orderErr, setOrderErr] = useState('')
  const dragFrom = useRef<number | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${id}/dashboard`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetch(`/api/tournaments/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(t => { if (t) setRegOpen(t.teamRegEnabled !== false) })
      .catch(() => {})
  }, [id])

  // Teams grouped by division (for the expandable Registered teams list).
  useEffect(() => {
    fetch(`/api/registrations?tournamentId=${id}`)
      .then(r => r.ok ? r.json() : [])
      .then((regs: any[]) => {
        const map: Record<string, DivTeam[]> = {}
        ;(Array.isArray(regs) ? regs : []).forEach(reg => {
          ;(reg.teams || []).forEach((t: any) => {
            const div = String(t.division || '').trim() || 'Unassigned'   // same key the API counts under
            if (!map[div]) map[div] = []
            map[div].push({ teamName: t.teamName || t.clubName || 'Team', clubName: t.clubName || reg.clubName || '', logoUrl: t.logoUrl || '' })
          })
        })
        Object.values(map).forEach(list => list.sort((a, b) => a.teamName.localeCompare(b.teamName)))
        setTeamsByDiv(map)
      })
      .catch(() => {})
  }, [id])

  if (loading) return <div className="text-slate-400 text-center py-20">Loading…</div>
  if (!data) return <div className="text-slate-400 text-center py-20">Tournament not found.</div>

  const { tournament: t, games, staff, registrations: reg, financials: fin } = data
  const assignPct = games.active > 0 ? Math.round((games.assigned / (games.active * 2)) * 100) : 0
  const collectPct = reg.invoiced > 0 ? Math.round((reg.received / reg.invoiced) * 100) : 0
  // Tile order follows registrationDivisions -- the same curated list the divisions page
  // and the registration form already use, so all three agree. A division that is not on
  // that list yet (added by an import, say) falls to the end, biggest first, with the name
  // breaking ties so the order is stable between loads.
  // NOT a top-N slice: these counts have to add up to the Teams KPI above, or the dashboard
  // looks like it has lost teams — 21 registered, 19 shown was exactly that bug.
  const curated: string[] = (() => {
    try { const a = JSON.parse(t.registrationDivisions || '[]'); return Array.isArray(a) ? a.map(String) : [] }
    catch { return [] }
  })()
  const rank = new Map(curated.map((n, i) => [n, i]))
  const savedOrder = Object.entries(reg.byDivision)
    .sort((a, b) => {
      const ra = rank.has(a[0]) ? rank.get(a[0])! : Number.MAX_SAFE_INTEGER
      const rb = rank.has(b[0]) ? rank.get(b[0])! : Number.MAX_SAFE_INTEGER
      return ra - rb || b[1] - a[1] || a[0].localeCompare(b[0])
    })
    .map(([d]) => d)
  // Guard against a stale drag order after a refetch: keep only names that still have
  // teams, then append anything new that arrived while dragging.
  const shown = divOrder
    ? [...divOrder.filter(d => d in reg.byDivision), ...savedOrder.filter(d => !divOrder.includes(d))]
    : savedOrder
  const divisionRows = shown.map(d => [d, reg.byDivision[d]] as [string, number])
  const divisionTeams = divisionRows.reduce((s, [, n]) => s + n, 0)

  // Reordering the visible tiles must not drop the divisions that have no teams yet and so
  // are not on screen. Walk the saved list and swap in the new order only where a visible
  // name sits, leaving the empty ones on their original rungs.
  function mergedOrder(next: string[]) {
    const visible = new Set(next)
    const queue = [...next]
    const merged = curated.map(n => (visible.has(n) ? queue.shift()! : n))
    return [...merged, ...queue, ...next.filter(n => !curated.includes(n) && !merged.includes(n))]
  }

  async function persistOrder(next: string[]) {
    setOrderErr('')
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationDivisions: JSON.stringify(mergedOrder(next)) }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setDivOrder(null)   // snap back to what is actually saved
      setOrderErr('Order not saved')
    }
  }

  // Pointer events rather than HTML5 drag-and-drop: the latter does nothing on an iPad,
  // and the roster gets rearranged on a tablet as often as on a desktop. Only the grip
  // carries touch-action:none, so the rest of the tile still taps through and the page
  // still scrolls under a finger.
  function dragStart(e: React.PointerEvent, idx: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragFrom.current = idx
    setDragIdx(idx)
    setDivOrder(shown)
  }
  function dragMove(e: React.PointerEvent) {
    if (dragFrom.current === null) return
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-div-idx]') as HTMLElement | null
    if (!el) return
    const over = Number(el.dataset.divIdx)
    const from = dragFrom.current
    if (Number.isNaN(over) || over === from) return
    setDivOrder(prev => {
      const list = [...(prev ?? shown)]
      const [moved] = list.splice(from, 1)
      list.splice(over, 0, moved)
      return list
    })
    dragFrom.current = over
    setDragIdx(over)
  }
  function dragEnd() {
    if (dragFrom.current === null) return
    dragFrom.current = null
    setDragIdx(null)
    if (divOrder) persistOrder(divOrder)
  }

  // Is the event happening today (for emphasising the Game Day console)?
  const isLive = (() => {
    if (!t.startDate) return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const start = new Date(t.startDate); start.setHours(0, 0, 0, 0)
    const end = t.endDate ? new Date(t.endDate) : start; end.setHours(0, 0, 0, 0)
    return today >= start && today <= end
  })()

  const hasMoney = reg.invoiced > 0 || staff.totalStaffExpense > 0 || fin.otherIncome > 0 || fin.otherExpenses > 0
  const revenue = reg.invoiced + fin.otherIncome
  const expense = staff.totalStaffExpense + fin.otherExpenses
  const grossProfit = revenue - expense

  return (
    <>
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 pb-24 sm:pb-6">
      <div className="max-w-5xl mx-auto">

      <TournamentNav id={String(id)} name={t.name} logoUrl={t.logoUrl} />

      <div className="max-w-5xl mx-auto px-0 sm:px-6 py-2 sm:py-8 space-y-6 sm:space-y-8">

        {/* ── At a glance ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">At a glance</h2>
            {/* Registration status — the public-facing on/off switch, surfaced here so
                you never have to dig into setup to know whether teams can register. */}
            <Link href={`/tournaments/${id}/builder?section=regtypes`}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-colors ${
                regOpen
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
              title={regOpen ? 'Teams can register now — click to change' : 'Registration is closed — click to change'}>
              {regOpen ? 'Registration open' : 'Registration closed'}
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Kpi label="Teams" value={reg.teams} sub={reg.clubs > 0 ? `${reg.clubs} clubs` : undefined} href={`/tournaments/${id}/registrations`} />
            <Kpi label="Games" value={games.active} sub={`${games.divisions} divisions`} href={`/tournaments/${id}/scheduler`} />
            <Kpi label="Staff assigned" value={`${assignPct}%`} sub={`${staff.onRoster} on roster`} href={`/tournaments/${id}/assignments`} />
            <Kpi label="Collected" value={hasMoney ? `${collectPct}%` : '—'} sub={hasMoney ? `${fmt(reg.balance)} due` : undefined} href={`/tournaments/${id}/financials`} />
          </div>
        </section>

        {/* ── Game Day console ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live</h2>
            {isLive && <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Live now</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            <GameDayCard href={`/tournaments/${id}/scores`}         icon={Target}         label="Post scores"     hint="Quick entry" accent />
            <GameDayCard href={`/tournaments/${id}/assignments`}    icon={ClipboardList}  label="Assignments"     hint={`~${assignPct}% filled`} />
            <GameDayCard href={`/tournaments/${id}/communications`} icon={Megaphone}      label="Communications"  hint="Field requests · broadcast · incidents · contacts" />
          </div>
        </section>

        {/* ── Teams by division ─────────────────────────────────────────── */}
        {divisionRows.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Registered teams</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-medium text-slate-700 mb-3 sm:mb-4 flex items-center gap-2"><Trophy size={16} className="text-slate-400 flex-shrink-0" /> Teams by division <span className="text-xs font-normal text-slate-400">· {divisionTeams} team{divisionTeams === 1 ? '' : 's'} in {divisionRows.length} division{divisionRows.length === 1 ? '' : 's'}</span><span className="text-xs font-normal text-slate-400 hidden sm:inline">· tap one to see teams, drag the grip to reorder</span>{orderErr && <span className="text-xs font-normal text-rose-600">· {orderErr}</span>}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {divisionRows.map(([div, count], idx) => {
                  const open = openDiv === div
                  const dragging = dragIdx === idx
                  return (
                    <div key={div} data-div-idx={idx}
                      className={`flex items-center rounded-lg pl-1 pr-3 py-2 transition-colors ${dragging ? 'bg-teal-100 border border-teal-300 opacity-90' : open ? 'bg-teal-50 border border-teal-200' : 'bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                      <span role="button" tabIndex={-1} aria-label={`Reorder ${div}`} title="Drag to reorder"
                        onPointerDown={e => dragStart(e, idx)} onPointerMove={dragMove}
                        onPointerUp={dragEnd} onPointerCancel={dragEnd}
                        style={{ touchAction: 'none' }}
                        className="flex-shrink-0 px-1 py-1 -my-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                        <GripVertical size={13} />
                      </span>
                      <button type="button" onClick={() => setOpenDiv(o => o === div ? null : div)}
                        className="flex items-center justify-between gap-1 flex-1 min-w-0 text-left">
                        <span className="flex items-center gap-1 min-w-0">
                          <ChevronDown size={13} className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                          <span className="text-xs text-slate-600 truncate">{div}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">{count}</span>
                      </button>
                    </div>
                  )
                })}
              </div>

              {openDiv && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">{openDiv}</span>
                    <span className="text-xs text-slate-400">{(teamsByDiv[openDiv] || []).length} teams</span>
                  </div>
                  {(teamsByDiv[openDiv] || []).length === 0 ? (
                    <p className="text-sm text-slate-400">No team details found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {(teamsByDiv[openDiv] || []).map((tm, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          {tm.logoUrl
                            ? <img src={tm.logoUrl} alt="" className="w-6 h-6 rounded object-contain bg-white border border-slate-200 flex-shrink-0" />
                            : <span className="w-6 h-6 rounded bg-slate-200 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{tm.teamName.charAt(0).toUpperCase()}</span>}
                          <span className="min-w-0">
                            <span className="block text-sm text-slate-800 truncate">{tm.teamName}</span>
                            {tm.clubName && tm.clubName !== tm.teamName && <span className="block text-[11px] text-slate-400 truncate">{tm.clubName}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Money snapshot ────────────────────────────────────────────── */}
        {hasMoney && (
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Money</h2>
            <Link href={`/tournaments/${id}/financials`}
              className="block bg-white border border-slate-200 rounded-xl p-4 sm:p-5 hover:border-teal-300 transition-colors">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xl font-semibold text-slate-800">{fmt(revenue)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Revenue</div>
                  <div className="text-xs text-slate-400">{fmt(reg.received)} collected</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-red-500">{fmt(expense)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Staff expenses</div>
                  <div className="text-xs text-slate-400">{fmt(staff.totalStaffPaid)} paid</div>
                </div>
                <div>
                  <div className={`text-xl font-semibold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(grossProfit)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Gross profit</div>
                </div>
                <div>
                  <div className={`text-xl font-semibold ${reg.balance > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{fmt(reg.balance)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Balance due</div>
                </div>
              </div>
              {reg.invoiced > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Collection progress</span>
                    <span>{collectPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(100, collectPct)}%` }} />
                  </div>
                </div>
              )}
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-700">
                <Wallet size={15} /> View full financials <ArrowRight size={14} />
              </div>
            </Link>
          </section>
        )}

        {/* ── Empty state when nothing registered yet ───────────────────── */}
        {reg.clubs === 0 && (
          <section>
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 text-center">
              <div className="flex justify-center mb-3 text-slate-300"><ClipboardList size={32} /></div>
              <p className="text-slate-500 text-sm mb-3">No registrations yet</p>
              <Link href={`/tournaments/${id}/register`} target="_blank" className="btn-primary btn-sm">Share registration form</Link>
            </div>
          </section>
        )}

        {/* ── Tournament tools ──────────────────────────────────────────
            Copy tournament moved here when the Settings page was retired into
            Setup — it's an action, not a setting. */}
        <section className="pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-slate-700">Start next year&apos;s event from this one</p>
              <p className="text-xs text-slate-500 mt-0.5">Copies venues, divisions, pay rates and registration setup. Games and registrations stay behind.</p>
            </div>
            <CopyTournamentButton tournamentId={String(id)} tournamentName={t.name} />
          </div>
        </section>

      </div>
      </div>
    </div>
    <ChatWidget tournamentId={String(id)} tournamentName={t.name} />
    </>
  )
}
