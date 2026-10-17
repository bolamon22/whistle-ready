// An event's teams (lib/eventTeams), stored in AppSetting `eventTeams:{tournamentId}`
// = { teams, by, at }. Server only.

import prisma from '@/lib/db'
import { cleanTeams, teamsSide, type TeamKind } from '@/lib/eventTeams'
import type { GameGender } from '@/lib/gameGender'

const PREFIX = 'eventTeams:'
const keyOf = (tournamentId: string) => PREFIX + tournamentId
const teamsIn = (value: string | null | undefined): TeamKind[] => {
  try { return cleanTeams(JSON.parse(value || '{}')?.teams) } catch { return [] }
}

export async function eventTeamsOf(tournamentId: string): Promise<TeamKind[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: keyOf(tournamentId) } })
    return teamsIn(row?.value)
  } catch { return [] }
}

/** Several events at once (the home page's cards). */
export async function eventTeamsMany(tournamentIds: string[]): Promise<Map<string, TeamKind[]>> {
  const out = new Map<string, TeamKind[]>()
  const ids = Array.from(new Set(tournamentIds.filter(Boolean)))
  if (!ids.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.map(keyOf) } } })
    for (const r of rows) out.set(r.key.slice(PREFIX.length), teamsIn(r.value))
  } catch { /* none */ }
  return out
}

/** The side a division that says neither belongs to at this event (lib/gameGender). */
export async function eventSideOf(tournamentId: string): Promise<GameGender> {
  return teamsSide(await eventTeamsOf(tournamentId))
}

export async function eventSidesOf(tournamentIds: string[]): Promise<Map<string, GameGender>> {
  const out = new Map<string, GameGender>()
  for (const [id, teams] of Array.from((await eventTeamsMany(tournamentIds)).entries())) out.set(id, teamsSide(teams))
  return out
}

/** Saves the kinds picked; none picked clears them. */
export async function saveEventTeams(tournamentId: string, teams: unknown, by: string): Promise<TeamKind[]> {
  const t = cleanTeams(teams)
  if (!t.length) {
    await prisma.appSetting.deleteMany({ where: { key: keyOf(tournamentId) } })
    return t
  }
  const value = JSON.stringify({ teams: t, by: String(by || '').slice(0, 120), at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: keyOf(tournamentId) }, create: { key: keyOf(tournamentId), value }, update: { value } })
  return t
}
