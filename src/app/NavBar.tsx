'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { useOrg } from '@/lib/org-context'
import { isStaffThemeRoute } from './ThemeShell'

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
  scheduler:      'bg-cyan-100 text-cyan-700',
  coach:          'bg-blue-100 text-blue-700',
  staff:          'bg-teal-100 text-teal-700',
  parent:         'bg-pink-100 text-pink-700',
}

const ROLE_LABELS: Record<string, string> = {
  admin:          'Admin',
  director:       'Tournament Director',
  club_director:  'Club Director',
  assigner:       'Assigner',
  scheduler:      'Scheduler',
  coach:          'Coach',
  staff:          'Staff',
  parent:         'Parent',
}

export default function NavBar() {
  const pathname = usePathname()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [menuOpen, setMenuOpen] = useState(false)   // phone hamburger menu
  const [dark, setDark] = useState(false)           // mirrors <ThemeShell>'s preference
  const org = useOrg()
  const { data: session } = useSession()
  const { effectiveRole, isPreview, setPreviewRole } = useRole()

  const realRole = session?.user?.role ?? 'staff'
  const role = effectiveRole

  const roleColor = ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'
  const isAdmin = realRole === 'admin'
  const hasOrg = !!org?.id

  useEffect(() => {
    function fetchTournaments() {
      const previewOrg = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
      const previewOrgId = previewOrg ? decodeURIComponent(previewOrg[1]) : null
      const url = isAdmin && previewOrgId
        ? `/api/tournaments?viewOrgId=${previewOrgId}`
        : '/api/tournaments'
      fetch(url)
        .then(r => r.json())
        .then((data: Tournament[]) => Array.isArray(data) ? setTournaments(data) : [])
        .catch(() => {})
    }

    fetchTournaments()
    window.addEventListener('preview-org-changed', fetchTournaments)
    return () => window.removeEventListener('preview-org-changed', fetchTournaments)
  }, [isAdmin])

  // Close the phone menu whenever the route changes
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Light/Dark lives in <ThemeShell> (localStorage + body class); the phone menu
  // flips the same key and both sides sync over a 'gd-theme' window event.
  useEffect(() => {
    try { setDark(localStorage.getItem('gd-staff-theme') === 'dark') } catch {}
    const onTheme = (e: Event) => setDark(!!(e as CustomEvent).detail?.dark)
    window.addEventListener('gd-theme', onTheme)
    return () => window.removeEventListener('gd-theme', onTheme)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    try { localStorage.setItem('gd-staff-theme', next ? 'dark' : 'light') } catch {}
    window.dispatchEvent(new CustomEvent('gd-theme', { detail: { dark: next } }))
  }

  // Admin pages use SuperAdminBar as sole header
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/o/')) return null
  // Public pay-by-link pages present as the tournament org (Sunshine Events Group), not Whistle Ready.
  if (pathname?.startsWith('/pay')) return null

  // The public marketing landing and the /find look-up have their own header.
  if (!session && (pathname === '/' || pathname === '/find')) return null

  return (
    <div className="sticky top-0 z-40">
      {/* Preview banner */}
      {isPreview && (
        <div className="bg-amber-400 text-amber-900 text-xs font-semibold px-4 py-1.5 flex items-center justify-between">
          <span>👁 Previewing as <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong> — this is how the app looks to that role</span>
          <button onClick={() => setPreviewRole(null)} className="underline hover:no-underline ml-4">Exit Preview</button>
        </div>
      )}

      <nav className="bg-white border-b border-slate-200 px-3 xl:px-4 py-2 xl:py-2.5 flex items-center gap-2 xl:gap-3 shadow-sm">

        {/* ── LEFT: Brand ── */}
        {hasOrg ? (
          /* Org user: org logo + name on the left */
          <a href="/" className="flex items-center gap-2.5 min-w-0 xl:flex-shrink-0 group">
            {org.logoUrl ? (
              <img
                src={org.logoUrl}
                alt={org.name}
                className="w-9 h-9 object-contain rounded-xl border border-slate-200 bg-white group-hover:border-sky-300 transition-colors"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">{org.name?.charAt(0) ?? '?'}</span>
              </div>
            )}
            <span className="font-bold text-slate-800 text-base tracking-tight leading-tight min-w-0 truncate">
              {org.name}
            </span>
          </a>
        ) : (
          /* Admin / no-org: Whistle Ready brand */
          <a href="/" className="flex items-center gap-2 text-sky-700 font-bold text-lg tracking-tight flex-shrink-0">
            <img src="/whistle-ready-icon.png" alt="" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
            Whistle Ready
          </a>
        )}

        <div className="hidden xl:block h-5 w-px bg-slate-200 flex-shrink-0"/>

        {/* Nav links */}
        <a href="/" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Tournaments</a>

        {/* Tournament quick-links */}
        {tournaments.length > 0 && (
          <>
            <div className="hidden xl:block h-5 w-px bg-slate-200 flex-shrink-0"/>
            <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
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

        {(role === 'admin' || role === 'director' || role === 'assigner' || role === 'scheduler') && (
          <a href="/staff" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Staff</a>
        )}

        {/* Admin-only links */}
        {isAdmin && (
          <>
            <Link href="/admin" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Dashboard</Link>
            <Link href="/admin/users" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Users</Link>
            <Link href="/admin/permissions" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Perms</Link>
            <Link href="/admin/roadmap" className="hidden xl:block text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors flex-shrink-0">Roadmap</Link>
          </>
        )}

        {/* ── RIGHT: Whistle Ready badge (org users only) + auth ── */}
        <div className="ml-auto flex items-center gap-2 xl:gap-3 flex-shrink-0">

          {/* Whistle Ready platform badge — shown to org users */}
          {hasOrg && (
            <div className="hidden xl:flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50">
              <div className="w-4 h-4 bg-sky-600 rounded flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-500 tracking-tight">Whistle Ready</span>
            </div>
          )}

          {session ? (
            <>
              {/* View As dropdown — admin only */}
              {isAdmin && (
                <div className="hidden xl:flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">View as:</span>
                  <select
                    value={isPreview ? role : ''}
                    onChange={e => setPreviewRole(e.target.value || null)}
                    className={`text-xs font-semibold px-2 py-1 rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${isPreview ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                  >
                    <option value="">Admin (you)</option>
                    {['director','club_director','assigner','scheduler','coach','staff','parent'].map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                    ))}
                  </select>
                </div>
              )}

              <span className={`hidden xl:inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
                {ROLE_LABELS[role] ?? role}
              </span>

              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                {session.user?.image ? (
                  <img src={session.user.image} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center border border-slate-200">
                    {(session.user?.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                )}
                <span className="text-sm text-slate-600 hidden xl:block">{session.user?.name}</span>
              </Link>

              <button onClick={() => signOut({ callbackUrl: '/login' })}
                className="hidden xl:inline-block text-sm text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors">
                Sign out
              </button>

              {/* Below 1280px (phones AND tablets — the full admin bar needs ~1,250px): hamburger replaces the links, role badge, View-as and Sign out */}
              <button type="button" onClick={() => setMenuOpen(o => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
                className="xl:hidden w-9 h-9 rounded-lg border border-slate-200 text-slate-600 flex items-center justify-center">
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-sky-600 transition-colors">Sign in</Link>
              <Link href="/register" className="text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg transition-colors">Register</Link>
            </>
          )}
        </div>
      </nav>

      {/* Compact menu — everything the desktop bar shows, stacked under the bar */}
      {menuOpen && session && (
        <div className="xl:hidden">
          <div className="absolute inset-x-0 top-full h-screen bg-black/30" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 top-full bg-white border-b border-slate-200 shadow-lg max-h-[80vh] overflow-y-auto">
            <div className="px-3 divide-y divide-slate-100">

              <Link href="/profile" className="flex items-center gap-3 py-3">
                {session.user?.image ? (
                  <img src={session.user.image} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center border border-slate-200 flex-shrink-0">
                    {(session.user?.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{session.user?.name}</div>
                  <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>{ROLE_LABELS[role] ?? role}</span>
                </div>
                <span className="text-sm font-medium text-sky-600">Profile</span>
              </Link>

              <div className="py-1.5">
                <a href="/" className={MOBILE_LINK}>Tournaments</a>
                {tournaments.slice(0, 4).map(t => (
                  <Link key={t.id} href={`/tournaments/${t.id}/dashboard`} className={MOBILE_LINK}>
                    {t.logoUrl ? (
                      <img src={t.logoUrl} alt="" className="h-7 w-7 object-contain rounded-md border border-slate-200 bg-slate-50 flex-shrink-0" />
                    ) : (
                      <div className="h-7 w-7 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">{t.name.charAt(0)}</div>
                    )}
                    <span className="truncate">{t.name}</span>
                  </Link>
                ))}
                {(role === 'admin' || role === 'director' || role === 'assigner' || role === 'scheduler') && (
                  <a href="/staff" className={MOBILE_LINK}>Staff</a>
                )}
                {isAdmin && (
                  <>
                    <Link href="/admin" className={MOBILE_LINK}>Dashboard</Link>
                    <Link href="/admin/users" className={MOBILE_LINK}>Users</Link>
                    <Link href="/admin/permissions" className={MOBILE_LINK}>Perms</Link>
                    <Link href="/admin/roadmap" className={MOBILE_LINK}>Roadmap</Link>
                  </>
                )}
              </div>

              {isAdmin && (
                <div className="py-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">View as</span>
                  <select
                    value={isPreview ? role : ''}
                    onChange={e => setPreviewRole(e.target.value || null)}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-400 ${isPreview ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                  >
                    <option value="">Admin (you)</option>
                    {['director','club_director','assigner','scheduler','coach','staff','parent'].map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                    ))}
                  </select>
                </div>
              )}

              {isStaffThemeRoute(pathname || '') && (
                <div className="py-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Appearance</span>
                  <button type="button" onClick={toggleTheme}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">
                    {dark ? <Sun size={15} /> : <Moon size={15} />}
                    {dark ? 'Switch to light' : 'Switch to dark'}
                  </button>
                </div>
              )}

              <div className="py-3">
                <button onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full text-sm font-medium text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-300 px-3 py-2 rounded-lg transition-colors">
                  Sign out
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MOBILE_LINK = 'flex items-center gap-3 py-2.5 text-[15px] font-medium text-slate-700 hover:text-sky-600'
