'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Target, ClipboardList, Eye, Wrench, Users, Flag, SlidersHorizontal,
  Settings, Medal, Calendar, FileText, MapPin, Banknote, BarChart3,
  Wallet, Trophy, ChevronDown, Contact, Radio, Megaphone, type LucideIcon,
} from 'lucide-react'
import ChatWidget from '../ChatWidget'
import TournamentNav from '../TournamentNav'

interface DashData {
  tournament: {
    id: string; name: string; sport: string; startDate: string; endDate: string
    location: string; logoUrl: string; dates: string
  }
  games: {
    total: number; active: number; canceled: number; assigned: number; divisions: number
  }
  staff: { onRoster: number; refPayTotal: number; hourlyPayTotal: number; totalStaffExpense: number; totalStaffPaid: number; refCount: number; skCount: number }
  financials: { otherIncome: number; otherExpenses: number; txByCategory: Record<string, number> }
  registrations: {
    clubs: number; teams: number; invoiced: number; received: number; balance: number
    paidInFull: number; outstanding: number
    byMethod: Record<string, number>
    byDivision: Record<string, number>
    hotelYes: number; hotelMaybe: number
  }
  playerCount: number
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const payLabel = (m: string) => m === 'credit_card' ? 'Credit Card' : m === 'zelle' ? 'Zelle' : 'Check'

function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 transition-colors${href ? ' hover:border-slate-300 cursor-pointer' : ''}`}>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// ── Hub component ─────────────────────────────────────────────────────────────
function Hub({ icon: Icon, label, count, children }: {
  icon: LucideIcon; label: string; count: number; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-xl overflow-hidden border bg-white transition-colors ${open ? 'border-slate-300' : 'border-slate-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Icon size={18} />
          </span>
          <div>
            <div className="text-sm font-medium text-slate-800">{label}</div>
            <div className="text-xs text-slate-400">{count} sections</div>
          </div>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  )
}

function HubItem({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-b border-slate-100 last:border-b-0 transition-colors">
      <Icon size={16} className="text-slate-400 flex-shrink-0" />
      {label}
    </Link>
  )
}

export default function DashboardPage() {
  const { id } = useParams()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/tournaments/${id}/dashboard`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-slate-400 text-center py-20">Loading…</div>
  if (!data) return <div className="text-slate-400 text-center py-20">Tournament not found.</div>

  const { tournament: t, games, staff, registrations: reg, financials: fin } = data
  const assignPct = games.active > 0 ? Math.round((games.assigned / (games.active * 2)) * 100) : 0

  const topDivisions = Object.entries(reg.byDivision).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <>
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">

      <TournamentNav id={String(id)} name={t.name} logoUrl={t.logoUrl} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6 sm:space-y-8">

