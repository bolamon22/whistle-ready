'use client'

import { Calendar, Trophy, LayoutGrid, Settings } from 'lucide-react'
import RoleHome from '@/components/RoleHome'

export default function SchedulerDashboard() {
  return (
    <RoleHome
      roleLabel="Scheduler"
      homeHref={id => `/tournaments/${id}/dashboard`}
      progress={{ done: t => t._count?.placedGames ?? 0, verb: 'placed', title: 'games have a time and field' }}
      actions={id => [
        { href: `/tournaments/${id}/scheduler`, Icon: Calendar,   label: 'Schedule' },
        { href: `/tournaments/${id}/divisions`, Icon: Trophy,     label: 'Divisions' },
        { href: `/tournaments/${id}/dashboard`, Icon: LayoutGrid, label: 'Manage' },
        // Setup, not Field Req: field requests sit with game-day ops, which the
        // scheduler role does not open (Oct 2026 permissions).
        { href: `/tournaments/${id}/builder`,   Icon: Settings,   label: 'Setup' },
      ]}
    />
  )
}
