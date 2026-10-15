'use client'

import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Landing from './Landing'
import TournamentsDashboard from './TournamentsDashboard'

export default function HomeClient() {
  const { status } = useSession()

  // Logged-out visitors see the public marketing landing at the domain root.
  if (status === 'unauthenticated') return <Landing />

  // Brief loading state while the session resolves.
  if (status === 'loading') {
    return <div className="text-slate-400 text-center py-24">Loading…</div>
  }

  // Authenticated (admin/director) — the tournaments dashboard, unchanged.
  return <Suspense fallback={null}><TournamentsDashboard /></Suspense>
}
