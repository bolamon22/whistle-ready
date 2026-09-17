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

// ── Coaches ──────────────────────────────────────────────────────────────────
// Which coaches have signed, per registered team.
//
// In this file rather than its own, because the matching rules have to be
// IDENTICAL to the player waiver's — the same "Club — Team" tag, the same
// normalization, the same club-scoped fallback. Two copies drift, and a coach
// silently failing to appear against their team looks exactly like a coach who
// never signed.
//
// ONE DIFFERENCE, AND IT MATTERS: a coach can cover several teams in a weekend,
// which is the whole reason their form lets them tick more than one. `teamName`
// records only the first, so counting by that column alone would show a head
// coach against one of their three teams and leave the other two looking
// uncovered. The teams they actually claimed live in data.teams[], so that is
// what gets expanded here.

export type CoachSignatures = {
  /** Names of coaches who signed and claimed this team. */
  forTeam: (clubName: string, teamName: string) => string[]
  /** Everyone who signed for this club, however they wrote their teams. */
  forClub: (clubName: string) => string[]
}

export async function coachSignatures(tournamentId: string): Promise<CoachSignatures> {
  const byClubTeam = new Map<string, Set<string>>()   // `${clubKey}|${teamKey}` -> names
  const byClub = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, key: string, name: string) => {
    if (!key || !name) return
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)!.add(name)
  }

  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "clubName" AS club, "teamName" AS team, data
       FROM "OrgFormSubmission"
       WHERE tournamentId = ? AND formType = 'coach' AND "archivedAt" IS NULL`, tournamentId)

    for (const r of rows) {
      let d: any = {}
      try { d = typeof r.data === 'string' ? JSON.parse(r.data as string) : (r.data || {}) } catch { d = {} }
      const name = String(d.coachFullName || '').trim()
      if (!name) continue

      const tagged = splitTag(r.team)
      const fallbackClub = norm(r.club) || norm(d.clubName) || norm(tagged.club)
      add(byClub, fallbackClub, name)

      const claimed: any[] = Array.isArray(d.teams) ? d.teams : []
      if (claimed.length) {
        for (const t of claimed) {
          const ck = norm(t?.club) || fallbackClub
          const tk = norm(t?.team)
          if (tk) add(byClubTeam, `${ck}|${tk}`, name)
          add(byClub, ck, name)
        }
      } else if (tagged.team) {
        // Pre-teams[] records, and anyone who typed a club with no team list.
        add(byClubTeam, `${fallbackClub}|${norm(tagged.team)}`, name)
      }
    }
  } catch { /* no coach submissions yet — every team reads empty */ }

  const sorted = (s: Set<string> | undefined) => (s ? [...s].sort((a, b) => a.localeCompare(b)) : [])
  return {
    forTeam: (clubName, teamName) => sorted(byClubTeam.get(`${norm(clubName)}|${norm(teamName)}`)),
    forClub: clubName => sorted(byClub.get(norm(clubName))),
  }
}