        {/* ── Game Day strip ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Game Day</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">

            <Link href={`/tournaments/${id}/scores`}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0"><Target size={20} /></span>
              <div>
                <div className="font-medium text-slate-800">Post Scores</div>
                <div className="text-xs text-slate-400">Quick entry</div>
              </div>
            </Link>

            <Link href={`/tournaments/${id}/assignments`}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><ClipboardList size={20} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">Assignments</div>
                <div className="text-xs text-slate-400">By game or staff</div>
              </div>
              {games.active > 0 && (
                <span className="text-xs font-medium bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  ~{assignPct}% filled
                </span>
              )}
            </Link>

            <Link href={`/tournaments/${id}/staff-view`}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><Eye size={20} /></span>
              <div>
                <div className="font-medium text-slate-800">Staff View</div>
                <div className="text-xs text-slate-400">What staff sees</div>
              </div>
            </Link>
          </div>
        </section>

        {/* ── Admin Hubs ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Admin</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">

            <Hub icon={Wrench} label="Tournament Builder" count={4}>
              <HubItem href={`/tournaments/${id}/builder`}    icon={Settings} label="Tournament Setup" />
              <HubItem href={`/tournaments/${id}/divisions`}  icon={Medal}    label="Divisions & Teams" />
              <HubItem href={`/tournaments/${id}`}            icon={Calendar} label="Assigner Schedule" />
              <HubItem href={`/tournaments/${id}/scores`}     icon={Target}   label="Score Input" />
            </Hub>

            <Hub icon={Users} label="Participants" count={2}>
              <HubItem href={`/tournaments/${id}/registrations`}        icon={ClipboardList} label="Team registrations" />
              <HubItem href={`/tournaments/${id}/player-registrations`} icon={FileText}      label="Player rosters" />
            </Hub>

            <Hub icon={Flag} label="Workforce" count={3}>
              <HubItem href={`/tournaments/${id}/roster`}      icon={Contact}  label="Staff directory" />
              <HubItem href={`/tournaments/${id}/assignments`} icon={MapPin}   label="Field assignments" />
              <HubItem href={`/tournaments/${id}/pay-summary`} icon={Banknote} label="Payroll" />
            </Hub>

            <Hub icon={SlidersHorizontal} label="Management" count={2}>
              <HubItem href={`/tournaments/${id}/financials`} icon={BarChart3} label="Financials" />
              <HubItem href={`/tournaments/${id}/settings`}   icon={Settings}  label="Tournament settings" />
            </Hub>

            <Hub icon={Radio} label="Communications" count={2}>
              <HubItem href={`/tournaments/${id}/ops`}       icon={Radio}     label="Ops board" />
              <HubItem href={`/tournaments/${id}/broadcast`} icon={Megaphone} label="Broadcast" />
            </Hub>

          </div>
        </section>

        {/* ── Registration summary ─────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Team Registrations</h2>
          {reg.clubs === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 text-center">
              <div className="flex justify-center mb-3 text-slate-300"><ClipboardList size={32} /></div>
              <p className="text-slate-500 text-sm mb-3">No registrations yet</p>
              <Link href={`/tournaments/${id}/register`} target="_blank" className="btn-primary btn-sm">Share Registration Form</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <StatCard label="Clubs Registered" value={reg.clubs} href={`/tournaments/${id}/registrations`} />
                <StatCard label="Teams Registered" value={reg.teams} href={`/tournaments/${id}/registrations`} />
                <StatCard label="Paid in Full" value={reg.paidInFull} sub={`${reg.outstanding} outstanding`} href={`/tournaments/${id}/registrations`} />
                {reg.hotelYes + reg.hotelMaybe > 0 && (
                  <StatCard label="Hotel Requests" value={reg.hotelYes} sub={`${reg.hotelMaybe} maybe`} href={`/tournaments/${id}/registrations`} />
                )}
              </div>

              {/* Financials */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-medium text-slate-700 mb-4 flex items-center gap-2"><Wallet size={16} className="text-slate-400" /> Financial Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Link href={`/tournaments/${id}/registrations`} className="text-center p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                    <div className="text-xl font-semibold text-slate-800">{fmt(reg.invoiced)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Total Invoiced</div>
                  </Link>
                  <Link href={`/tournaments/${id}/registrations`} className="text-center p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors cursor-pointer">
                    <div className="text-xl font-semibold text-green-700">{fmt(reg.received)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Total Received</div>
                  </Link>
                  <Link href={`/tournaments/${id}/registrations`} className={`text-center p-3 rounded-xl transition-colors cursor-pointer ${reg.balance > 0 ? 'bg-red-50 hover:bg-red-100' : 'bg-green-50 hover:bg-green-100'}`}>
                    <div className={`text-xl font-semibold ${reg.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(reg.balance)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Balance Due</div>
                  </Link>
                </div>
                {reg.invoiced > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Collection progress</span>
                      <span>{Math.round((reg.received / reg.invoiced) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((reg.received / reg.invoiced) * 100))}%` }} />
                    </div>
                  </div>
                )}
                {Object.keys(reg.byMethod).length > 0 && (
                  <div className="mt-4 flex gap-3 flex-wrap">
                    {Object.entries(reg.byMethod).map(([method, count]) => (
                      <span key={method} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                        {payLabel(method)}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Division breakdown */}
              {topDivisions.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-slate-700 mb-4 flex items-center gap-2"><Trophy size={16} className="text-slate-400" /> Teams by Division</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {topDivisions.map(([div, count]) => (
                      <div key={div} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-600 truncate mr-2">{div}</span>
                        <span className="text-sm font-semibold text-slate-800 flex-shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Games & Staff ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Schedule & Staff</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatCard label="Total Games" value={games.active} sub={games.canceled > 0 ? `${games.canceled} canceled` : undefined} />
            <StatCard label="Divisions" value={games.divisions} />
            <StatCard label="Assignments" value={games.assigned} sub={`~${assignPct}% filled`} />
            <StatCard label="Staff on Roster" value={staff.onRoster} />
          </div>
        </section>

        {/* ── P&L ───────────────────────────────────────────────────────── */}
        {(reg.invoiced > 0 || staff.totalStaffExpense > 0 || fin.otherIncome > 0 || fin.otherExpenses > 0) && (() => {
          const revenue = reg.invoiced + fin.otherIncome
          const received = reg.received + fin.otherIncome
          const expense = staff.totalStaffExpense + fin.otherExpenses
          const grossProfit = revenue - expense
          const netCash = reg.received + fin.otherIncome - staff.totalStaffPaid - fin.otherExpenses
          const margin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0
          const profitColor = grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
          const cashColor = netCash >= 0 ? 'text-emerald-600' : 'text-red-600'
          return (
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Profit & Loss</h2>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
                  <div className="p-5 text-center">
                    <div className="text-2xl font-bold text-slate-800">{fmt(revenue)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Total Revenue</div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmt(received)} collected</div>
                  </div>
                  <div className="p-5 text-center">
                    <div className="text-2xl font-bold text-red-500">{fmt(expense)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Staff Expenses</div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmt(staff.totalStaffPaid)} paid out</div>
                  </div>
                  <div className="p-5 text-center">
                    <div className={`text-2xl font-bold ${profitColor}`}>{fmt(grossProfit)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Gross Profit</div>
                    <div className="text-xs text-slate-400 mt-0.5">{margin}% margin</div>
                  </div>
                  <div className="p-5 text-center">
                    <div className={`text-2xl font-bold ${cashColor}`}>{fmt(netCash)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Net Cash Position</div>
                    <div className="text-xs text-slate-400 mt-0.5">collected − paid out</div>
                  </div>
                </div>
                <div className="border-t border-slate-100 px-4 sm:px-6 py-4 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Revenue Breakdown</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Registration invoices ({reg.clubs} clubs, {reg.teams} teams)</span>
                        <span className="font-semibold text-slate-800">{fmt(reg.invoiced)}</span>
                      </div>
                      {fin.otherIncome > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Other income</span>
                          <span className="font-semibold text-slate-800">{fmt(fin.otherIncome)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-100 pt-1.5">
                        <span className="font-semibold text-slate-700">Total Revenue</span>
                        <span className="font-bold text-slate-800">{fmt(revenue)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Collected so far</span>
                        <span className="text-emerald-600 font-medium">{fmt(reg.received)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Registration balance due</span>
                        <span className={reg.balance > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>{fmt(reg.balance)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100" />
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Expense Breakdown</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Referee pay ({staff.refCount} assignments)</span>
                        <span className="font-semibold text-slate-800">{fmt(staff.refPayTotal)}</span>
                      </div>
                      {staff.hourlyPayTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Hourly staff pay</span>
                          <span className="font-semibold text-slate-800">{fmt(staff.hourlyPayTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-600">Scorekeeper pay ({staff.skCount} assignments)</span>
                        <span className="font-semibold text-slate-800">{fmt(Math.max(0, staff.totalStaffExpense - staff.refPayTotal - staff.hourlyPayTotal))}</span>
                      </div>
                      {fin.otherExpenses > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Other expenses</span>
                          <span className="font-semibold text-slate-800">{fmt(fin.otherExpenses)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-100 pt-1.5">
                        <span className="font-semibold text-slate-700">Total Expenses</span>
                        <span className="font-bold text-red-500">{fmt(expense)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Paid out to staff</span>
                        <span className="text-slate-600 font-medium">{fmt(staff.totalStaffPaid)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Staff owed (unpaid)</span>
                        <span className={staff.totalStaffExpense - staff.totalStaffPaid > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>{fmt(staff.totalStaffExpense - staff.totalStaffPaid)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100" />
                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-slate-800">Gross Profit (Revenue − Expenses)</span>
                    <span className={`text-xl font-bold ${profitColor}`}>{fmt(grossProfit)}</span>
                  </div>
                  {revenue > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Expenses as % of revenue</span>
                        <span>{Math.min(100, Math.round((expense / revenue) * 100))}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-l-full" style={{ width: `${Math.min(100, Math.round((expense / revenue) * 100))}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )
        })()}

      </div>
      </div>
    </div>
    <ChatWidget tournamentId={String(id)} tournamentName={t.name} />
    </>
  )
}
