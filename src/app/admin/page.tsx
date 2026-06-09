'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface OrgRow {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  subscriptionTier: string
  subscriptionStatus: string
  createdAt: string
  tournamentCount: number
  workerCount: number
  userCount: number
}

interface RecentTournament {
  id: string
  name: string
  sport: string
  startDate: string
  orgId: string | null
  orgName: string | null
  orgLogoUrl: string | null
}

interface Stats {
  orgCount: number
  tournamentTotal: number
  workerTotal: number
  userTotal: number
  orgs: OrgRow[]
  recentTournaments: RecentTournament[]
}

const TIER_COLORS: Record<string, string> = {
  starter:      'bg-slate-100 text-slate-600',
  pro:          'bg-blue-100 text-blue-700',
  enterprise:   'bg-purple-100 text-purple-700',
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trial:     'bg-amber-100 text-amber-700',
  inactive:  'bg-red-100 text-red-600',
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

async function switchOrg(orgId: string) {
  await fetch('/api/admin/preview-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId }),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('preview-org-changed'))
}

export default function PlatformDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') { router.push('/'); return }
  }, [session, status, router])

  useEffect(() => {
    if ((session?.user as any)?.role !== 'admin') return
    fetch('/api/admin/platform-stats')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.orgs)) { setStats(d); } setLoading(false) })
      .catch(() => setLoading(false))
  }, [session])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">GameDay Staff</h1>
              <p className="text-xs text-slate-500">Platform Dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/orgs" className="text-sm bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition-colors">
              + New Org
            </Link>
            <Link href="/admin/users" className="text-sm bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition-colors">
              Users
            </Link>
            <Link href="/admin/roadmap" className="text-sm bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              Roadmap
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-slate-400 text-sm">Loading platform data…</div>
          </div>
        ) : !stats ? (
          <div className="text-center py-20 text-red-500 text-sm">Failed to load stats.</div>
        ) : (
          <>
            {/* Platform Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard label="Organizations" value={stats.orgCount} icon="🏢" color="bg-sky-50" />
              <StatCard label="Tournaments" value={stats.tournamentTotal} icon="🏆" color="bg-purple-50" />
              <StatCard label="Staff Members" value={stats.workerTotal} icon="👥" color="bg-teal-50" />
              <StatCard label="Users" value={stats.userTotal} icon="🔑" color="bg-amber-50" />
            </div>

            {/* Org Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 mb-6">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">Customer Organizations</h2>
                <Link href="/admin/orgs" className="text-xs text-sky-600 hover:underline font-medium">Manage all →</Link>
              </div>

              {(stats.orgs ?? []).length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-400 text-sm">No organizations yet. <Link href="/admin/orgs" className="text-sky-600 hover:underline">Create one →</Link></div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(stats.orgs ?? []).map(org => (
                    <div key={org.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group">
                      {/* Logo */}
                      <div className="flex-shrink-0">
                        {org.logoUrl ? (
                          <img src={org.logoUrl} alt={org.name} className="w-10 h-10 object-contain rounded-xl border border-slate-200 bg-white" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm">
                            {org.name?.charAt(0) ?? '?'}
                          </div>
                        )}
                      </div>

                      {/* Name + tier */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{org.name}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${TIER_COLORS[org.subscriptionTier] ?? TIER_COLORS.starter}`}>
                            {org.subscriptionTier}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[org.subscriptionStatus] ?? STATUS_COLORS.inactive}`}>
                            {org.subscriptionStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{org.slug}</p>
                      </div>

                      {/* Counts */}
                      <div className="hidden sm:flex items-center gap-6 text-center flex-shrink-0">
                        <div>
                          <p className="text-base font-bold text-slate-700">{org.tournamentCount}</p>
                          <p className="text-[10px] text-slate-400">Tournaments</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-700">{org.workerCount}</p>
                          <p className="text-[10px] text-slate-400">Staff</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-700">{org.userCount}</p>
                          <p className="text-[10px] text-slate-400">Users</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={async () => { await switchOrg(org.id); router.push('/') }}
                          className="text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          View Portal →
                        </button>
                        <Link
                          href={`/admin/orgs/${org.id}`}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Tournaments */}
            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">Recent Tournaments</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {(stats.recentTournaments ?? []).length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center italic">No tournaments yet.</p>
                ) : (stats.recentTournaments ?? []).map(t => (
                  <Link key={t.id} href={`/tournaments/${t.id}/dashboard`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors">
                    {/* Org logo */}
                    <div className="flex-shrink-0">
                      {t.orgLogoUrl ? (
                        <img src={t.orgLogoUrl} alt={t.orgName ?? ''} className="w-8 h-8 object-contain rounded-lg border border-slate-200 bg-white" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                          {(t.orgName ?? '?').charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.orgName ?? 'No org'} · {t.sport}</p>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">{t.startDate || '—'}</span>
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
