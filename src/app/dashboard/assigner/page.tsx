'use client'

import { Flag, ListChecks, Users, CalendarClock, Wallet } from 'lucide-react'
import RoleHome from '@/components/RoleHome'

// The assigner's home, the same layout as the scheduler's (Oct 2026). Every button is a
// page the assigner role can open: the Assigner board, the per-official Assignments
// view, the staff roster, availability and ref pay. The old card linked to Field
// Requests (game-day ops), which the role no longer opens.
export default function AssignerDashboard() {
  return (
    <RoleHome
      roleLabel="Assigner"
      homeHref={id => `/tournaments/${id}`}
      progress={{ done: t => t._count?.reffedGames ?? 0, verb: 'reffed', title: 'games have their full ref crew assigned' }}
      actions={id => [
        { href: `/tournaments/${id}`,              Icon: Flag,          label: 'Assign' },
        { href: `/tournaments/${id}/assignments`,  Icon: ListChecks,    label: 'By official' },
        { href: `/tournaments/${id}/roster`,       Icon: Users,         label: 'Roster' },
        { href: `/tournaments/${id}/availability`, Icon: CalendarClock, label: 'Availability' },
        { href: `/tournaments/${id}/pay-summary`,  Icon: Wallet,        label: 'Ref pay' },
      ]}
    />
  )
}
