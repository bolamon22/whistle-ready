// Checkpoints of who was on each game (Bo, Oct 21 2026: assigners want to "auto save a
// check point so if the schedule changes on them they know what the old ref assignments
// were"). The pure half: the shape a checkpoint stores, which writes count as a schedule
// change, and what changed between a checkpoint and now. No database import: client
// pages use it. Storage and the automatic saves: lib/assignCheckpoint.

export type CpOfficial = { role: string; workerId: string; name: string }
export type CpGame = {
  id: string; gameNumber: string; date: string; startTime: string; location: string; division: string
  team1: string; team2: string; isCanceled: boolean; officials: CpOfficial[]
}
export type Change = 'moved' | 'teams' | 'canceled' | 'removed' | 'officials'
export type DiffRow = { key: string; before: CpGame; after: CpGame | null; changes: Change[] }

export const ROLE_ORDER = ['ref1', 'ref2', 'ref3', 'scorekeeper']
export const ROLE_SHORT: Record<string, string> = { ref1: 'R1', ref2: 'R2', ref3: 'R3', scorekeeper: 'SK' }
const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r); return i < 0 ? 99 : i }

/** A game as a checkpoint keeps it, from a Game row with its assignments and workers. */
export function cpGame(g: {
  id: string; gameNumber: string; date: string; startTime: string; location: string; division: string; team1: string; team2: string; isCanceled: boolean
  assignments?: { role: string; workerId: string; worker?: { name?: string | null } | null }[]
}): CpGame {
  return {
    id: g.id, gameNumber: String(g.gameNumber ?? ''), date: g.date || '', startTime: g.startTime || '', location: g.location || '', division: g.division || '',
    team1: g.team1 || '', team2: g.team2 || '', isCanceled: !!g.isCanceled,
    officials: (g.assignments || []).map(a => ({ role: a.role, workerId: a.workerId, name: String(a.worker?.name || '') }))
      .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role)),
  }
}

/** Who is on what: changes when any official is added, removed or swapped. */
export function assignSig(games: CpGame[]): string {
  return games.flatMap(g => g.officials.map(o => `${g.id}|${o.role}|${o.workerId}`)).sort().join(';')
}

const SCORE_ONLY = new Set(['score1', 'score2', 'refCount', 'updatedAt'])
/** True for a Game write that changes the schedule: a move, a matchup or number change,
 *  a cancel or a delete. Not creating games (nobody was on them yet), and not saves that
 *  only touch scores or how many refs a game needs (lib/db calls this before each write). */
export function isScheduleWrite(action: string, args: any): boolean {
  if (action === 'delete' || action === 'deleteMany') return true
  if (action !== 'update' && action !== 'updateMany' && action !== 'upsert') return false
  const data = action === 'upsert' ? args?.update : args?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return true
  const keys = Object.keys(data)
  return keys.length > 0 && !keys.every(k => SCORE_ONLY.has(k))
}

const offSig = (g: CpGame) => g.officials.map(o => `${o.role}|${o.workerId}`).join(',')

/** The games of a checkpoint that changed since: moved (day, time or field), new teams,
 *  canceled, removed, or different officials. A re-imported schedule gives games new ids,
 *  so a game not found by id is matched by division and game number. */
export function diffCheckpoint(before: CpGame[], after: CpGame[]): DiffRow[] {
  const byId = new Map(after.map(g => [g.id, g]))
  const numKey = (g: CpGame) => `${g.division.trim().toLowerCase()}|${g.gameNumber.trim().toLowerCase()}`
  const byNum = new Map<string, CpGame[]>()
  for (const g of after) { const k = numKey(g); byNum.set(k, [...(byNum.get(k) || []), g]) }
  const out: DiffRow[] = []
  for (const b of before) {
    let a = byId.get(b.id) || null
    if (!a && b.gameNumber) { const m = byNum.get(numKey(b)); if (m && m.length === 1) a = m[0] }
    const changes: Change[] = []
    if (!a) changes.push('removed')
    else {
      if (a.date !== b.date || a.startTime !== b.startTime || a.location !== b.location) changes.push('moved')
      if (a.team1 !== b.team1 || a.team2 !== b.team2) changes.push('teams')
      if (a.isCanceled && !b.isCanceled) changes.push('canceled')
      if (offSig(a) !== offSig(b)) changes.push('officials')
    }
    if (changes.length) out.push({ key: b.id, before: b, after: a, changes })
  }
  return out
}

/** The rows where officials who were on a game are affected by a schedule change. */
export const touchesOfficials = (r: DiffRow) => r.before.officials.length > 0 && r.changes.some(c => c !== 'officials')
