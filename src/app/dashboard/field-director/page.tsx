'use client'

import { Radio, Users, CalendarClock, Store, CalendarDays, GraduationCap, ClipboardList, Trophy, TriangleAlert, LayoutGrid, Printer, Timer, Target } from 'lucide-react'
import RoleHome from '@/components/RoleHome'

// The field director's home (Oct 13 2026): only the events they're assigned to
// (lib/fieldDirector), each with game day, their staff (scorekeepers, athletic
// trainers, field ops), availability, vendors and the public schedule with the teams,
// plus training videos to send to their staff. No money, no registrations.
export default function FieldDirectorDashboard() {
  return (
    <RoleHome
      roleLabel="Field Director"
      homeHref={id => `/tournaments/${id}/communications`}
      progress={{ done: t => t._count?.placedGames ?? 0, verb: 'placed', title: 'games have a time and field' }}
      emptyText="No events yet. Ask your director to add you to an event on Your team."
      actions={id => [
        { href: `/tournaments/${id}/communications`, Icon: Radio,         label: 'Game day' },
        { href: `/tournaments/${id}/field-board`,    Icon: LayoutGrid,    label: 'Field board' },
        // Everyone can score (Bo, Oct 22 2026): the field director covers a field when a scorekeeper is short.
        { href: `/tournaments/${id}/scoring`,        Icon: Timer,         label: 'Live scoring' },
        { href: `/tournaments/${id}/scores`,         Icon: Target,        label: 'Post scores' },
        { href: `/tournaments/${id}/print-schedule`, Icon: Printer,       label: 'Print schedule' },
        { href: `/tournaments/${id}/tables`,         Icon: ClipboardList, label: 'Score tables' },
        { href: `/tournaments/${id}/incidents`,      Icon: TriangleAlert, label: 'Issues' },
        { href: `/tournaments/${id}/awards`,         Icon: Trophy,        label: 'Awards' },
        { href: `/tournaments/${id}/roster`,         Icon: Users,         label: 'Staff roster' },
        { href: `/tournaments/${id}/availability`,   Icon: CalendarClock, label: 'Availability' },
        { href: `/tournaments/${id}/vendor-requests`, Icon: Store,        label: 'Vendors' },
        { href: `/tournaments/${id}/public`,         Icon: CalendarDays,  label: 'Schedule' },
        { href: '/dashboard/field-director/videos',  Icon: GraduationCap, label: 'Training' },
      ]}
    />
  )
}
