'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useRole } from '@/lib/role-context'

interface Tournament {
  id: string
  name: string
  logoUrl: string
}

const ROLE_COLORS: Record<string, string> = {
  admin:          'bg-red-100 text-red-700',
  director:       'bg-purple-100 text-purple-700',
  club_director:  'bg-violet-100 text-violet-700',
  assigner:       'bg-indigo-100 text-indigo-700',
  coach:          'bg-blue-100 text-blue-700',
  ref:            'bg-green-100 text-green-700',
  scorekeeper:    'bg-yellow-100 text-yellow-700',
  parent:         'bg-pink-100 text-pink-700',
  viewer:         'bg-gray-100 text-gray-600',
}

const ROLE_LABELS: Record<string, string> = {
  admin:          'Admin',
  director:       'Tournament Director',
  club_director:  'Club Director',
  assigner:       'Assigner',
  coach:          'Coach',
  ref:            'Referee',
  scorekeeper:    'Scorekeeper',
  parent:         'Parent',
  viewer:         'Viewer',
}

export default function NavBar() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [org, setOrg] = useState<any>(null)
  const { data: session } = useSession()
  const { effectiveRole, isPreview, setPreviewRole } = useRole()

  useEffect(() => {
    fetch('/api/tournaments')
      .then(r => r.json())
      .then((data: Tournament[]) => setTournaments(data))
      .catch(() => {})
    fetch('/api/admin/org')
      .then(r => r.json())
      .then(d => { if (d) setOrg(d) })
      .catch(() => {})
  }, [])

  const realRole = session?.user?.role ?? 'viewer'
  const role = effectiveRole
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.viewer

  return (
    <div className="sticky top-0 z-40">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-amber-400 text-amber-900 text-xs font-semibold px-4 py-1.5 flex items-center justify-between">
          <span>👁 Previewing as <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong> — this is how the app looks to that role</span>
          <button onClick={() => setPreviewRole(null)} className="underline hover:no-underline ml-4">Exit Preview</button>
        </div>
      )}
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 shadow-sm">
      {/* Brand */}
      <a href="/" className="flex items-center gap-2.5 text-sky-700 font-bold text-lg tracking-tight flex-shrink-0">
        {org?.logoUrl ? (
          <img src={org.logoUrl} alt={org.name || 'Logo'} className="w-7 h-7 object-contain rounded-lg border border-slate-200 bg-white" />
        ) : (
          <div className="w-7 h-7 bg-sky-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
        GameDay Staff
      </a>

      <div className="h-5 w-px bg-slate-200 flex-shrink-0"/>

      {/* Nav links */}
      <a href="/" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Tournaments</a>
      {(role === 'admin' || role === 'director' || role === 'assigner') && (
        <a href="/staff" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Staff Pool</a>
      )}
      {realRole === 'admin' && (
        <>
          <Link href="/admin/users" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">👥 Users</Link>
          <Link href="/admin/permissions" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">🔐 Permissions</Link>
          <Link href="/admin/roadmap" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">🗺 Roadmap</Link>
          <Link href="/admin/org-settings" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">🏢 Org Settings</Link>
          <Link href="/admin/payment-providers" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">💳 Payment Providers</Link>
        </>
      )}

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
                  <img src={t.logoUrl} alt={t.name}
                    className="h-8 w-8 object-contain rounded-lg border border-slate-200 bg-slate-50 group-hover:border-sky-400 group-hover:shadow-sm transition-all" />
                ) : (
                  <div className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 group-hover:border-sky-400 transition-all">
                    {t.name.charAt(0)}
                  </div>
                )}
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t.name}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Auth section */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        {session ? (
          <>
            {/* View As dropdown — admin only */}
            {realRole === 'admin' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 hidden sm:block">View as:</span>
                <select
                  value={isPreview ? role : ''}
                  onChange={e => setPreviewRole(e.target.value || null)}
                  className={`text-xs font-semibold px-2 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${isPreview ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  <option value="">Admin (you)</option>
                  {['director','club_director','assigner','coach','ref','scorekeeper','parent','viewer'].map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
              </div>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
            <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {session.user?.image ? (
                <img src={session.user.image} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-slate-200" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center border border-slate-200">
                  {(session.user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
                </div>
              )}
              <span className="text-sm text-slate-600 hidden sm:block">{session.user?.name}</span>
            </Link>
            <button onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors">
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors">Sign In</Link>
            <Link href="/register" className="text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg transition-colors">Register</Link>
          </>
        )}
      </div>
    </nav>
    </div>
  )
}
