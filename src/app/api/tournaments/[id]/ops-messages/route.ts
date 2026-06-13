import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Internal game-day "ops" quick-messages between staff ("need a ball on Field 5",
// "trainer to Field 7"). Stored as JSON in AppSetting key `opsMessages:<id>`.
// Any on-site staff member can post & read; external roles (coach/parent/club
// director) cannot. Not public.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `opsMessages:${id}`
const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)

async function readList(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) } })
  if (!row) return []
  try { const v = JSON.parse(row.value || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
async function writeList(id: string, list: any[]) {
  await prisma.appSetting.upsert({
    where: { key: key(id) },
    update: { value: JSON.stringify(list) },
    create: { key: key(id), value: JSON.stringify(list) },
  })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isStaff((session.user as any)?.role)) return NextResponse.json({ messages: [] }, { status: session ? 403 : 401 })
    await ensureTable()
    return NextResponse.json({ messages: await readList(params.id) })
  } catch {
    return NextResponse.json({ messages: [] })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(role)) return NextResponse.json({ error: 'Staff only' }, { status: 403 })

    await ensureTable()
    const body = await req.json()
    const text = String(body.text || '').trim()
    if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      text,
      group: String(body.group || 'all'),
      from: session.user?.name || session.user?.email || 'Staff',
      fromRole: role || 'staff',
      createdAt: new Date().toISOString(),
    }
    const list = await readList(params.id)
    await writeList(params.id, [entry, ...list].slice(0, 60))
    return NextResponse.json({ ok: true, message: entry })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to post' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session || !isStaff(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    await ensureTable()
    const delId = req.nextUrl.searchParams.get('id')
    const me = session.user?.name || session.user?.email || ''
    const list = await readList(params.id)
    // director can remove any; others can remove only their own
    const next = list.filter((m: any) => m.id !== delId || (role !== 'director' && m.from !== me))
    await writeList(params.id, next)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 })
  }
}
