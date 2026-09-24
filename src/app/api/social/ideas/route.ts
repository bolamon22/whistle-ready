import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { orgById } from '@/lib/org'
import { DEFAULT_LEAGUES, LEAGUES, type IdeaEvent } from '@/lib/socialIdeas'

// Content ideas on the social calendar. The ideas themselves are built in the
// browser by src/lib/socialIdeas.ts (pure, so the day math runs on the viewer's
// own calendar). This route only supplies the inputs:
//
// GET → { events, settings: { leagues, show, dismissed }, site }
//   events = the org's upcoming tournaments, each with its divisions and — when a
//   same-named event ran 10–14 months earlier — last year's team count, so a post
//   can say "74 teams played Monster Mash in 2025" from real data.
// PUT { leagues?, show?, dismiss?, undismiss? } → saves the org's idea settings.
//
// Settings live in AppSetting `socialIdeas:{orgId}` (same pattern as the queue).

const key = (orgId: string) => `socialIdeas:${orgId}`
interface Settings { leagues: string[]; show: boolean; dismissed: string[] }

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
async function loadSettings(orgId: string): Promise<Settings> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } }).catch(() => null)
  const d: Settings = { leagues: DEFAULT_LEAGUES, show: true, dismissed: [] }
  if (!row) return d
  try {
    const v = JSON.parse(row.value)
    return {
      leagues: Array.isArray(v.leagues) ? v.leagues.filter((x: any) => typeof x === 'string') : d.leagues,
      show: v.show !== false,
      dismissed: Array.isArray(v.dismissed) ? v.dismissed.filter((x: any) => typeof x === 'string') : [],
    }
  } catch { return d }
}

// Same normalization the ideas engine uses for display names, so "Monster Mash
// Lax Clash 2025" and "Monster Mash Lax Clash" count as the same event.
const norm = (s: string) => s.toLowerCase().replace(/\b20\d\d\b/g, '').replace(/[^a-z]+/g, ' ').trim()
const shiftDays = (dateStr: string, n: number) => { const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ events: [], settings: { leagues: DEFAULT_LEAGUES, show: true, dismissed: [] }, site: '' })
  const settings = await loadSettings(gate.orgId)
  const org = await orgById(gate.orgId)

  // Tournament.orgId is raw SQL (not in the Prisma schema) — see src/lib/org.ts.
  const since = shiftDays(new Date().toISOString(), -10)
  let rows: any[] = []
  try {
    rows = await prisma.$queryRawUnsafe(
      'SELECT id, name, startDate, endDate, location, registrationDivisions FROM "Tournament" WHERE orgId = ? AND startDate != \'\' AND (endDate >= ? OR startDate >= ?) ORDER BY startDate ASC LIMIT 20',
      gate.orgId, since, since)
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
        gate.orgId, shiftDays(rows[0].startDate, -430), shiftDays(rows[rows.length - 1].startDate, -300))
    } catch { past = [] }
  }

  const events: IdeaEvent[] = rows.map(r => {
    let divisions: string[] = []
    try { const d = JSON.parse(r.registrationDivisions || '[]'); if (Array.isArray(d)) divisions = d.map(String).filter(Boolean) } catch {}
    const lo = shiftDays(r.startDate, -430), hi = shiftDays(r.startDate, -300)
    const prev = past.find(p => norm(p.name) === norm(r.name) && p.startDate >= lo && p.startDate < hi)
    const teams = prev ? Number(prev.teams) || Number(prev.declared) || 0 : 0
    return { id: r.id, name: r.name, start: String(r.startDate).slice(0, 10), end: String(r.endDate || r.startDate).slice(0, 10), location: r.location || '', divisions, ...(teams ? { lastYearTeams: teams } : {}) }
  })
  return NextResponse.json({ events, settings, site: org?.website || '' })
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as any
  const s = await loadSettings(gate.orgId)
  const valid = new Set(LEAGUES.map(l => l.k))
  if (Array.isArray(body.leagues)) s.leagues = body.leagues.filter((x: any) => valid.has(x))
  if (typeof body.show === 'boolean') s.show = body.show
  if (typeof body.dismiss === 'string' && body.dismiss.length < 200 && !s.dismissed.includes(body.dismiss)) s.dismissed = [...s.dismissed, body.dismiss].slice(-500)
  if (typeof body.undismiss === 'string') s.dismissed = s.dismissed.filter(k => k !== body.undismiss)
  const value = JSON.stringify(s)
  await prisma.appSetting.upsert({ where: { key: key(gate.orgId) }, update: { value }, create: { key: key(gate.orgId), value } })
  return NextResponse.json({ ok: true, settings: s })
}
