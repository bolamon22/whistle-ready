import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isWithdrawnDivision } from '@/lib/withdrawn'

// The teams this login coaches: every registered team whose coach email is the
// login's email (Oct 23 2026). The coach home used to ask a coach to pick a
// tournament and team from lists a coach login can't load (/api/tournaments is
// empty without an organization), so it never got past setup. Waitlisted and
// withdrawn teams and deleted registrations are left out.
export async function GET() {
  const session = await getServerSession(authOptions)
  const email = String((session?.user as any)?.email || '').trim().toLowerCase()
  if (!session || !email) return NextResponse.json([], { status: session ? 200 : 401 })
  try {
    const rows = await prisma.registeredTeam.findMany({
      where: { waitlisted: false, registration: { deletedAt: null } },
      select: {
        teamName: true, division: true, coachEmail: true,
        registration: { select: { clubName: true, tournament: { select: { id: true, name: true, startDate: true, endDate: true, location: true, logoUrl: true } } } },
      },
    })
    const mine = rows
      .filter(r => String(r.coachEmail || '').trim().toLowerCase() === email && !isWithdrawnDivision(r.division))
      .map(r => ({
        tournamentId: r.registration.tournament.id,
        tournamentName: r.registration.tournament.name,
        startDate: String(r.registration.tournament.startDate || ''),
        endDate: String(r.registration.tournament.endDate || ''),
        location: r.registration.tournament.location || '',
        logoUrl: r.registration.tournament.logoUrl || '',
        clubName: r.registration.clubName,
        teamName: r.teamName,
        division: r.division,
      }))
    return NextResponse.json(mine, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json([])
  }
}
