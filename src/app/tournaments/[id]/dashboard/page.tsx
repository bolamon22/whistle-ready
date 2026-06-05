'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{children}</h2>
}

function BigStat({ value, label, sub, valueClass = 'text-slate-900' }: {
  value: string | number; label: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="flex flex-col">
      <span className={`text-3xl font-extrabold leading-none ${valueClass}`}>{value}</span>
      <span className="text-sm font-semibold text-slate-600 mt-1">{label}</span>
      {sub && <span className="text-xs text-slate-400 mt-0.5">{sub}</span>}
    </div>
  )
}

function DetailRow({ label, value, valueClass = 'text-slate-800' }: {
  label: string; value: string; valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <span className="text-sm font-bold text-slate-700">{title}</span>
    </div>
  )
}

function ProgressBar({ pct, color = 'bg-teal-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

function NavTile({ href, icon, label, accent = 'hover:bg-blue-50 hover:border-blue-200' }: {
  href: string; icon: string; label: string; accent?: string
}) {
  return (
    <Link href={href} className={`bg-white border border-slate-200 rounded-xl px-3 py-3 flex flex-col items-center gap-1.5 text-center transition-all ${accent} group min-w-[72px]`}>
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-semibold text-slate-600 leading-tight whitespace-nowrap">{label}</span>
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

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Loading dashboard…</div>
    </div>
  )
  if (!data) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Tournament not found.</div>
    </div>
  )

  const { tournament: t, games, staff, registrations: reg, financials: fin } = data

  const dateStr = t.startDate
    ? (t.endDate && t.endDate !== t.startDate ? `${t.startDate} – ${t.endDate}` : t.startDate)
    : (() => { try { return JSON.parse(t.dates || '[]').join(' · ') } catch { return '' } })()

  const revenue = reg.invoiced + fin.otherIncome
  const received = reg.received + fin.otherIncome
  const expense = staff.totalStaffExpense + fin.otherExpenses
  const grossProfit = revenue - expense
  const netCash = reg.received + fin.otherIncome - staff.totalStaffPaid - fin.otherExpenses
  const margin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0
  const expensePct = revenue > 0 ? Math.min(100, Math.round((expense / revenue) * 100)) : 0
  const collectionPct = reg.invoiced > 0 ? Math.round((reg.received / reg.invoiced) * 100) : 0
  const assignPct = games.active > 0 ? Math.round((games.assigned / (games.active * 2)) * 100) : 0
  const topDivisions = Object.entries(reg.byDivision).sort((a, b) => b[1] - a[1])
  const showFinancials = reg.invoiced > 0 || staff.totalStaffExpense > 0 || fin.otherIncome > 0 || fin.otherExpenses > 0

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {t.logoUrl && (
              <img src={t.logoUrl} alt="logo" className="h-14 w-14 object-contain rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
            )}
            <div>
              <div className="text-xs text-slate-400 mb-0.5">
                <Link href="/" className="hover:text-teal-400 transition-colors">Tournaments</Link>
                <span className="mx-1 opacity-40">/</span>
              </div>
              <h1 className="text-xl font-bold text-white leading-tight">{t.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-300 flex-wrap">
                {t.sport && <span className="bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full font-medium">{t.sport}</span>}
                {dateStr && <span>📅 {dateStr}</span>}
                {t.location && <span className="opacity-75">📍 {t.location}</span>}
              </div>
            </div>
          </div>
          <Link href={`/tournaments/${id}`} className="flex-shrink-0 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            📅 Open Schedule
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-7 space-y-8">

        {/* Quick Access */}
        <section>
          <SectionTitle>Quick Access</SectionTitle>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <NavTile href={`/tournaments/${id}`}                      icon="📅" label="Schedule"    accent="hover:bg-blue-50 hover:border-blue-200" />
            <NavTile href={`/tournaments/${id}/registrations`}        icon="📋" label="Team Reg"   accent="hover:bg-violet-50 hover:border-violet-200" />
            <NavTile href={`/tournaments/${id}/player-registrations`} icon="📄" label="Players"    accent="hover:bg-teal-50 hover:border-teal-200" />
            <NavTile href={`/tournaments/${id}/roster`}               icon="👥" label="Staff"      accent="hover:bg-sky-50 hover:border-sky-200" />
            <NavTile href={`/tournaments/${id}/pay-summary`}          icon="💰" label="Pay"        accent="hover:bg-amber-50 hover:border-amber-200" />
            <NavTile href={`/tournaments/${id}/financials`}           icon="📊" label="Financials" accent="hover:bg-emerald-50 hover:border-emerald-200" />
            <NavTile href={`/tournaments/${id}/settings`}             icon="⚙️" label="Settings"   accent="hover:bg-slate-100 hover:border-slate-300" />
            <NavTile href={`/tournaments/${id}/public`}               icon="🌐" label="Public"     accent="hover:bg-rose-50 hover:border-rose-200" />
            <NavTile href={`/tournaments/${id}/staff-view`}           icon="👤" label="Staff View" accent="hover:bg-slate-100 hover:border-slate-300" />
            <NavTile href={`/tournaments/${id}/scores`}               icon="🎯" label="Scores"     accent="hover:bg-blue-50 hover:border-blue-200" />
            <NavTile href={`/tournaments/${id}/assignments`}          icon="📌" label="Assignments" accent="hover:bg-indigo-50 hover:border-indigo-200" />
            <NavTile href={`/tournaments/${id}/builder`}              icon="🏗"  label="Builder"    accent="hover:bg-indigo-50 hover:border-indigo-200" />
          </div>
        </section>

        {/* Top Info Row */}
        {reg.clubs === 0 ? (
          <Card className="p-10 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-500 text-sm mb-4">No team registrations yet.</p>
            <Link href={`/tournaments/${id}/register`} target="_blank"
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              Share Registration Form →
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Registration Overview */}
            <Card>
              <CardHeader icon="📋" title="Registration Overview" />
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <BigStat value={reg.clubs} label="Clubs Registered" valueClass="text-violet-600" />
                <BigStat value={reg.teams} label="Teams Registered" valueClass="text-blue-600" />
              </div>
              {Object.keys(reg.byMethod).length > 0 && (
                <div className="px-5 pb-4 flex flex-wrap gap-1.5">
                  {Object.entries(reg.byMethod).map(([method, count]) => (
                    <span key={method} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {payLabel(method)}: <strong className="text-slate-700">{count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Financial Overview */}
            <Card>
              <CardHeader icon="💵" title="Financial Overview" />
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Invoiced</span>
                  <span className="text-sm font-bold text-slate-700">{fmt(reg.invoiced)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Received</span>
                  <span className="text-sm font-bold text-emerald-600">{fmt(reg.received)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Balance Due</span>
                  <span className={`text-sm font-bold ${reg.balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(reg.balance)}</span>
                </div>
                {reg.invoiced > 0 && (
                  <div className="pt-1">
                    <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                      <span>Collection progress</span>
                      <span className="font-semibold text-teal-600">{collectionPct}%</span>
                    </div>
                    <ProgressBar pct={collectionPct} color="bg-teal-500" />
                  </div>
                )}
              </div>
            </Card>

            {/* Logistics */}
            <Card>
              <CardHeader icon="🏨" title="Logistics" />
              <div className="px-5 py-4 grid grid-cols-2 gap-4">
                <div>
                  <BigStat
                    value={`${reg.paidInFull}/${reg.teams}`}
                    label="Paid in Full"
                    sub={reg.outstanding > 0 ? `${reg.outstanding} outstanding` : 'All paid!'}
                    valueClass="text-emerald-600"
                  />
                  {reg.teams > 0 && (
                    <div className="mt-2">
                      <ProgressBar pct={Math.round((reg.paidInFull / reg.teams) * 100)} color="bg-emerald-500" />
                    </div>
                  )}
                </div>
                {(reg.hotelYes + reg.hotelMaybe) > 0 ? (
                  <BigStat
                    value={reg.hotelYes}
                    label="Hotel Requests"
                    sub={reg.hotelMaybe > 0 ? `${reg.hotelMaybe} maybe` : undefined}
                    valueClass="text-amber-600"
                  />
                ) : (
                  <div className="flex flex-col pt-1">
                    <span className="text-slate-200 text-2xl">🏨</span>
                    <span className="text-xs text-slate-400 mt-1">No hotel requests</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Division Table + Schedule & Staff */}
        {reg.clubs > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">

            {topDivisions.length > 0 && (
              <Card className="sm:col-span-2">
                <CardHeader icon="🏆" title="Teams by Division" />
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Division</th>
                      <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-2.5">Teams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDivisions.map(([div, count], i) => (
                      <tr key={div} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="px-5 py-2.5 text-slate-700 font-medium">{div}</td>
                        <td className="px-5 py-2.5 text-right font-bold text-slate-900">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            <Card className="sm:col-span-3">
              <CardHeader icon="📅" title="Schedule & Staff" />
              <div className="px-5 py-4 grid grid-cols-2 gap-6">
                <BigStat value={games.active}    label="Total Games"      sub={games.canceled > 0 ? `${games.canceled} canceled` : undefined} valueClass="text-sky-600" />
                <BigStat value={games.divisions} label="Divisions"        valueClass="text-slate-700" />
                <BigStat value={games.assigned}  label="Assignments"      sub={`~${assignPct}% filled`} valueClass="text-blue-600" />
                <BigStat value={staff.onRoster}  label="Staff on Roster"  valueClass="text-emerald-600" />
              </div>
            </Card>
          </div>
        )}

        {/* Financial Health */}
        {showFinancials && (
          <section>
            <SectionTitle>Financial Health</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

              {/* P&L Summary */}
              <Card>
                <CardHeader icon="📈" title="Profit & Loss Summary" />
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Total Revenue</div>
                    <div className="text-3xl font-extrabold text-slate-900">{fmt(revenue)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmt(received)} collected</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Total Expenses</div>
                    <div className="text-3xl font-extrabold text-red-500">{fmt(expense)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{fmt(staff.totalStaffPaid)} paid out</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Gross Profit</div>
                    <div className={`text-3xl font-extrabold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(grossProfit)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Net Cash Position</div>
                    <div className={`text-2xl font-bold ${netCash >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netCash)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">collected − paid out</div>
                  </div>
                </div>
              </Card>

              {/* Revenue Detail */}
              <Card>
                <CardHeader icon="💚" title="Revenue" />
                <div className="px-5 divide-y divide-slate-50">
                  <DetailRow label={`Registration invoices`} value={fmt(reg.invoiced)} />
                  {fin.otherIncome > 0 && <DetailRow label="Other income" value={fmt(fin.otherIncome)} />}
                  <DetailRow label="Total Revenue" value={fmt(revenue)} valueClass="text-slate-900 font-bold" />
                  <DetailRow label="Collected so far" value={fmt(reg.received)} valueClass="text-emerald-600" />
                  <DetailRow label="Balance due" value={fmt(reg.balance)} valueClass={reg.balance > 0 ? 'text-amber-600' : 'text-slate-400'} />
                </div>
              </Card>

              {/* Expense Detail + margin */}
              <Card>
                <CardHeader icon="🔴" title="Expenses" />
                <div className="px-5 divide-y divide-slate-50">
                  <DetailRow label={`Referee pay (${staff.refCount} assignments)`} value={fmt(staff.refPayTotal)} valueClass="text-red-500" />
                  {staff.hourlyPayTotal > 0 && <DetailRow label="Hourly staff pay" value={fmt(staff.hourlyPayTotal)} valueClass="text-red-500" />}
                  <DetailRow
                    label={`Scorekeeper pay (${staff.skCount} assignments)`}
                    value={fmt(Math.max(0, staff.totalStaffExpense - staff.refPayTotal - staff.hourlyPayTotal))}
                    valueClass="text-red-500"
                  />
                  {fin.otherExpenses > 0 && <DetailRow label="Other expenses" value={fmt(fin.otherExpenses)} valueClass="text-red-500" />}
                  <DetailRow label="Total Expenses" value={fmt(expense)} valueClass="text-red-600 font-bold" />
                  <DetailRow
                    label="Staff owed (unpaid)"
                    value={fmt(Math.max(0, staff.totalStaffExpense - staff.totalStaffPaid))}
                    valueClass={staff.totalStaffExpense - staff.totalStaffPaid > 0 ? 'text-amber-600' : 'text-slate-400'}
                  />
                </div>
                {revenue > 0 && (
                  <div className="px-5 py-4 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">Gross Profit</span>
                      <span className={`text-sm font-extrabold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(grossProfit)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Margin ({margin}%)</span>
                      <span>{fmt(grossProfit)} / {fmt(revenue)}</span>
                    </div>
                    <ProgressBar pct={Math.max(0, margin)} color={margin >= 50 ? 'bg-emerald-500' : margin >= 25 ? 'bg-amber-400' : 'bg-red-400'} />
                    <div className="flex justify-between text-xs text-slate-400 mt-2 mb-1">
                      <span>Expenses as % of revenue</span>
                      <span>{expensePct}%</span>
                    </div>
                    <ProgressBar pct={expensePct} color={expensePct <= 40 ? 'bg-teal-400' : expensePct <= 65 ? 'bg-amber-400' : 'bg-red-400'} />
                  </div>
                )}
              </Card>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
