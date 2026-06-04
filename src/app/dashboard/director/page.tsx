'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Tournament {
  id: string; name: string; startDate: string; endDate: string
  location: string; logoUrl: string; sport: string
  _count: { games: number }
}

export default function DirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    fetch('/api/tournaments').then(r => r.json()).then(d => { setTournaments(d); setLoading(false) })
  }, [status])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {session?.user?.name} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Director Dashboard — select a tournament to manage</p>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No tournaments found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map(t => (
            <Link key={t.id} href={`/tournaments/${t.id}/dashboard`}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition-all group">
              <div className="flex items-center gap-3 mb-3">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="logo" className="w-12 h-12 object-contain rounded-xl border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center">{t.name[0]}</div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 group-hover:text-purple-700 truncate">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.location || 'No location set'}</div>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>📅 {t.startDate || 'TBD'}</span>
                <span>🎮 {t._count.games} games</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Schedule','Roster','Registrations','Financials'].map(label => (
                  <span key={label} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{label}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
