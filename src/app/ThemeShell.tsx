'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Staff theme with a per-user Light/Dark toggle (default light).
// Applies on signed-in routes only; excludes the public tournament page
// (its own toggle) and the login/register pages. Preference persists in
// localStorage. The switch itself is Appearance in NavBar's account menu (and
// Dark mode in its phone menu); the floating button it replaced was dropped with
// the Oct 13 2026 header redesign.
// True on the signed-in routes that get the Light/Dark treatment. Shared with <NavBar>.
export function isStaffThemeRoute(pathname: string) {
  const isPublic = /\/public(\/|$)/.test(pathname) || /^\/claim(\/|$)/.test(pathname) || /^\/tournaments\/[^/]+\/(event|rules|p|today|player-waiver|coach-waiver|vendor-request|register|player-register)(\/|$)/.test(pathname)
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isSite = pathname.startsWith('/o/')  // public org website = fixed light theme
  return !isPublic && !isAuthPage && !isSite
}

export default function ThemeShell() {
  const pathname = usePathname() || ''
  const isStaff = isStaffThemeRoute(pathname)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    try { const s = localStorage.getItem('gd-staff-theme'); if (s) setDark(s === 'dark') } catch {}
    // NavBar's menus flip the same preference and announce it here.
    const onTheme = (e: Event) => setDark(!!(e as CustomEvent).detail?.dark)
    window.addEventListener('gd-theme', onTheme)
    return () => window.removeEventListener('gd-theme', onTheme)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('gd-dark', isStaff && dark)
    return () => { document.body.classList.remove('gd-dark') }
  }, [isStaff, dark])

  return null
}
