'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

interface DashData {
  tournament: { id: string; name: string; sport: string; startDate: string; endDate: string; location: string; logoUrl: string; dates: string }
  games: { total: number; active: number; canceled: number; assigned: number; divisions: number }
  staff: { onRoster: number; refPayTotal: number; hourlyPayTotal: number; totalStaffExpense: number; totalStaffPaid: number; refCount: number; skCount: number }
  financials: { otherIncome: number; otherExpenses: number; txByCategory: Record<string, number> }
  registrations: { clubs: number; teams: number; invoiced: number; received: number; balance: number; paidInFull: number; outstanding: number; byMethod: Record<string, number>; byDivision: Record<string, number>; hotelYes: number; hotelMaybe: number }
  playerCount: number
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShort = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const payLabel = (m: string) => m === 'credit_card' ? 'Credit Card' : m === 'zelle' ? 'Zelle' : 'Check'

// ── Primitives ────────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-slate-100">
      {children}
    </div>
  )
}

function CardIcon({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-400 text-sm leading-none">{children}</span>
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-slate-600 leading-none">{children}</span>
}

function Bar({ pct, color = 'bg-teal-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
    </div>
  )
  if (!data) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Tournament not found.</p>
    </div>
  )

  const { tournament: t, games, staff, registrations: reg, financials: fin } = data

  const dateStr = t.startDate
    ? (t.endDate && t.endDate !== t.startDate ? `${t.startDate} – ${t.endDate}` : t.startDate)
    : (() => { try { return JSON.parse(t.dates || '[]').join(' · ') } catch { return '' } })()

  const revenue  = reg.invoiced + fin.otherIncome
  const received = reg.received + fin.otherIncome
  const expense  = staff.totalStaffExpense + fin.otherExpenses
  const grossProfit = revenue - expense
  const netCash  = reg.received + fin.otherIncome - staff.totalStaffPaid - fin.otherExpenses
  const margin   = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0
  const expPct   = revenue > 0 ? Math.min(100, Math.round((expense / revenue) * 100)) : 0
  const collectPct = reg.invoiced > 0 ? Math.round((reg.received / reg.invoiced) * 100) : 0
  const assignPct  = games.active > 0 ? Math.round((games.assigned / (games.active * 2)) * 100) : 0
  const topDiv   = Object.entries(reg.byDivision).sort((a, b) => b[1] - a[1])
  const showFin  = revenue > 0 || expense > 0
  const skPay    = Math.max(0, staff.totalStaffExpense - staff.refPayTotal - staff.hourlyPayTotal)

  // Revenue detail rows
  const revRows: [string, number][] = [
    [`Registration invoices`, reg.invoiced],
    ...(fin.otherIncome > 0 ? [['Other income', fin.otherIncome] as [string, number]] : []),
  ]
  // Expense detail rows
  const expRows: [string, number][] = [
    [`Referee pay`, staff.refPayTotal],
    [`Scorekeeper pay`, skPay],
    ...(staff.hourlyPayTotal > 0 ? [['Hourly staff', staff.hourlyPayTotal] as [string, number]] : []),
    ...(fin.otherExpenses > 0 ? [['Other expenses', fin.otherExpenses] as [string, number]] : []),
  ]
  const maxDetailRows = Math.max(revRows.length, expRows.length)

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-[#0f1f3d]">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {t.logoUrl
              ? <img src={t.logoUrl} alt="logo" className="h-12 w-12 rounded-xl object-contain border border-white/10 bg-white/5 flex-shrink-0" />
              : <div className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center text-white/40 text-xl">🏆</div>
            }
            <div>
              <div className="text-[11px] text-slate-400 mb-0.5 leading-none">
                <Link href="/" className="hover:text-teal-400 transition-colors">Tournaments</Link>
                <span className="mx-1 opacity-40">/</span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">{t.name}</h1>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-300 leading-none flex-wrap">
                {t.sport && <span className="font-semibold text-slate-200">{t.sport}</span>}
                {t.sport && dateStr && <span className="text-slate-500">|</span>}
                {dateStr && <span>{dateStr}</span>}
                {t.location && <><span className="text-slate-500">|</span><span className="text-slate-300">{t.location}</span></>}
              </div>
            </div>
          </div>
          <Link href={`/tournaments/${id}`}
            className="flex-shrink-0 flex items-center gap-2 bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            📅 Open Schedule
          </Link>
        </div>

        {/* Quick Access tab bar */}
        <div className="max-w-[1280px] mx-auto px-6 pt-2 pb-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Quick Access</p>
          <div className="flex gap-0 overflow-x-auto">
            {[
              { href: `/tournaments/${id}`,                      icon: '📅', label: 'Schedule'    },
              { href: `/tournaments/${id}/registrations`,        icon: '🏆', label: 'Team Reg'   },
              { href: `/tournaments/${id}/player-registrations`, icon: '👤', label: 'Players'    },
              { href: `/tournaments/${id}/roster`,               icon: '👥', label: 'Staff'      },
              { href: `/tournaments/${id}/pay-summary`,          icon: '💳', label: 'Payments'   },
              { href: `/tournaments/${id}/financials`,           icon: '📊', label: 'Financials' },
              { href: `/tournaments/${id}/settings`,             icon: '⚙️', label: 'Settings'   },
              { href: `/tournaments/${id}/public`,               icon: '🌐', label: 'Public View'},
            ].map(tab => (
              <Link key={tab.href} href={tab.href}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 whitespace-nowrap transition-colors rounded-t-lg border-b-2 border-transparent hover:border-teal-400">
                <span className="text-base leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Dashboard Body ───────────────────────────────────────────────── */}
      <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-4">

        {/* Empty state */}
        {reg.clubs === 0 && (
          <Card className="p-12 text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-slate-500 text-sm mb-4">No registrations yet.</p>
            <Link href={`/tournaments/${id}/register`} target="_blank"
              className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              Share Registration Form →
            </Link>
          </Card>
        )}

        {/* ── Row 1: Registration | Financial | Logistics ────────────────── */}
        {reg.clubs > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Registration Overview */}
            <Card>
              <CardHeader>
                <CardIcon>👤</CardIcon>
                <CardTitle>Registration Overview</CardTitle>
              </CardHeader>
              <div className="px-4 py-4 flex gap-6">
                <div>
                  <div className="text-4xl font-extrabold text-slate-800 leading-none">{reg.clubs}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-1.5">Clubs Registered:</div>
                  {Object.keys(reg.byMethod).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(reg.byMethod).map(([m, c]) => (
                        <span key={m} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{payLabel(m)}: {c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-px bg-slate-100 self-stretch" />
                <div>
                  <div className="text-4xl font-extrabold text-slate-800 leading-none">{reg.teams}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-1.5">Teams Registered:</div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {reg.paidInFull} paid · {reg.outstanding} outstanding
                  </div>
                </div>
              </div>
            </Card>

            {/* Financial Overview */}
            <Card>
              <CardHeader>
                <CardIcon>💰</CardIcon>
                <CardTitle>Financial Overview</CardTitle>
              </CardHeader>
              <div className="px-4 py-4">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Total Invoiced:</div>
                    <div className="text-lg font-extrabold text-slate-800 leading-tight">{fmt(reg.invoiced)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Total Received:</div>
                    <div className="text-lg font-extrabold text-slate-800 leading-tight">{fmt(reg.received)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Balance Due:</div>
                    <div className={`text-lg font-extrabold leading-tight ${reg.balance > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>{fmt(reg.balance)}</div>
                  </div>
                </div>
                {reg.invoiced > 0 && (
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-slate-400">Collection progress</span>
                      <span className="text-[10px] font-semibold text-teal-600">{collectPct}%</span>
                    </div>
                    <Bar pct={collectPct} color="bg-teal-500" />
                  </div>
                )}
              </div>
            </Card>

            {/* Logistics */}
            <Card>
              <CardHeader>
                <CardIcon>🏨</CardIcon>
                <CardTitle>Logistics</CardTitle>
              </CardHeader>
              <div className="px-4 py-4 flex gap-6">
                <div>
                  <div className="text-[11px] text-slate-400 mb-1.5">Paid in Full:</div>
                  <div className="text-4xl font-extrabold text-slate-800 leading-none">{reg.paidInFull}</div>
                  <div className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                    {reg.outstanding > 0 ? `${reg.outstanding} outstanding` : 'All paid!'}
                  </div>
                  {reg.teams > 0 && (
                    <div className="mt-2 w-24">
                      <Bar pct={Math.round((reg.paidInFull / reg.teams) * 100)} color="bg-emerald-500" />
                    </div>
                  )}
                </div>
                {(reg.hotelYes + reg.hotelMaybe) > 0 && (
                  <>
                    <div className="w-px bg-slate-100 self-stretch" />
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1.5">Hotel Requests:</div>
                      <div className="text-4xl font-extrabold text-amber-500 leading-none">{reg.hotelYes}</div>
                      {reg.hotelMaybe > 0 && (
                        <div className="text-[11px] text-slate-400 mt-1.5">{reg.hotelMaybe} maybe</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Row 2: Divisions | Schedule & Staff | P&L | Detailed ──────── */}
        {reg.clubs > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

            {/* Teams by Division */}
            {topDiv.length > 0 && (
              <Card className="md:col-span-3">
                <CardHeader>
                  <CardIcon>👥</CardIcon>
                  <CardTitle>Teams by Division</CardTitle>
                </CardHeader>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[11px] font-semibold text-slate-500 px-4 py-2">Division</th>
                      <th className="text-right text-[11px] font-semibold text-slate-500 px-4 py-2">Count ↕</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDiv.map(([div, count], i) => (
                      <tr key={div}
                        className={
                          i % 4 === 0 ? 'bg-white' :
                          i % 4 === 1 ? 'bg-teal-50/60' :
                          i % 4 === 2 ? 'bg-white' :
                          'bg-orange-50/60'
                        }
                      >
                        <td className="px-4 py-2 text-slate-700 text-xs font-medium truncate max-w-[120px]">{div}</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800 text-xs">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* Schedule & Staff */}
            <Card className="md:col-span-3">
              <CardHeader>
                <CardIcon>📅</CardIcon>
                <CardTitle>Schedule & Staff</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">
                {/* Games */}
                <div className="flex flex-col items-center justify-center py-4 px-3 text-center">
                  <svg className="w-7 h-7 text-slate-300 mb-1.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                  </svg>
                  <div className="text-2xl font-extrabold text-slate-800 leading-none">{games.active}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Total Games</div>
                </div>
                {/* Divisions */}
                <div className="flex flex-col items-center justify-center py-4 px-3 text-center relative">
                  <svg className="w-7 h-7 text-slate-300 mb-1.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                  <span className="absolute top-2 right-2 bg-teal-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">{games.divisions}</span>
                  <div className="text-2xl font-extrabold text-slate-800 leading-none">{games.divisions}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Divisions</div>
                </div>
                {/* Assignments */}
                <div className="flex flex-col items-center justify-center py-4 px-3 text-center">
                  <svg className="w-7 h-7 text-slate-300 mb-1.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <div className="text-2xl font-extrabold text-slate-800 leading-none">{games.assigned}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Assignments</div>
                </div>
                {/* Staff */}
                <div className="flex flex-col items-center justify-center py-4 px-3 text-center">
                  <svg className="w-7 h-7 text-slate-300 mb-1.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21a12.318 12.318 0 01-6.374-1.766z" />
                  </svg>
                  <div className="text-2xl font-extrabold text-slate-800 leading-none">{staff.onRoster}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Staff on Roster</div>
                </div>
              </div>
              {/* Footer: Total Revenue – Expenses */}
              {showFin && (
                <div className="border-t border-slate-100 bg-amber-50 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[11px] text-amber-700 font-medium">Total (Revenue – Expenses)</span>
                  <span className={`text-sm font-extrabold ${grossProfit >= 0 ? 'text-amber-700' : 'text-red-500'}`}>{fmt(grossProfit)}</span>
                </div>
              )}
            </Card>

            {/* P&L Summary */}
            {showFin && (
              <Card className="md:col-span-3">
                <CardHeader>
                  <CardIcon>📈</CardIcon>
                  <CardTitle>Profit & Loss Summary</CardTitle>
                </CardHeader>
                <div className="divide-y divide-slate-50">
                  <div className="px-4 py-3">
                    <div className="text-[11px] text-slate-400 mb-0.5">Total Revenue:</div>
                    <div className="text-2xl font-extrabold text-slate-800">{fmt(revenue)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] text-slate-400 mb-0.5">Total Expenses:</div>
                    <div className="text-2xl font-extrabold text-orange-500">{fmt(expense)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] text-slate-400 mb-0.5">Gross Profit:</div>
                    <div className={`text-2xl font-extrabold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(grossProfit)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] text-slate-400 mb-0.5">Net Cash Position:</div>
                    <div className={`text-2xl font-extrabold ${netCash >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netCash)}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Detailed Performance */}
            {showFin && (
              <Card className="md:col-span-3">
                <CardHeader>
                  <CardIcon>⏱</CardIcon>
                  <CardTitle>Detailed Performance</CardTitle>
                </CardHeader>
                {/* Two-column detail table */}
                <div className="px-4 pt-3 pb-2">
                  <div className="grid grid-cols-2 gap-x-3">
                    {/* Revenue col header */}
                    <div className="grid grid-cols-2 gap-x-1 mb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Revenue</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase text-right">Amount</span>
                    </div>
                    {/* Expense col header */}
                    <div className="grid grid-cols-2 gap-x-1 mb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Expense</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase text-right">Amount</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3">
                    {/* Revenue rows */}
                    <div className="space-y-1">
                      {revRows.map(([label, amount]) => (
                        <div key={label} className="grid grid-cols-2 gap-x-1">
                          <span className="text-[11px] text-slate-600 truncate">{label}</span>
                          <span className="text-[11px] text-slate-700 font-semibold text-right">{fmt(amount)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Expense rows */}
                    <div className="space-y-1">
                      {expRows.map(([label, amount]) => (
                        <div key={label} className="grid grid-cols-2 gap-x-1">
                          <span className="text-[11px] text-slate-600 truncate">{label}</span>
                          <span className="text-[11px] text-red-500 font-semibold text-right">{fmt(amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Gross Profit box */}
                <div className="mx-4 mb-3 mt-2 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
                  <div className="text-[10px] text-teal-600 font-semibold uppercase tracking-wide mb-0.5">Gross Profit (Revenue – Expenses)</div>
                  <div className={`text-2xl font-extrabold leading-tight ${grossProfit >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                    {fmt(grossProfit)}
                  </div>
                  {revenue > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Margin: {margin}% ({fmtShort(grossProfit)} / {fmtShort(revenue)})</span>
                      </div>
                      <Bar pct={Math.max(0, margin)} color={margin >= 40 ? 'bg-teal-500' : margin >= 20 ? 'bg-amber-400' : 'bg-red-400'} />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Expenses as % of Revenue</span>
                        <span className="text-[10px] font-semibold text-slate-500">{expPct}%</span>
                      </div>
                      <Bar pct={expPct} color={expPct <= 45 ? 'bg-teal-400' : expPct <= 65 ? 'bg-amber-400' : 'bg-red-500'} />
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
