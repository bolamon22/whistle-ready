'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Applies the staff dark theme (body.gd-dark) on signed-in routes only.
// Excludes the public tournament page (its own light/dark toggle) and auth pages.
export default function ThemeShell() {
  const pathname = usePathname() || ''
  useEffect(() => {
    const isPublic = /\/public(\/|$)/.test(pathname)
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')
    const staffDark = !isPublic && !isAuthPage
    document.body.classList.toggle('gd-dark', staffDark)
    return () => { document.body.classList.remove('gd-dark') }
  }, [pathname])
  return null
}
