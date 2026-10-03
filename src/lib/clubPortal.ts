// SERVER HELPERS FOR WHAT A CLUB DIRECTOR DOES TO THEIR OWN REGISTRATION from
// the club portal: request a change, add a team, register for the next event.
//
// The ownership rule is the one the coach and roster routes already use: the
// registration has to belong to a club this user is linked to for THIS
// tournament. It is fetched by id and its club checked against their
// ClubDirectorLink rows, so guessing an id reaches nothing.
//
// Staff viewing a club's portal (?userId=) get a read-only view for these. A
// change made there would be filed as the club's own, and staff already make
// the same changes on the registrations page.
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { cleanName, nameKey } from '@/lib/names'
import { getPublicVisibility } from '@/lib/publicView'
import { isDivisionFull, type RegStatusFields } from '@/lib/regStatus'

export type RegWithTeams = Prisma.TeamRegistrationGetPayload<{ include: { teams: true } }>

export type Owned =
  | { ok: true; reg: RegWithTeams; userId: string; who: string }
  | { ok: false; res: NextResponse }

const fail = (error: string, status: number, extra: Record<string, unknown> = {}): { ok: false; res: NextResponse } =>
  ({ ok: false, res: NextResponse.json({ error, ...extra }, { status }) })

/** The registration a signed-in club director is acting on, if it is theirs. */
export async function ownRegistration(
  session: any, requestedUserId: string | null, tournamentId: string, registrationId: string,
): Promise<Owned> {
  if (!session) return fail('Unauthorized', 401)
  if (!tournamentId || !registrationId) return fail('tournamentId and registrationId are required', 400)
  const as = viewAs(session, requestedUserId)
  if (!as.ok) return { ok: false, res: as.res }
  if (as.viewingOther) return fail('This is the staff view of the portal. Make the change on the registrations page instead.', 403)

  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return fail('You are not linked to a club for this event', 403)
  const mine = new Set(links.map(l => nameKey(l.clubName)))

  const reg = await prisma.teamRegistration.findUnique({ where: { id: registrationId }, include: { teams: true } })
  // A registration staff soft-deleted is not editable either: it is on its way out.
  if (!reg || reg.tournamentId !== tournamentId || reg.deletedAt) return fail('Registration not found', 404)
  if (!mine.has(nameKey(reg.clubName))) return fail('That is not your club', 403)
  return { ok: true, reg, userId: as.userId, who: cleanName(session?.user?.name, 80) }
}

export type EventInfo = {
  id: string
  name: string
  orgId: string | null
  startDate: string
  endDate: string
  location: string
  teamRegEnabled: boolean
  divisions: string[]
  pricingRaw: string
  site: RegStatusFields | null
}

/** What a club needs to know to place a team at an event: its divisions, which
 *  are marked full (tournamentSite:{id}), and its pricing. */
export async function eventInfo(tournamentId: string): Promise<EventInfo | null> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, orgId, startDate, endDate, location, teamRegEnabled, registrationDivisions, registrationPricing FROM "Tournament" WHERE id = ?`,
    tournamentId)
  const t = rows?.[0]
  if (!t) return null
  let divisions: string[] = []
  try { const d = JSON.parse(t.registrationDivisions || '[]'); if (Array.isArray(d)) divisions = d.map((x: unknown) => cleanName(x)).filter(Boolean) } catch { /* none */ }
  let site: RegStatusFields | null = null
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: `tournamentSite:${tournamentId}` } })
    if (s) site = JSON.parse(s.value || '{}')
  } catch { /* no status set: nothing is full */ }
  return {
    id: String(t.id), name: String(t.name || ''), orgId: t.orgId ? String(t.orgId) : null,
    startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || ''),
    // Raw column, default 1: absent or null means open, as everywhere else.
    teamRegEnabled: t.teamRegEnabled === null || t.teamRegEnabled === undefined ? true : Number(t.teamRegEnabled) === 1,
    divisions, pricingRaw: String(t.registrationPricing || ''), site,
  }
}

/** The event's own spelling of a division the club picked, or null if it isn't offered. */
export function offeredDivision(info: EventInfo, picked: unknown): string | null {
  const want = nameKey(picked)
  if (!want) return null
  if (!info.divisions.length) return cleanName(picked, 120)   // no list set: take what they typed
  return info.divisions.find(d => nameKey(d) === want) || null
}

export const divisionFull = (info: EventInfo, division: string): boolean => isDivisionFull(division, info.site)

/**
 * Can a club still add a team itself, and to which divisions?
 *
 * Bo's rule (Oct 3 2026): directly until the schedule is posted, by request
 * after. Two more cases count as posted here, because a team dropped into them
 * silently breaks work already done: pools made public ahead of the schedule,
 * and a division that already has games in the draft schedule.
 */
export type AddPolicy = { ended: boolean; posted: boolean; scheduled: Set<string> }

export async function addPolicy(tournamentId: string): Promise<AddPolicy> {
  const vis = await getPublicVisibility(tournamentId)
  const games = await prisma.game.findMany({ where: { tournamentId }, select: { division: true }, distinct: ['division'] })
  return {
    ended: vis.ended,
    posted: vis.schedule === 'live' || vis.pools === 'live',
    scheduled: new Set(games.map(g => nameKey(g.division))),
  }
}

export function addBlock(p: AddPolicy, division: string): null | 'ended' | 'posted' | 'scheduled' {
  if (p.ended) return 'ended'
  if (p.posted) return 'posted'
  return p.scheduled.has(nameKey(division)) ? 'scheduled' : null
}

export async function directAddBlock(tournamentId: string, division: string): Promise<null | 'ended' | 'posted' | 'scheduled'> {
  return addBlock(await addPolicy(tournamentId), division)
}

/** One more line in the registration's staff notes, for what a club did itself. */
export async function addStaffNote(regId: string, current: string | null | undefined, line: string): Promise<void> {
  const notes = String(current ?? '').trim() ? `${String(current).trim()}\n${line}` : line
  await prisma.teamRegistration.update({ where: { id: regId }, data: { notes } })
}
