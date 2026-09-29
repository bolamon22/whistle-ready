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
//   - spread a division's games across fields (parallelism + rest) while keeping
//     each team roughly on consistent fields (less bouncing)
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
const W_B2B = 70 // back-to-back (1 slot apart)
const W_REST = 9 // per slot away from the ideal 2-slot spacing
const W_EARLY = 1 // pack from the top
const W_BAL = 6 // spread games across fields (parallelism + rest)
const W_FIELDSWITCH = 14 // a real team moving to a field it hasn't used (light: keep teams on consistent fields without cramming a whole division onto one)

export function bracketFeeders(team: string): string | null {
  const m = (team || '').match(/^[WL]-(B\d+)$/i)
  return m ? m[1].toUpperCase() : null
}

// A "real" team is an actual registered team — not a bracket placeholder slot
// ("Seed 4", "W-B3", "L-B2", "TBD"). Placeholders repeat across divisions, so they
// must NOT be treated as the same team for double-book / rest-spacing / per-day caps.
export function isRealTeam(team: string): boolean {
  const t = (team || '').trim()
  if (!t) return false
  return !/^(seed\s|w-b\d|l-b\d|tbd$)/i.test(t)
}

const isBracket = (g: AGame) => g.gameNumber.startsWith('B')

// A team is its name WITHIN a division. Clubs reuse names across divisions ("H44" in
// Boys HS A and Boys HS B are different rosters), and every division numbers its own
// bracket games B1, B2..., so keying on the bare name or number mixes divisions up:
// false double-books, rest spacing against another team's games, and bracket feeders
// resolved from the wrong division.
export function teamKey(division: string, team: string): string {
  return `${division}\u0000${(team || '').trim()}`
}
const gameKey = (division: string, gameNumber: string) => `${division}\u0000${gameNumber}`

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
  const teamFieldUse = new Map<string, Set<string>>() // real team -> fields it has used
  const fieldLoad = new Map<string, number>() // location -> # games
  const gameStartIdx = new Map<string, number>() // gameNumber -> slot index (for feeder ordering)

  const addTeamSlot = (div: string, team: string, i: number) => {
    if (!isRealTeam(team)) return // skip bracket placeholders ("Seed 4", "W-B3"…)
    const k = teamKey(div, team)
    const a = teamSlots.get(k) ?? []
    a.push(i)
    teamSlots.set(k, a)
  }
  const addTeamField = (div: string, team: string, loc: string) => {
    if (!isRealTeam(team)) return
    const k = teamKey(div, team)
    const s = teamFieldUse.get(k) ?? new Set<string>()
    s.add(loc); teamFieldUse.set(k, s)
  }
  const seed = (p: PlacedGame) => {
    const i = slotIndex.get(p.time)
    occ.add(`${p.time}|${p.location}`)
    fieldLoad.set(p.location, (fieldLoad.get(p.location) ?? 0) + 1)
    addTeamField(p.game.division, p.game.team1, p.location)
    addTeamField(p.game.division, p.game.team2, p.location)
    if (i != null) {
      addTeamSlot(p.game.division, p.game.team1, i)
      addTeamSlot(p.game.division, p.game.team2, i)
      gameStartIdx.set(gameKey(p.game.division, p.game.gameNumber), i)
    }
  }
  input.placed.forEach(seed)

  // ── Placement order: pools first (by division, game #), then brackets by
  //    feeder-depth so a game's feeders are placed before it. ──
  const byNum = new Map(input.toPlace.map(g => [gameKey(g.division, g.gameNumber), g]))
  const depthMemo = new Map<string, number>()
  const depth = (g: AGame): number => {
    const gk = gameKey(g.division, g.gameNumber)
    if (depthMemo.has(gk)) return depthMemo.get(gk)!
    if (!isBracket(g)) return 0
    depthMemo.set(gk, 0) // guard cycles
    const feeders = [g.team1, g.team2]
      .map(bracketFeeders)
      .filter((f): f is string => !!f)
      .map(fn => byNum.get(gameKey(g.division, fn)))
      .filter((x): x is AGame => !!x)
    const d = feeders.length ? 1 + Math.max(...feeders.map(depth)) : 1
    depthMemo.set(gk, d)
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
          const fi = gameStartIdx.get(gameKey(g.division, fn))
          return fi != null && fi < i
        })
        if (!ok) continue
      }
      // team double-book or over the daily cap
      const t1s = teamSlots.get(teamKey(g.division, g.team1)) ?? []
      const t2s = teamSlots.get(teamKey(g.division, g.team2)) ?? []
      if (t1s.includes(i) || t2s.includes(i)) continue
      if (t1s.length >= maxPerDay || t2s.length >= maxPerDay) continue

      for (const f of elig) {
        const key = `${time}|${f.fullName}`
        if (occ.has(key)) continue

        let score = 0
        // keep each real team on consistent field(s) — minimise a team bouncing fields
        for (const tm of [g.team1, g.team2]) {
          if (!isRealTeam(tm)) continue
          const usedF = teamFieldUse.get(teamKey(g.division, tm))
          if (usedF && usedF.size > 0 && !usedF.has(f.fullName)) score += W_FIELDSWITCH
        }
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
    addTeamField(g.division, g.team1, best.location)
    addTeamField(g.division, g.team2, best.location)
    addTeamSlot(g.division, g.team1, i)
    addTeamSlot(g.division, g.team2, i)
    gameStartIdx.set(gameKey(g.division, g.gameNumber), i)
    placements.push({ id: g.id, time: best.time, location: best.location })
  }

  return { placements, unplaceable }
}
