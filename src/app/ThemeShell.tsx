'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Staff theme with a per-user Light/Dark toggle (default light).
// Applies on signed-in routes only; excludes the public tournament page
// (its own toggle) and the login/register pages. Preference persists in
// localStorage. Renders a small floating toggle on staff routes.
// True on the signed-in routes that get the Light/Dark treatment. Shared with
// <NavBar>, whose phone menu carries the toggle (the floating button is desktop-only).
export function isStaffThemeRoute(pathname: string) {
  const isPublic = /\/public(\/|$)/.test(pathname) || /^\/claim(\/|$)/.test(pathname) || /^\/tournaments\/[^/]+\/(event|rules|p|today|player-waiver|vendor-request|register|player-register)(\/|$)/.test(pathname)
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isSite = pathname.startsWith('/o/')  // public org website = fixed light theme
  return !isPublic && !isAuthPage && !isSite
}

export default function ThemeShell() {
  const pathname = usePathname() || ''
  const isStaff = isStaffThemeRoute(pathname)
  // /admin has no <NavBar> (SuperAdminBar instead), so keep the floating button there on phones too.
  const fabOnPhones = pathname.startsWith('/admin')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    try { const s = localStorage.getItem('gd-staff-theme'); if (s) setDark(s === 'dark') } catch {}
    // NavBar's phone menu flips the same preference and announces it here.
    const onTheme = (e: Event) => setDark(!!(e as CustomEvent).detail?.dark)
    window.addEventListener('gd-theme', onTheme)
    return () => window.removeEventListener('gd-theme', onTheme)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('gd-dark', isStaff && dark)
    return () => { document.body.classList.remove('gd-dark') }
  }, [isStaff, dark])

  function toggle() {
    const next = !dark
    setDark(next)
    try { localStorage.setItem('gd-staff-theme', next ? 'dark' : 'light') } catch {}
    window.dispatchEvent(new CustomEvent('gd-theme', { detail: { dark: next } }))
  }

  if (!isStaff) return null
  return (
    <button onClick={toggle} aria-label="Toggle light or dark mode" title="Toggle light / dark"
      className={`fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-40 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gray-800/80 sm:bg-gray-800 text-white border border-gray-600 shadow-lg items-center justify-center text-base sm:text-lg hover:bg-gray-700 transition-colors ${fabOnPhones ? 'flex' : 'hidden sm:flex'}`}>
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
