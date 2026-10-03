'use client'

import { useSession } from 'next-auth/react'
import { useRole } from '@/lib/role-context'
import { roleCanAccess } from '@/lib/routeAccess'

// Renders its children only when the viewer's role may open `href` (the same rule
// middleware enforces), so a sub-tab never leads to the "not allowed" page. While
// the session loads it shows the link rather than flash a gap.
export default function IfCanOpen({ href, children }: { href: string; children: React.ReactNode }) {
  const { status } = useSession()
  const { effectiveRole } = useRole()
  if (status === 'authenticated' && !roleCanAccess(effectiveRole, href)) return null
  return <>{children}</>
}
