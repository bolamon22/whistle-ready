import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { allSubs } from '@/lib/staffAlerts'

export const dynamic = 'force-dynamic'

// Who on this event's roster will actually get a buzz on game day, and who won't.
//
// Built because the honest answer to "are my staff set up?" was nobody knew
// (Bo, Oct 14 2026: "I'm just worried people are gonna miss notifications and
// they're not gonna know how to set it up"). Nagging everyone is the wrong fix;
// knowing WHICH eight people to grab at check-in is the right one.
//
// Covered = at least one push subscription registered against their email.
// Everyone else is uncovered, and comes back with a phone number so they can be
// chased rather than counted.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res

  const roster = await prisma.rosterEntry.findMany({
    where: { tournamentId: params.id },
    select: { worker: { select: { id: true, name: true, email: true, phone: true, defaultRole: true } } },
  })

  const subs = await allSubs()
  // Subscriptions key off email, since one person may register several devices.
  const byEmail = new Map<string, { devices: number; labels: string[] }>()
  for (const s of subs) {
    const e = String(s.email || '').trim().toLowerCase()
    if (!e) continue
    const cur = byEmail.get(e) || { devices: 0, labels: [] }
    cur.devices += 1
    if (s.label) cur.labels.push(String(s.label))
    byEmail.set(e, cur)
  }

  const covered: { id: string; name: string; role: string; devices: number; labels: string[] }[] = []
  const uncovered: { id: string; name: string; role: string; email: string; phone: string; reason: 'no alerts yet' | 'no email on file' }[] = []

  for (const r of roster) {
    const w = r.worker
    if (!w) continue
    const name = w.name || 'Unnamed'
    const role = String(w.defaultRole || '')
    const email = String(w.email || '').trim().toLowerCase()
    const hit = email ? byEmail.get(email) : undefined
    if (hit) covered.push({ id: w.id, name, role, devices: hit.devices, labels: hit.labels })
    else {
      uncovered.push({
        id: w.id, name, role,
        email: String(w.email || ''),
        phone: String(w.phone || ''),
        // No email means they can't be matched to a subscription at all, which
        // is a different problem from simply not having turned alerts on.
        reason: email ? 'no alerts yet' : 'no email on file',
      })
    }
  }

  const sortByName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)
  covered.sort(sortByName)
  uncovered.sort(sortByName)

  return NextResponse.json({
    total: covered.length + uncovered.length,
    covered,
    uncovered,
  })
}
