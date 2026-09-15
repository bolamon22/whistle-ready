import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { orgById } from '@/lib/org'

// The org's credentialed photographers (AppSetting `photographers:{orgId}`).
// Same auth shape as /api/org-site: admins may target any org with ?org=, everyone
// else is scoped to their own.
async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* already there */ }
}

function targetOrgId(req: NextRequest, session: any): string | null {
  const role = session?.user?.role
  const paramOrg = new URL(req.url).searchParams.get('org')
  if (role === 'admin' && paramOrg) return paramOrg
  return session?.user?.orgId ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json([])
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: `photographers:${orgId}` } })
    const v = row ? JSON.parse(row.value || '[]') : []
    return NextResponse.json(Array.isArray(v) ? v : [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') {
    return NextResponse.json({ error: 'Only an admin or director can edit photographers' }, { status: 403 })
  }
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  try {
    await ensureTable()
    const body = await req.json().catch(() => [])
    const value = JSON.stringify(Array.isArray(body) ? body : [])
    await prisma.appSetting.upsert({
      where: { key: `photographers:${orgId}` },
      update: { value },
      create: { key: `photographers:${orgId}`, value },
    })
    // Refresh the public pages so an edit shows up without waiting out the cache.
    try {
      const org = await orgById(orgId)
      if (org?.slug) {
        for (const p of [`/o/${org.slug}/photographers`, `/o/${org.slug}/gallery`]) {
          try { revalidatePath(p) } catch { /* best effort */ }
        }
        try { revalidatePath(`/o/${org.slug}/photographers/[who]`, 'page') } catch { /* best effort */ }
      }
    } catch { /* revalidation is best effort */ }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
