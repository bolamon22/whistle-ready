'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Tournament {
  id: string
  name: string
  logoUrl: string
}

export default function NavBar() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then((data: Tournament[]) => setTournaments(data))
      .catch(() => {})
  }, [])

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-40 shadow-sm">
      {/* Brand */}
      <a href="/" className="flex items-center gap-2.5 text-sky-700 font-bold text-lg tracking-tight flex-shrink-0">
        <div className="w-7 h-7 bg-sky-600 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        GameDay Staff
      </a>

      <div className="h-5 w-px bg-slate-200 flex-shrink-0"/>

      {/* Nav links */}
      <a href="/" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Tournaments</a>
      <a href="/staff" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Staff Pool</a>

      {/* Tournament logos */}
      {tournaments.length > 0 && (
        <>
          <div className="h-5 w-px bg-slate-200 flex-shrink-0"/>
          <div className="flex items-center gap-4">
            {tournaments.slice(0, 4).map(t => (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}/dashboard`}
                title={t.name}
                className="flex-shrink-0 group relative"
              >
                {t.logoUrl ? (
                  <img
                    src={t.logoUrl}
                    alt={t.name}
                    className="h-8 w-8 object-contain rounded-lg border border-slate-200 bg-slate-50 group-hover:border-sky-400 group-hover:shadow-sm transition-all"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:border-sky-400 transition-all">
                    {t.name.charAt(0)}
                  </div>
                )}
                {/* Tooltip */}
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t.name}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </nav>
  )
}
