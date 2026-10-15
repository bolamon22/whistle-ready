import { prisma } from '@/lib/db'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, updateSubmissionData } from '@/lib/formSubmissions'
import { nameKey } from '@/lib/names'
import { renameFollowRefs, removeFollowRefs, moveFollowDivision } from '@/lib/follows'

// Team and club names are string keys everywhere (pools, games, brackets,
// follows, club-director links, waivers). When one is renamed — even just to
// drop a stray space — every reference has to move with it, or the team quietly
// falls out of its pool and schedule. Both helpers are scoped to a single
// tournament and do NOT touch TeamRegistration / RegisteredTeam themselves
// (the caller already wrote those). They never throw; each returns a count of
// what it touched, per table.
//
// A team is a (division, name) pair: the same club fields "Miami Reign" in
// three divisions at Monster Mash, and renaming or deleting the HS B one must
// leave HS A's and U14 B's pools, games and followers alone. Both helpers take
// the division when the caller knows it (every real caller does); a blank
// division is the old name-wide behavior, kept for the admin clean-up pass that
// normalizes spelling across the whole event.

export type RenameCounts = Record<string, number>

export async function renameTeamRefs(tournamentId: string, oldName: string, newName: string, clubName?: string, division?: string): Promise<RenameCounts> {
  const n: RenameCounts = {}
  if (!tournamentId || !oldName || !newName || oldName === newName) return n
  const inDiv = (d: string) => !division || nameKey(d) === nameKey(division)

  // Pools keep a JSON array of team names.
  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId } })
    for (const p of pools) {
      if (!inDiv(p.division)) continue
      let names: string[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      if (!Array.isArray(names) || !names.includes(oldName)) continue
      // Deduped: renaming a team to a name the pool already carries would otherwise
      // leave two identical entries, and the generator counts those as two teams.
      const renamed = [...new Set(names.map(x => (x === oldName ? newName : x)))]
      await prisma.pool.update({ where: { id: p.id }, data: { teamNames: JSON.stringify(renamed) } })
      n.pools = (n.pools || 0) + 1
    }
  } catch {}

  // Scheduled games (pool play and anything else the scheduler wrote).
  try {
    const divWhere = division ? { division } : {}
    const a = await prisma.game.updateMany({ where: { tournamentId, team1: oldName, ...divWhere }, data: { team1: newName } })
    const b = await prisma.game.updateMany({ where: { tournamentId, team2: oldName, ...divWhere }, data: { team2: newName } })
    if (a.count + b.count) n.games = a.count + b.count
  } catch {}

  // Bracket games: the two slots plus the resolved winner / loser labels.
  try {
    const brackets = await prisma.bracket.findMany({ where: { tournamentId }, select: { id: true, division: true } })
    const ids = brackets.filter((b: { id: string; division: string }) => inDiv(b.division)).map((b: { id: string }) => b.id)
    if (ids.length) {
      let c = 0
      c += (await prisma.bracketGame.updateMany({ where: { bracketId: { in: ids }, team1: oldName }, data: { team1: newName } })).count
      c += (await prisma.bracketGame.updateMany({ where: { bracketId: { in: ids }, team2: oldName }, data: { team2: newName } })).count
      c += (await prisma.bracketGame.updateMany({ where: { bracketId: { in: ids }, winner: oldName }, data: { winner: newName } })).count
      c += (await prisma.bracketGame.updateMany({ where: { bracketId: { in: ids }, loser: oldName }, data: { loser: newName } })).count
      if (c) n.bracketGames = c
    }
  } catch {}

  // Fans following the team (unique per user — skip a row that would collide).
  try {
    const follows = await prisma.userTeamFollow.findMany({ where: { tournamentId, teamName: oldName } })
    for (const f of follows) {
      try { await prisma.userTeamFollow.update({ where: { id: f.id }, data: { teamName: newName } }); n.follows = (n.follows || 0) + 1 } catch {}
    }
  } catch {}
  try {
    const r = await prisma.coachProfile.updateMany({ where: { tournamentId, teamName: oldName }, data: { teamName: newName } })
    if (r.count) n.coachProfiles = r.count
  } catch {}
  // Public followers (device-keyed, lib/follows) -- a rename must not strand
  // the phones that follow the old spelling.
  try { const c = await renameFollowRefs(tournamentId, oldName, newName, division); if (c) n.follows = (n.follows || 0) + c } catch {}

  // Player waivers are tagged "Club — Team" (bare team name for legacy entries).
  try {
    const orgId = await tournamentOrgId(tournamentId)
    if (orgId) {
      const pairs: [string, string][] = [[oldName, newName]]
      if (clubName) pairs.unshift([`${clubName} — ${oldName}`, `${clubName} — ${newName}`])
      for (const [oldLabel, newLabel] of pairs) {
        const subs = await listSubmissions({ orgId, formType: 'player', tournamentId, team: oldLabel, limit: 20000 })
        for (const s of subs) {
          await updateSubmissionData(orgId, s.id, { teamName: newLabel }, 'system')
          n.waivers = (n.waivers || 0) + 1
        }
      }
    }
  } catch {}

  return n
}

