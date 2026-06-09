'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  tournamentCount: number
  workerCount: number
  registrationCount: number
  teamCount: number
  totalInvoiced: number
  totalReceived: number
  recentTournaments: { id: string; name: string; sport: string; startDate: string; endDate: string }[]
  recentRegs: { id: string; clubName: string; clubContact: string; numTeams: number; invoiceAmount: number; discountAmount: number; paid: number; createdAt: string; tournament: { name: string } }[]
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const balance = stats ? stats.totalInvoiced - stats.totalReceived : 0

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Sunshine Events Group — overview</p>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/roadmap" className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
              Roadmap
            </Link>
            <Link href="/admin/users" className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
              Users
            </Link>
            <Link href="/admin/org-settings" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              Org Settings
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading stats…</div>
        ) : !stats ? (
          <div className="text-center py-20 text-red-500">Failed to load stats.</div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <StatCard label="Tournaments" value={stats.tournamentCount} color="text-blue-600" />
              <StatCard label="Staff Workers" value={stats.workerCount} color="text-purple-600" />
              <StatCard label="Club Regs" value={stats.registrationCount} color="text-teal-600" />
              <StatCard label="Teams" value={stats.teamCount} color="text-green-600" />
              <StatCard label="Invoiced" value={fmt(stats.totalInvoiced)} color="text-gray-800" />
              <StatCard
                label="Balance Due"
                value={fmt(balance)}
                sub={fmt(stats.totalReceived) + ' received'}
                color={balance > 0 ? 'text-orange-600' : 'text-green-600'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Recent Tournaments */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">Recent Tournaments</h2>
                  <Link href="/tournaments" className="text-xs text-blue-600 hover:underline">View all →</Link>
                </div>
                <div className="divide-y divide-gray-100">
                  {stats.recentTournaments.length === 0 ? (
                    <p className="p-5 text-sm text-gray-400 italic">No tournaments yet.</p>
                  ) : stats.recentTournaments.map(t => (
                    <Link key={t.id} href={'/tournaments/' + t.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.sport || 'Lacrosse'}</p>
                      </div>
                      <span className="text-xs text-gray-500">{t.startDate || '—'}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Recent Registrations */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">Recent Club Registrations</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {stats.recentRegs.length === 0 ? (
                    <p className="p-5 text-sm text-gray-400 italic">No registrations yet.</p>
                  ) : stats.recentRegs.map(r => {
                    const net = r.invoiceAmount - r.discountAmount
                    const bal = net - r.paid
                    return (
                      <div key={r.id} className="flex items-center justify-between px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.clubName}</p>
                          <p className="text-xs text-gray-400 truncate">{r.tournament.name} · {r.numTeams} team{r.numTeams !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-700">{fmt(net)}</p>
                          <p className={`text-xs ${bal > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                            {bal > 0 ? fmt(bal) + ' due' : 'Paid'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Quick Links */}
            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Quick Links</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { href: '/admin/orgs', label: 'Organizations' },
                  { href: '/admin/roadmap', label: 'Roadmap' },
                  { href: '/admin/users', label: 'Users' },
                  { href: '/admin/org-settings', label: 'Org Settings' },
                  { href: '/admin/payment-providers', label: 'Payment Providers' },
                  { href: '/admin/tourneymachine-guide', label: 'TM Migration Guide' },
                  { href: '/staff-pool', label: 'Staff Pool' },
                  { href: '/tournaments', label: 'All Tournaments' },
                ].map(l => (
                  <Link key={l.href} href={l.href} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
