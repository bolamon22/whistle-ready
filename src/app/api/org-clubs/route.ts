import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
function targetOrgId(req: NextRequest, session: any): string | null {
  const role = session?.user?.role
  const paramOrg = new URL(req.url).searchParams.get('org')
  if (role === 'admin' && paramOrg) return paramOrg
  return session?.user?.orgId ?? null
}

// Org-level club history database — every club that has ever registered for an
// org's tournaments, deduped, with per-event/year history (teams brought, $
// paid, divisions) and win-back flags. Powers the Returning Teams / re-invite
// workflow. Sourced from historical registration exports (e.g. Cognito) and,
// going forward, appendable from Whistle Ready's own registrations.
// Stored per-org in AppSetting as { clubs: [...], updatedAt }.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role === 'coach' || role === 'parent') return NextResponse.json({ clubs: [] })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ clubs: [] })
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: `orgClubs:${orgId}` } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return NextResponse.json({ clubs: Array.isArray(v.clubs) ? v.clubs : [], updatedAt: v.updatedAt || null })
  } catch { return NextResponse.json({ clubs: [] }) }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Only an admin or director can edit the club database' }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  try {
    await ensureTable()
    const body = await req.json().catch(() => ({})) as any
    const clubs = Array.isArray(body.clubs) ? body.clubs : []
    const value = JSON.stringify({ clubs, updatedAt: new Date().toISOString() })
    await prisma.appSetting.upsert({ where: { key: `orgClubs:${orgId}` }, update: { value }, create: { key: `orgClubs:${orgId}`, value } })
    return NextResponse.json({ ok: true, count: clubs.length })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 }) }
}