/**
 * Take a team off the schedule entirely, for a team being removed before the
 * event runs. The mirror of renameTeamRefs, and deliberately the same list of
 * places -- a name lives in more of them than anyone remembers, which is how a
 * deleted team kept turning up.
 *
 * Deletes its games outright: a pool game is a PAIRING, so the opponent loses
 * that game too. That is the real cost of a drop and the caller is expected to
 * tell the organizer about it -- see the counts returned here and
 * lib/gameBalance, which works out who is now short.
 *
 * Bracket slots are blanked rather than deleted, because a bracket game is a
 * position in a tree; removing the row would orphan whatever feeds it. The slot
 * shows as TBD instead.
 *
 * What it does NOT touch: player waivers and coach profiles. Those are signed
 * records of something that happened, not schedule, and a team leaving is no
 * reason to destroy them.
 */
export async function removeTeamRefs(tournamentId: string, teamName: string, division?: string): Promise<RenameCounts> {
  const n: RenameCounts = {}
  if (!tournamentId || !teamName) return n
  const inDiv = (d: string) => !division || nameKey(d) === nameKey(division)

  // Pools keep a JSON array of team names.
  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId } })
    for (const p of pools) {
      if (!inDiv(p.division)) continue
      let names: string[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      if (!Array.isArray(names)) continue
      const kept = names.filter(x => nameKey(x) !== nameKey(teamName))
      if (kept.length === names.length) continue
      await prisma.pool.update({ where: { id: p.id }, data: { teamNames: JSON.stringify(kept) } })
      n.pools = (n.pools || 0) + 1
    }
  } catch {}

  // Its games go. Count the scored ones separately so the caller can say so.
  //
  // Matched on nameKey, the same loose key as the pools above. An exact match
  // missed games whose stored name differed only in case or spacing from the
  // registration: the team left its pool but kept its games (Boys U10 7v7,
  // Oct 2026: "Jump" stayed on 3 games after being deleted).
  const me = nameKey(teamName)
  try {
    type Row = { id: string; score1: number | null; score2: number | null; team1: string; team2: string; division: string }
    const all: Row[] = await prisma.game.findMany({
      where: { tournamentId },
      select: { id: true, score1: true, score2: true, team1: true, team2: true, division: true },
    })
    const mine = all.filter(g => inDiv(g.division) && (nameKey(g.team1) === me || nameKey(g.team2) === me))
    if (mine.length) {
      type Row = { id: string; score1: number | null; score2: number | null }
      const scored = mine.filter((g: Row) => g.score1 !== null && g.score2 !== null).length
      await prisma.game.deleteMany({ where: { id: { in: mine.map((g: Row) => g.id) } } })
      n.games = mine.length
      if (scored) n.scoredGames = scored
    }
  } catch {}

  // Bracket slots: blank the seed and any resolved winner / loser label.
  try {
    const brackets = await prisma.bracket.findMany({ where: { tournamentId }, select: { id: true, division: true } })
    const ids = brackets.filter((b: { id: string; division: string }) => inDiv(b.division)).map((b: { id: string }) => b.id)
    if (ids.length) {
      // Same loose match as the games: read the slots, blank the ones that name it.
      let c = 0
      const rows: { id: string; team1: string | null; team2: string | null; winner: string | null; loser: string | null }[] =
        await prisma.bracketGame.findMany({ where: { bracketId: { in: ids } }, select: { id: true, team1: true, team2: true, winner: true, loser: true } })
      for (const r of rows) {
        const data: Record<string, string> = {}
        for (const k of ['team1', 'team2', 'winner', 'loser'] as const) if (r[k] && nameKey(r[k]) === me) data[k] = ''
        if (Object.keys(data).length) { await prisma.bracketGame.update({ where: { id: r.id }, data }); c += Object.keys(data).length }
      }
      if (c) n.bracketSlots = c
    }
  } catch {}

  // Fans following a team that is no longer in the event.
  try {
    const r = await prisma.userTeamFollow.deleteMany({ where: { tournamentId, teamName } })
    if (r.count) n.follows = r.count
  } catch {}
  try { const c = await removeFollowRefs(tournamentId, teamName, division); if (c) n.follows = (n.follows || 0) + c } catch {}

  return n
}

/**
 * Two teams in different divisions trade places: each takes the other's pool
 * spot, games and bracket seed, so neither division's schedule has to be
 * rebuilt. Bo, Oct 15 2026, swapping Riverwolves (U14 A) and Suncoast 14U
 * (U14 B): "I don't want to do it manually because then I'd have to reschedule
 * both divisions."
 *
 * Only references inside the two divisions change -- the same club's teams in
 * other divisions are separate (division, name) pairs. Followers move with
 * their team. Waivers and coach profiles are keyed by team name, which does not
 * change, so they need nothing. The caller has already moved the two
 * RegisteredTeam rows and checked that no game is scored.
 */
