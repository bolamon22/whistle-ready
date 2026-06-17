'use client'
import { usePathname } from 'next/navigation'

// The app chrome (padded, max-width main) wraps in-app pages. Public org sites
// at /o/[slug] render full-bleed with no app padding.
export default function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = pathname?.startsWith('/o/')
  return <main className={bare ? '' : 'p-6 max-w-screen-2xl mx-auto'}>{children}</main>
}
