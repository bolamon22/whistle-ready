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

// Org-level brand & media asset library (logos, documents, maps, promo graphics).
// Stored per-org in AppSetting as { items: [{id,name,url,category,mime,createdAt}] }.
// Distinct from the photo gallery (action shots) — but pickers can show both.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ items: [] })
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: `orgAssets:${orgId}` } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return NextResponse.json({ items: Array.isArray(v.items) ? v.items : [] })
  } catch { return NextResponse.json({ items: [] }) }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Only an admin or director can edit the asset library' }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  try {
    await ensureTable()
    const body = await req.json().catch(() => ({})) as any
    const items = Array.isArray(body.items) ? body.items : []
    const value = JSON.stringify({ items })
    await prisma.appSetting.upsert({ where: { key: `orgAssets:${orgId}` }, update: { value }, create: { key: `orgAssets:${orgId}`, value } })
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 }) }
}
