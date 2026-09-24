import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { orgById } from '@/lib/org'
import { DEFAULT_LEAGUES, LEAGUES } from '@/lib/socialIdeas'
import { loadIdeaEvents } from '@/lib/socialIdeasServer'

// Content ideas on the social calendar. The ideas themselves are built in the
// browser by src/lib/socialIdeas.ts (pure, so the day math runs on the viewer's
// own calendar). This route only supplies the inputs:
//
// GET → { events, settings: { leagues, show, dismissed }, site }
//   events = the org's upcoming tournaments (see src/lib/socialIdeasServer.ts).
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

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ events: [], settings: { leagues: DEFAULT_LEAGUES, show: true, dismissed: [] }, site: '' })
  const settings = await loadSettings(gate.orgId)
  const org = await orgById(gate.orgId)

  const events = await loadIdeaEvents(gate.orgId)
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
