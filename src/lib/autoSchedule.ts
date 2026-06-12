// ── Auto-fill scheduler (games, v1) ─────────────────────────────────────────
// Pure, testable placement of parking-lot games onto a day's field × time grid.
// Assists the manual drag-and-drop: produces a draft the director then tweaks.
//
// HARD rules (a placement is illegal if any fails):
//   - field+time not already taken
//   - field allows the game's division (field.divRestrictions empty = any)
//   - neither team already playing at that time
//   - team not already at maxPerDay games that day
//   - a bracket game lands strictly AFTER all the games that feed it
// SOFT preferences (minimised, weighted):
//   - keep a division on the field(s) it's already using (less bouncing)
//   - rest spacing: aim "one game on, one off" (~2 slots apart); penalise
//     back-to-back hardest and long gaps mildly
//   - pack the day from the top + spread across fields so they finish together
//   - younger-earlier as a faint tiebreak

export interface AGame {
  id: string
  gameNumber: string
  division: string
  pool: string | null
  team1: string
  team2: string
}

export interface AField {
  fullName: string
  divRestrictions?: string[] // divisions allowed on this field; empty/undefined = any
}

export interface PlacedGame {
  game: AGame
  time: string
  location: string
}

export interface AutoFillInput {
  toPlace: AGame[]
  placed: PlacedGame[] // games already on this day's grid (fixed)
  fields: AField[]
  slots: string[] // ordered "HH:MM"
  maxPerDay?: number
}

export interface AutoFillResult {
  placements: { id: string; time: string; location: string }[]
  unplaceable: string[]
}

// Weights (tunable)
const W_GROUP = 100 // division not yet on this field
const W_B2B = 70 // back-to-back (1 slot apart)
const W_REST = 9 // per slot away from the ideal 2-slot spacing
const W_EARLY = 1 // pack from the top
const W_BAL = 3 // spread across fields

export function bracketFeeders(team: string): string | null {
  const m = (team || '').match(/^[WL]-(B\d+)$/i)
  return m ? m[1].toUpperCase() : null
}

const isBracket = (g: AGame) => g.gameNumber.startsWith('B')

// Faint younger-earlier nudge: extract a leading age number from the division.
function divAge(div: string): number {
  const m = (div || '').match(/\b(?:U)?(\d{1,2})\b/i)
  return m ? parseInt(m[1]) : 99 // unknown ages treated as "old" (no morning pull)
}

