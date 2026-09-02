import { prisma } from '@/lib/db'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, updateSubmissionData } from '@/lib/formSubmissions'

// Team and club names are string keys everywhere (pools, games, brackets,
// follows, club-director links, waivers). When one is renamed — even just to
// drop a stray space — every reference has to move with it, or the team quietly
// falls out of its pool and schedule. Both helpers are scoped to a single
// tournament and do NOT touch TeamRegistration / RegisteredTeam themselves
// (the caller already wrote those). They never throw; each returns a count of
// what it touched, per table.

export type RenameCounts = Record<string, number>

export async function renameTeamRefs(tournamentId: string, oldName: string, newName: string, clubName?: string): Promise<RenameCounts> {
  const n: RenameCounts = {}
  if (!tournamentId || !oldName || !newName || oldName === newName) return n

  // Pools keep a JSON array of team names.
  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId } })
    for (const p of pools) {
      let names: string[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      if (!Array.isArray(names) || !names.includes(oldName)) continue
      await prisma.pool.update({ where: { id: p.id }, data: { teamNames: JSON.stringify(names.map(x => (x === oldName ? newName : x))) } })
      n.pools = (n.pools || 0) + 1
    }
  } catch {}

  // Scheduled games (pool play and anything else the scheduler wrote).
  try {
    const a = await prisma.game.updateMany({ where: { tournamentId, team1: oldName }, data: { team1: newName } })
    const b = await prisma.game.updateMany({ where: { tournamentId, team2: oldName }, data: { team2: newName } })
    if (a.count + b.count) n.games = a.count + b.count
  } catch {}

  // Bracket games: the two slots plus the resolved winner / loser labels.
  try {
    const brackets = await prisma.bracket.findMany({ where: { tournamentId }, select: { id: true } })
    const ids = brackets.map(b => b.id)
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
