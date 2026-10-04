import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { openableRegistrations } from '@/lib/clubAccess'
import { tournamentOrgId } from '@/lib/org'
import { cleanName, nameKey } from '@/lib/names'

export const dynamic = 'force-dynamic'

// GET ?tournamentId= : a signed-in director's clubs and past teams, for the top of
// the public team registration form (Bo, Oct 4 2026: "log in for easy
// registration ... see teams they've done in the past and maybe check them off").
//
// Only registrations this login can open (lib/clubAccess), and only at this
// organizer's events: another organizer's clubs don't belong on this form. Newest
// first; each team once, as it was last registered. registeredHere says the club
// already has a registration at this event, so the form can point them to the
// portal to add teams instead of starting a second one.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = String((session?.user as { id?: string } | undefined)?.id || '')
  if (!userId) return NextResponse.json({ clubs: [] }, { status: 401 })
  const tournamentId = String(req.nextUrl.searchParams.get('tournamentId') || '')
  const orgId = tournamentId ? await tournamentOrgId(tournamentId) : null
  if (!orgId) return NextResponse.json({ clubs: [] })

  const openable = await openableRegistrations(userId)
  if (!openable.length) return NextResponse.json({ clubs: [] })
  const events: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, orgId FROM "Tournament" WHERE id IN (${[...new Set(openable.map(r => r.tournamentId))].map(() => '?').join(', ')})`,
    ...new Set(openable.map(r => r.tournamentId)))
  const ours = new Map(events.filter(t => String(t.orgId || '') === orgId).map(t => [String(t.id), String(t.name || '')]))
  const ids = openable.filter(r => ours.has(r.tournamentId)).map(r => r.id)
  if (!ids.length) return NextResponse.json({ clubs: [] })

  const regs = await prisma.teamRegistration.findMany({
    where: { id: { in: ids }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, tournamentId: true, clubName: true, clubContact: true, contactEmail: true, contactPhone: true,
      clubBasedIn: true, clubWebsite: true, clubLogoUrl: true,
      teams: { select: { teamName: true, division: true, coachName: true, coachPhone: true, coachEmail: true, logoUrl: true } },
    },
  })

  const me = String(session?.user?.email || '').trim().toLowerCase()
  const myName = String(session?.user?.name || '').trim()
  type Team = { teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string; logoUrl: string; lastEvent: string }
  type Club = {
    clubName: string; clubBasedIn: string; clubWebsite: string; clubLogoUrl: string
    contact: { name: string; email: string; phone: string }
    registeredHere: boolean; teams: Team[]
  }
  const clubs = new Map<string, Club>()
  const seen = new Set<string>()
  for (const r of regs) {          // newest first
    const ck = nameKey(r.clubName)
    if (!ck) continue
    let c = clubs.get(ck)
    if (!c) {
      // The registering person is them: their name, email and phone, taken from a
      // registration they were the contact on when there is one.
      const theirs = regs.find(x => nameKey(x.clubName) === ck && String(x.contactEmail || '').trim().toLowerCase() === me)
      c = {
        clubName: cleanName(r.clubName), clubBasedIn: r.clubBasedIn || '', clubWebsite: r.clubWebsite || '', clubLogoUrl: r.clubLogoUrl || '',
        contact: { name: theirs?.clubContact || myName, email: me, phone: theirs?.contactPhone || '' },
        registeredHere: false, teams: [],
      }
      clubs.set(ck, c)
    }
    if (r.tournamentId === tournamentId) { c.registeredHere = true; continue }
    for (const t of r.teams) {
      const tk = `${ck}|${nameKey(t.teamName)}`
      if (!nameKey(t.teamName) || seen.has(tk) || c.teams.length >= 40) continue
      seen.add(tk)
      c.teams.push({
        teamName: cleanName(t.teamName), division: t.division || '', coachName: t.coachName || '', coachPhone: t.coachPhone || '',
        coachEmail: t.coachEmail || '', logoUrl: t.logoUrl || '', lastEvent: ours.get(r.tournamentId) || '',
      })
    }
  }
  return NextResponse.json({ clubs: [...clubs.values()] })
}
