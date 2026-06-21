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

// Reusable org-level rules library (Sixes, Traditional, etc.). Per-org in AppSetting.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ sets: [] })
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: `orgRules:${orgId}` } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return NextResponse.json({ sets: Array.isArray(v.sets) ? v.sets : [] })
  } catch { return NextResponse.json({ sets: [] }) }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Only an admin or director can edit rules' }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  try {
    await ensureTable()
    const body = await req.json().catch(() => ({})) as any
    const sets = Array.isArray(body.sets) ? body.sets : []
    const value = JSON.stringify({ sets })
    await prisma.appSetting.upsert({ where: { key: `orgRules:${orgId}` }, update: { value }, create: { key: `orgRules:${orgId}`, value } })
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 }) }
}
