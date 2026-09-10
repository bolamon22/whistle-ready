import { prisma } from '@/lib/db'

// Completed player waivers, counted per registered team.
//
// The waiver form stores the team as the "Club — Team" tag (PlayerRegForm's
// resolvedTeam: `${clubName} — ${teamPick}`), NOT the bare team name, so a naive
// teamName match against RegisteredTeam finds nothing — that's why every count
// first read 0 (Bo, Sep 10). Split the tag, normalize both sides, and match
// club-scoped. One lib so the registrations page and the reminder email can
// never disagree.

const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const SEP = /\s+[—–]\s+|\s+-\s+/

/** "LaxManiax — 2031/32" -> {club:'LaxManiax', team:'2031/32'}; bare names keep club ''. */
function splitTag(raw: unknown): { club: string; team: string } {
  const s = String(raw ?? '').trim()
  const m = SEP.exec(s)
  return m ? { club: s.slice(0, m.index), team: s.slice(m.index + m[0].length) } : { club: '', team: s }
}

export type WaiverCounts = {
  /** Completed waivers for one team of one club. */
  forTeam: (clubName: string, teamName: string) => number
  /** Every waiver whose club matches, however the team was written. */
  clubTotal: (clubName: string) => number
}

export async function waiverCounts(tournamentId: string): Promise<WaiverCounts> {
  const byClub = new Map<string, { byTeam: Map<string, number>; total: number }>()
  const unknownClubByTeam = new Map<string, number>()   // form without a club picker
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "clubName" AS club, "teamName" AS team, COUNT(*) AS n
       FROM "OrgFormSubmission"
       WHERE tournamentId = ? AND formType = 'player' AND "archivedAt" IS NULL
       GROUP BY "clubName", "teamName"`, tournamentId)
    for (const r of rows) {
      const n = Number(r.n) || 0
      if (!n) continue
      const parts = splitTag(r.team)
      const clubKey = norm(r.club) || norm(parts.club)
      const teamKey = norm(parts.team)
      if (!clubKey) { unknownClubByTeam.set(teamKey, (unknownClubByTeam.get(teamKey) ?? 0) + n); continue }
      if (!byClub.has(clubKey)) byClub.set(clubKey, { byTeam: new Map(), total: 0 })
      const b = byClub.get(clubKey)!
      b.byTeam.set(teamKey, (b.byTeam.get(teamKey) ?? 0) + n)
      b.total += n
    }
  } catch { /* waiver table not created yet — everything reads 0 */ }

  return {
    forTeam(clubName: string, teamName: string) {
      const teamKey = norm(teamName)
      const b = byClub.get(norm(clubName))
      // A club-less submission (plain team dropdown) still belongs to whichever
      // registered team carries that name.
      return b?.byTeam.get(teamKey) ?? unknownClubByTeam.get(teamKey) ?? 0
    },
    clubTotal(clubName: string) {
      return byClub.get(norm(clubName))?.total ?? 0
    },
  }
}

/** Per-team counts for one registration, plus whatever didn't land on a team. */
export function summarizeClub(
  counts: WaiverCounts,
  clubName: string,
  teams: { teamName: string; clubName?: string | null }[],
): { perTeam: number[]; matched: number; unassigned: number; total: number } {
  const perTeam = teams.map(t => counts.forTeam(t.clubName || clubName, t.teamName) || counts.forTeam(clubName, t.teamName))
  const matched = perTeam.reduce((s, n) => s + n, 0)
  const total = counts.clubTotal(clubName)
  return { perTeam, matched, unassigned: Math.max(0, total - matched), total: Math.max(total, matched) }
}
