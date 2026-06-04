'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string; _count: { games: number } }

export default function AssignerDashboard() {
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
        <p className="text-gray-500 text-sm mt-1">Assigner Dashboard — manage game assignments and staff availability</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tournaments.map(t => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-4">
              {t.logoUrl ? (
                <img src={t.logoUrl} alt="logo" className="w-12 h-12 object-contain rounded-xl border border-gray-100" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-lg flex items-center justify-center">{t.name[0]}</div>
              )}
              <div>
                <div className="font-semibold text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-400">{t.startDate || 'TBD'} · {t._count.games} games</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/tournaments/${t.id}`}
                className="text-center text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl py-2 transition-colors">
                📋 Schedule
              </Link>
              <Link href={`/tournaments/${t.id}/roster`}
                className="text-center text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl py-2 transition-colors">
                👥 Roster
              </Link>
              <Link href={`/tournaments/${t.id}/availability`}
                className="text-center text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl py-2 transition-colors">
                📅 Availability
              </Link>
              <Link href={`/tournaments/${t.id}/pay-summary`}
                className="text-center text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl py-2 transition-colors">
                💰 Pay
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
