// WHEN EACH DIVISION'S SCHEDULE LAST CHANGED (Bo, Oct 20 2026: "start timestamping
// when changes are made by division ... some sort of indication of when those
// published. More or less internally.")
//
// Every write to a Game (create, move, matchup or number change, delete) stamps its
// division here, from one place: the Prisma middleware in lib/db. That catches every
// route that edits games without each one having to remember to. Score saves don't
// count: they are results, not schedule changes.
//
// Stored one AppSetting row per division, `divisionEdit:<tournamentId>:<division>`
// = {"at": ISO time}, so two edits at once never overwrite each other's division.
// A bulk delete with no division named (a whole day cleared) stamps "*", which
// counts for every division.
//
// The Scheduler compares these times with the last Publish to show, per division,
// whether what's on screen is what the public sees.

type Client = { appSetting: { upsert: (a: any) => Promise<any>; findMany: (a: any) => Promise<{ key: string; value: string }[]> } }

const SCORE_FIELDS = new Set(['score1', 'score2'])
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

export const divisionEditKey = (tournamentId: string, division: string) => `divisionEdit:${tournamentId}:${division}`

/** Which (tournament, division) pairs a Game write touched. Pure, for testing. */
export function touchedDivisions(action: string, args: any, result: any): { tournamentId: string; division: string }[] {
  if (!WRITES.has(action)) return []
  const out: { tournamentId: string; division: string }[] = []
  const add = (t: unknown, d: unknown) => { if (typeof t === 'string' && t && typeof d === 'string' && d) out.push({ tournamentId: t, division: d }) }
  const data = args?.data
  // A save that only sets scores is a result, not a schedule change.
  if ((action === 'update' || action === 'updateMany') && data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data)
    if (keys.length && keys.every(k => SCORE_FIELDS.has(k))) return []
  }
  if (action === 'createMany') {
    for (const row of Array.isArray(data) ? data : data ? [data] : []) add(row?.tournamentId, row?.division)
  } else if (action === 'updateMany' || action === 'deleteMany') {
    const w = args?.where || {}
    const t = typeof w.tournamentId === 'string' ? w.tournamentId : ''
    if (t) {
      if (typeof w.division === 'string') add(t, w.division)
      else if (action === 'deleteMany' || !(data && typeof data.division === 'string')) add(t, '*')
      if (data && typeof data.division === 'string') add(t, data.division)   // a division rename lands here
    }
  } else {
    // create / update / upsert / delete return the row
    add(result?.tournamentId, result?.division)
    if (action !== 'delete' && data && typeof data.division === 'string') add(result?.tournamentId, data.division)
  }
  const seen = new Set<string>()
  return out.filter(x => { const k = x.tournamentId + '|' + x.division; if (seen.has(k)) return false; seen.add(k); return true })
}

/** Stamp the divisions a Game write touched. Never throws. */
export async function noteGameWrite(client: Client, action: string, args: any, result: any): Promise<void> {
  try {
    const hits = touchedDivisions(action, args, result)
    if (!hits.length) return
    const value = JSON.stringify({ at: new Date().toISOString() })
    await Promise.all(hits.map(h => {
      const key = divisionEditKey(h.tournamentId, h.division)
      return client.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } }).catch(() => null)
    }))
  } catch { /* a missed stamp must never fail the edit */ }
}

/** { division: ISO time of its last schedule change }, "*" = a change to every division. */
export async function readDivisionEdits(client: Client, tournamentId: string): Promise<Record<string, string>> {
  const prefix = `divisionEdit:${tournamentId}:`
  try {
    const rows = await client.appSetting.findMany({ where: { key: { startsWith: prefix } } })
    const out: Record<string, string> = {}
    for (const r of rows) { try { const at = JSON.parse(r.value)?.at; if (at) out[r.key.slice(prefix.length)] = at } catch {} }
    return out
  } catch { return {} }
}
