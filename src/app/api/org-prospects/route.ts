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

// Org-level PROSPECT list — clubs that have NOT registered yet, the other half
// of the Club database. Deliberately a separate AppSetting key from orgClubs so
// cold names never inflate the customer counts and a club-database re-import
// can never wipe outreach progress.
// Stored per-org in AppSetting as { prospects: [...], updatedAt }.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role === 'coach' || role === 'parent') return NextResponse.json({ prospects: [] })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ prospects: [] })
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: `orgProspects:${orgId}` } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return NextResponse.json({ prospects: Array.isArray(v.prospects) ? v.prospects : [], updatedAt: v.updatedAt || null })
  } catch { return NextResponse.json({ prospects: [] }) }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Only an admin or director can edit the prospect list' }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  try {
    await ensureTable()
    const body = await req.json().catch(() => ({})) as any
    const prospects = Array.isArray(body.prospects) ? body.prospects : []
    const value = JSON.stringify({ prospects, updatedAt: new Date().toISOString() })
    await prisma.appSetting.upsert({ where: { key: `orgProspects:${orgId}` }, update: { value }, create: { key: `orgProspects:${orgId}`, value } })
    return NextResponse.json({ ok: true, count: prospects.length })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 }) }
}