export async function swapTeamDivisionRefs(
  tournamentId: string,
  a: { name: string; division: string },
  b: { name: string; division: string },
): Promise<RenameCounts> {
  const n: RenameCounts = {}
  const dA = nameKey(a.division), dB = nameKey(b.division)
  const kA = nameKey(a.name), kB = nameKey(b.name)
  if (!tournamentId || !dA || !dB || dA === dB || !kA || !kB) return n
  // In A's division A's name becomes B's, and the reverse in B's. null = leave it.
  const swapIn = (division: string, v: string | null | undefined): string | null => {
    if (!v) return null
    const d = nameKey(division), k = nameKey(v)
    if (d === dA && k === kA) return b.name
    if (d === dB && k === kB) return a.name
    return null
  }

  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId } })
    for (const p of pools) {
      let names: string[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      if (!Array.isArray(names)) continue
      const next = names.map(x => swapIn(p.division, x) ?? x)
      if (next.join('\u0000') === names.join('\u0000')) continue
      await prisma.pool.update({ where: { id: p.id }, data: { teamNames: JSON.stringify(next) } })
      n.pools = (n.pools || 0) + 1
    }
  } catch {}

  try {
    const games: { id: string; division: string; team1: string; team2: string }[] = await prisma.game.findMany({
      where: { tournamentId }, select: { id: true, division: true, team1: true, team2: true },
    })
    for (const g of games) {
      const t1 = swapIn(g.division, g.team1), t2 = swapIn(g.division, g.team2)
      if (t1 === null && t2 === null) continue
      await prisma.game.update({ where: { id: g.id }, data: { ...(t1 !== null ? { team1: t1 } : {}), ...(t2 !== null ? { team2: t2 } : {}) } })
      n.games = (n.games || 0) + 1
    }
  } catch {}

  try {
    const brackets: { id: string; division: string; seeds: string }[] = await prisma.bracket.findMany({
      where: { tournamentId }, select: { id: true, division: true, seeds: true },
    })
    for (const br of brackets) {
      const d = nameKey(br.division)
      if (d !== dA && d !== dB) continue
      let seeds: Record<string, string> = {}
      try { seeds = JSON.parse(br.seeds || '{}') } catch {}
      let seedChanged = false
      for (const k of Object.keys(seeds)) { const v = swapIn(br.division, seeds[k]); if (v !== null) { seeds[k] = v; seedChanged = true } }
      if (seedChanged) { await prisma.bracket.update({ where: { id: br.id }, data: { seeds: JSON.stringify(seeds) } }); n.seeds = (n.seeds || 0) + 1 }
      const rows: { id: string; team1: string | null; team2: string | null; winner: string | null; loser: string | null }[] =
        await prisma.bracketGame.findMany({ where: { bracketId: br.id }, select: { id: true, team1: true, team2: true, winner: true, loser: true } })
      for (const r of rows) {
        const data: Record<string, string> = {}
        for (const k of ['team1', 'team2', 'winner', 'loser'] as const) { const v = swapIn(br.division, r[k]); if (v !== null) data[k] = v }
        if (Object.keys(data).length) { await prisma.bracketGame.update({ where: { id: r.id }, data }); n.bracketGames = (n.bracketGames || 0) + 1 }
      }
    }
  } catch {}

  // Same name in both divisions: nothing visible changes, and moving both
  // groups of followers would just trade them back.
  if (kA !== kB) {
    try {
      const c = (await moveFollowDivision(tournamentId, a.name, a.division, b.division))
        + (await moveFollowDivision(tournamentId, b.name, b.division, a.division))
      if (c) n.follows = c
    } catch {}
  }
  return n
}

export async function renameClubRefs(tournamentId: string, oldClub: string, newClub: string): Promise<RenameCounts> {
  const n: RenameCounts = {}
  if (!tournamentId || !oldClub || !newClub || oldClub === newClub) return n

  // Club-director accounts are linked to a tournament by club name.
  try {
    const r = await prisma.$executeRawUnsafe(`UPDATE "ClubDirectorLink" SET "clubName" = ? WHERE "tournamentId" = ? AND "clubName" = ?`, newClub, tournamentId, oldClub)
    if (Number(r)) n.directorLinks = Number(r)
  } catch {}

  // Waivers: the club field, and the "Club — Team" tag's prefix.
  try {
    const orgId = await tournamentOrgId(tournamentId)
    if (orgId) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "data" FROM "OrgFormSubmission" WHERE "orgId" = ? AND "formType" = 'player' AND "tournamentId" = ? AND ("clubName" = ? OR "teamName" LIKE ? ESCAPE '\\')`,
        orgId, tournamentId, oldClub, `${oldClub.replace(/[\\%_]/g, m => '\\' + m)} — %`)
      for (const row of rows || []) {
        let data: any = {}
        try { data = JSON.parse(row.data || '{}') } catch {}
        const changes: Record<string, string> = {}
        if (String(data.clubName || '') === oldClub) changes.clubName = newClub
        const tn = String(data.teamName || '')
        if (tn.startsWith(`${oldClub} — `)) changes.teamName = `${newClub} — ${tn.slice(oldClub.length + 3)}`
        if (!Object.keys(changes).length) continue
        await updateSubmissionData(orgId, row.id, changes, 'system')
        n.waivers = (n.waivers || 0) + 1
      }
    }
  } catch {}

  return n
}
