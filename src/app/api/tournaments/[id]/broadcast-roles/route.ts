import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Which staff roles the tournament director allows to post broadcasts.
// Stored in AppSetting key `broadcastRoles:<id>`. Director is always allowed
// (not stored). GET is open to logged-in staff (the composer reads it to know
// if the current user may post); POST is director-only.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `broadcastRoles:${id}`
const DEFAULT_BROADCAST_ROLES = ['director', 'assigner']

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
    let roles = DEFAULT_BROADCAST_ROLES
    if (row) { try { const v = JSON.parse(row.value || 'null'); if (Array.isArray(v)) roles = v } catch {} }
    return NextResponse.json({ roles })
  } catch {
    return NextResponse.json({ roles: DEFAULT_BROADCAST_ROLES })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (role !== 'director' && role !== 'admin') return NextResponse.json({ error: 'Only the tournament director can change broadcast permissions' }, { status: 403 })

    await ensureTable()
    const body = await req.json()
    const roles = Array.isArray(body.roles) ? body.roles.map((r: any) => String(r)) : []
    // director is always implicitly allowed; keep it in the stored list for clarity
    if (!roles.includes('director')) roles.unshift('director')
    await prisma.appSetting.upsert({
      where: { key: key(params.id) },
      update: { value: JSON.stringify(roles) },
      create: { key: key(params.id), value: JSON.stringify(roles) },
    })
    return NextResponse.json({ ok: true, roles })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
