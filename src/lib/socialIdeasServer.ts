import { prisma } from '@/lib/db'
import type { IdeaEvent } from '@/lib/socialIdeas'

// Server-side inputs for the content-ideas engine and for Ask Chirp: the org's
// upcoming tournaments with their divisions and — when a same-named event ran
// 10–14 months earlier — last year's team count, so a post can say "74 teams
// played Monster Mash in 2025" from real registrations, not from copy.
//
// Tournament.orgId is raw SQL (not in the Prisma schema) — see src/lib/org.ts.

// Same normalization the ideas engine uses for display names, so "Monster Mash
// Lax Clash 2025" and "Monster Mash Lax Clash" count as the same event.
const norm = (s: string) => s.toLowerCase().replace(/\b20\d\d\b/g, '').replace(/[^a-z]+/g, ' ').trim()
export const shiftDays = (dateStr: string, n: number) => { const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

export async function loadIdeaEvents(orgId: string): Promise<IdeaEvent[]> {
  const since = shiftDays(new Date().toISOString(), -10)
  let rows: any[] = []
  try {
    rows = await prisma.$queryRawUnsafe(
      'SELECT id, name, startDate, endDate, location, registrationDivisions FROM "Tournament" WHERE orgId = ? AND startDate != \'\' AND (endDate >= ? OR startDate >= ?) ORDER BY startDate ASC LIMIT 20',
      orgId, since, since)
  } catch { rows = [] }

  // Last year's editions: one query for the whole window, matched by name.
  let past: any[] = []
  if (rows.length) {
    try {
      past = await prisma.$queryRawUnsafe(
        `SELECT t.id, t.name, t.startDate,
                (SELECT COUNT(*) FROM "RegisteredTeam" rt JOIN "TeamRegistration" tr ON tr.id = rt.registrationId WHERE tr.tournamentId = t.id AND tr.deletedAt IS NULL) AS teams,
                (SELECT COALESCE(SUM(tr.numTeams), 0) FROM "TeamRegistration" tr WHERE tr.tournamentId = t.id AND tr.deletedAt IS NULL) AS declared
         FROM "Tournament" t WHERE t.orgId = ? AND t.startDate >= ? AND t.startDate < ?`,
        orgId, shiftDays(rows[0].startDate, -430), shiftDays(rows[rows.length - 1].startDate, -300))
    } catch { past = [] }
  }

  return rows.map(r => {
    let divisions: string[] = []
    try { const d = JSON.parse(r.registrationDivisions || '[]'); if (Array.isArray(d)) divisions = d.map(String).filter(Boolean) } catch {}
    const lo = shiftDays(r.startDate, -430), hi = shiftDays(r.startDate, -300)
    const prev = past.find(p => norm(p.name) === norm(r.name) && p.startDate >= lo && p.startDate < hi)
    const teams = prev ? Number(prev.teams) || Number(prev.declared) || 0 : 0
    return { id: r.id, name: r.name, start: String(r.startDate).slice(0, 10), end: String(r.endDate || r.startDate).slice(0, 10), location: r.location || '', divisions, ...(teams ? { lastYearTeams: teams } : {}) }
  })
}
