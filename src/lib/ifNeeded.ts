import { prisma } from '@/lib/db'

// "If needed" games (Bo, Oct 5 2026): a bracket game that is only played on a
// certain result -- e.g. a second final if the 1 seed loses to the 7 seed. It
// sits on the schedule, usually last in the day, and is dropped if not needed.
// The app can't tell from a bracket which games those are, so staff mark them
// in the Scheduler. Stored as one AppSetting per tournament (a list of game
// ids) rather than a Game column, so no migration; the games feed attaches
// `ifNeeded: true` for the scheduler and the public schedule alike.

const key = (tournamentId: string) => `ifNeeded:${tournamentId}`

export async function getIfNeeded(tournamentId: string): Promise<Set<string>> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(tournamentId) } })
    const ids = JSON.parse(row?.value || '[]')
    return new Set(Array.isArray(ids) ? ids.filter((x: unknown) => typeof x === 'string') : [])
  } catch { return new Set() }
}

export async function setIfNeeded(tournamentId: string, gameId: string, on: boolean): Promise<string[]> {
  const ids = await getIfNeeded(tournamentId)
  if (on) ids.add(gameId); else ids.delete(gameId)
  const value = JSON.stringify([...ids])
  await prisma.appSetting.upsert({ where: { key: key(tournamentId) }, update: { value }, create: { key: key(tournamentId), value } })
  return [...ids]
}

/** Games with `ifNeeded` set from the stored list. */
export function withIfNeeded<T extends { id: string }>(games: T[], ids: Set<string>): (T & { ifNeeded: boolean })[] {
  return games.map(g => ({ ...g, ifNeeded: ids.has(g.id) }))
}
