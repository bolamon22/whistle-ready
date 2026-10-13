'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useRole } from '@/lib/role-context'
import { roleCanAccess } from '@/lib/routeAccess'
import { roleHome } from '@/lib/roleHome'

// The back link above the game-day pages (communications, field requests, incidents,
// checklist, directory). It went to the event dashboard, which field directors and
// Whistle Ready staff can't open, so they got "not allowed"; they go home instead.
export default function EventBackLink({ id }: { id: string | string[] }) {
  const { status } = useSession()
  const { effectiveRole } = useRole()
  const dash = `/tournaments/${Array.isArray(id) ? id[0] : id}/dashboard`
  const toDash = status !== 'authenticated' || roleCanAccess(effectiveRole, dash)
  return (
    <Link href={toDash ? dash : roleHome(effectiveRole)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3">
      <ChevronLeft size={15} /> {toDash ? 'Dashboard' : 'Home'}
    </Link>
  )
}
