'use client'

import { Radio, Users, CalendarClock, Store, CalendarDays, GraduationCap } from 'lucide-react'
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
        { href: `/tournaments/${id}/roster`,         Icon: Users,         label: 'Staff' },
        { href: `/tournaments/${id}/availability`,   Icon: CalendarClock, label: 'Availability' },
        { href: `/tournaments/${id}/vendor-requests`, Icon: Store,        label: 'Vendors' },
        { href: `/tournaments/${id}/public`,         Icon: CalendarDays,  label: 'Schedule' },
        { href: '/dashboard/field-director/videos',  Icon: GraduationCap, label: 'Training' },
      ]}
    />
  )
}
