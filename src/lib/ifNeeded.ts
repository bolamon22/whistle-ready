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

// The Bracket builder already lets Bo name a game ("If needed", "Consolation 1")
// and files it in a section (winners / consolation / ...). The scheduled Game is
// B<gameNumber + numberOffset> in the same division. Reading that here means a
// game named "If needed" in the bracket shows as one on the schedule without
// being marked twice (Bo, Oct 5 2026), and consolation games are labeled too.
export interface BracketMeta { label: string; section: string }
export async function bracketMeta(tournamentId: string): Promise<Map<string, BracketMeta>> {
  const out = new Map<string, BracketMeta>()
  try {
    const brackets = await prisma.bracket.findMany({
      where: { tournamentId },
      select: { division: true, numberOffset: true, games: { select: { gameNumber: true, label: true, section: true } } },
    })
    for (const b of brackets) for (const g of b.games) {
      out.set(`${b.division}|B${g.gameNumber + (b.numberOffset ?? 0)}`, { label: g.label || '', section: g.section || '' })
    }
  } catch { /* bracket tables not migrated: no labels */ }
  return out
}
export const IF_NEEDED_LABEL = /\bif[\s-]*(needed|necessary)\b/i

/** Games with `ifNeeded` (marked in the Scheduler, or named so in the bracket),
 *  plus the bracket's label and section for bracket games. */
export function withIfNeeded<T extends { id: string; division?: string | null; gameNumber?: string | null }>(games: T[], ids: Set<string>, meta: Map<string, BracketMeta> = new Map()) {
  return games.map(g => {
    const m = meta.get(`${g.division ?? ''}|${g.gameNumber ?? ''}`)
    const fromBracket = !!m && IF_NEEDED_LABEL.test(m.label)
    return {
      ...g,
      ifNeeded: fromBracket || ids.has(g.id),
      ifNeededFromBracket: fromBracket,
      bracketLabel: m?.label || '',
      bracketSection: m?.section || '',
    }
  })
}
