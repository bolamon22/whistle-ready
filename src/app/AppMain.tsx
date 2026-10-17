'use client'
import { usePathname } from 'next/navigation'

// The app chrome (padded, max-width main) wraps in-app pages. Public org sites
// at /o/[slug] render full-bleed with no app padding.
export default function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = pathname?.startsWith('/o/')
  // The Assigner board (/tournaments/[id]) uses the whole window: its grid is as wide as the
  // event has fields, and assigners asked for more room for the schedule (Oct 2026).
  const wide = /^\/tournaments\/[^/]+\/?$/.test(pathname || '')
  return <main data-app-main className={bare ? '' : wide ? 'p-3 sm:px-4 sm:py-5' : 'p-3 sm:p-6 max-w-screen-2xl mx-auto'}>{children}</main>
}