export function autoFill(input: AutoFillInput): AutoFillResult {
  const maxPerDay = input.maxPerDay ?? 3
  const slots = input.slots
  const slotIndex = new Map(slots.map((t, i) => [t, i]))

  // Live state (mutated as we place)
  const occ = new Set<string>() // `${time}|${location}`
  const teamSlots = new Map<string, number[]>() // team -> slot indices played
  const divFieldUse = new Map<string, Set<string>>() // division -> fields it uses
  const fieldLoad = new Map<string, number>() // location -> # games
  const gameStartIdx = new Map<string, number>() // gameNumber -> slot index (for feeder ordering)

  const addTeamSlot = (team: string, i: number) => {
    if (!team) return
    const a = teamSlots.get(team) ?? []
    a.push(i)
    teamSlots.set(team, a)
  }
  const seed = (p: PlacedGame) => {
    const i = slotIndex.get(p.time)
    occ.add(`${p.time}|${p.location}`)
    fieldLoad.set(p.location, (fieldLoad.get(p.location) ?? 0) + 1)
    const dv = divFieldUse.get(p.game.division) ?? new Set<string>()
    dv.add(p.location)
    divFieldUse.set(p.game.division, dv)
    if (i != null) {
      addTeamSlot(p.game.team1, i)
      addTeamSlot(p.game.team2, i)
      gameStartIdx.set(p.game.gameNumber, i)
    }
  }
  input.placed.forEach(seed)

  // ── Placement order: pools first (by division, game #), then brackets by
  //    feeder-depth so a game's feeders are placed before it. ──
  const byNum = new Map(input.toPlace.map(g => [g.gameNumber, g]))
  const depthMemo = new Map<string, number>()
  const depth = (g: AGame): number => {
    if (depthMemo.has(g.gameNumber)) return depthMemo.get(g.gameNumber)!
    if (!isBracket(g)) return 0
    depthMemo.set(g.gameNumber, 0) // guard cycles
    const feeders = [g.team1, g.team2]
      .map(bracketFeeders)
      .filter((f): f is string => !!f)
      .map(fn => byNum.get(fn))
      .filter((x): x is AGame => !!x)
    const d = feeders.length ? 1 + Math.max(...feeders.map(depth)) : 1
    depthMemo.set(g.gameNumber, d)
    return d
  }
  const numCmp = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true })
  const ordered = [...input.toPlace].sort((a, b) => {
    const ab = isBracket(a) ? 1 : 0, bb = isBracket(b) ? 1 : 0
    if (ab !== bb) return ab - bb
    if (ab === 1) { const d = depth(a) - depth(b); if (d) return d }
    const dv = a.division.localeCompare(b.division)
    if (dv) return dv
    return numCmp(a.gameNumber, b.gameNumber)
  })

  const placements: { id: string; time: string; location: string }[] = []
  const unplaceable: string[] = []

  for (const g of ordered) {
    const elig = input.fields.filter(
      f => !f.divRestrictions || f.divRestrictions.length === 0 || f.divRestrictions.includes(g.division),
    )
    const feederNums = [g.team1, g.team2].map(bracketFeeders).filter((f): f is string => !!f)

    let best: { time: string; location: string; score: number } | null = null
    for (let i = 0; i < slots.length; i++) {
      const time = slots[i]
      // bracket order: every feeder must already sit at an earlier slot
      if (isBracket(g) && feederNums.length) {
        const ok = feederNums.every(fn => {
          const fi = gameStartIdx.get(fn)
          return fi != null && fi < i
        })
        if (!ok) continue
      }
      // team double-book or over the daily cap
      const t1s = teamSlots.get(g.team1) ?? []
      const t2s = teamSlots.get(g.team2) ?? []
      if (t1s.includes(i) || t2s.includes(i)) continue
      if (t1s.length >= maxPerDay || t2s.length >= maxPerDay) continue

      for (const f of elig) {
        const key = `${time}|${f.fullName}`
        if (occ.has(key)) continue

        let score = 0
        // keep division on the same field
        const used = divFieldUse.get(g.division)
        if (used && used.size > 0 && !used.has(f.fullName)) score += W_GROUP
        // rest spacing toward one-on/one-off (~2 slots)
        for (const arr of [t1s, t2s]) {
          if (!arr.length) continue
          const dist = Math.min(...arr.map(j => Math.abs(j - i)))
          if (dist === 1) score += W_B2B
          else score += W_REST * Math.abs(dist - 2)
        }
        // pack from the top + spread across fields
        score += i * W_EARLY
        score += (fieldLoad.get(f.fullName) ?? 0) * W_BAL
        // faint younger-earlier nudge
        const age = divAge(g.division)
        if (age <= 10) score += i * 0.5
        else if (age <= 12) score += i * 0.25

        if (!best || score < best.score) best = { time, location: f.fullName, score }
      }
    }

    if (!best) { unplaceable.push(g.id); continue }
    // commit
    const i = slotIndex.get(best.time)!
    occ.add(`${best.time}|${best.location}`)
    fieldLoad.set(best.location, (fieldLoad.get(best.location) ?? 0) + 1)
    const dv = divFieldUse.get(g.division) ?? new Set<string>()
    dv.add(best.location)
    divFieldUse.set(g.division, dv)
    addTeamSlot(g.team1, i)
    addTeamSlot(g.team2, i)
    gameStartIdx.set(g.gameNumber, i)
    placements.push({ id: g.id, time: best.time, location: best.location })
  }

  return { placements, unplaceable }
}
