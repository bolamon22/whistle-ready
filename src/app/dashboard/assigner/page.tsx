'use client'

import { Flag, ListChecks, Users, CalendarClock, Wallet, GraduationCap } from 'lucide-react'
import RoleHome from '@/components/RoleHome'

// The assigner's home, the same layout as the scheduler's (Oct 2026). Every button is a
// page the assigner role can open: the Assigner board, the per-official Assignments
// view, the staff roster, availability and staff pay. The old card linked to Field
// Requests (game-day ops), which the role no longer opens. Training (Oct 13 2026)
// sends staff training videos to the officials they run. The buttons carry the names
// the pages have everywhere else (Oct 17 2026): Staff roster and Staff pay, not
// Roster and Ref pay, so the event's People menu and this home agree.
export default function AssignerDashboard() {
  return (
    <RoleHome
      roleLabel="Assigner"
      homeHref={id => `/tournaments/${id}`}
      progress={{ done: t => t._count?.reffedGames ?? 0, verb: 'reffed', title: 'games have their full ref crew assigned' }}
      actions={id => [
        { href: `/tournaments/${id}`,              Icon: Flag,          label: 'Assign' },
        { href: `/tournaments/${id}/assignments`,  Icon: ListChecks,    label: 'By official' },
        { href: `/tournaments/${id}/roster`,       Icon: Users,         label: 'Staff roster' },
        { href: `/tournaments/${id}/availability`, Icon: CalendarClock, label: 'Availability' },
        { href: `/tournaments/${id}/pay-summary`,  Icon: Wallet,        label: 'Staff pay' },
        { href: '/dashboard/assigner/videos',     Icon: GraduationCap, label: 'Training' },
      ]}
    />
  )
}
