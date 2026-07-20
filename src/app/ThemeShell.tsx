'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Staff dark theme with a per-user Light/Dark toggle (default dark).
// Applies on signed-in routes only; excludes the public tournament page
// (its own toggle) and the login/register pages. Preference persists in
// localStorage. Renders a small floating toggle on staff routes.
export default function ThemeShell() {
  const pathname = usePathname() || ''
  const isPublic = /\/public(\/|$)/.test(pathname) || /^\/claim(\/|$)/.test(pathname) || /^\/tournaments\/[^/]+\/(event|rules|p|today|player-waiver|vendor-request|register|player-register)(\/|$)/.test(pathname)
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isSite = pathname.startsWith('/o/')  // public org website = fixed light theme
  const isStaff = !isPublic && !isAuthPage && !isSite
  const [dark, setDark] = useState(true)

  useEffect(() => {
    try { const s = localStorage.getItem('gd-staff-theme'); if (s) setDark(s === 'dark') } catch {}
  }, [])

  useEffect(() => {
    document.body.classList.toggle('gd-dark', isStaff && dark)
    return () => { document.body.classList.remove('gd-dark') }
  }, [isStaff, dark])

  function toggle() {
    setDark(d => {
      const next = !d
      try { localStorage.setItem('gd-staff-theme', next ? 'dark' : 'light') } catch {}
      return next
    })
  }

  if (!isStaff) return null
  return (
    <button onClick={toggle} aria-label="Toggle light or dark mode" title="Toggle light / dark"
      className="fixed bottom-4 left-4 z-[60] w-11 h-11 rounded-full bg-gray-800 text-white border border-gray-600 shadow-lg flex items-center justify-center text-lg hover:bg-gray-700 transition-colors">
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
