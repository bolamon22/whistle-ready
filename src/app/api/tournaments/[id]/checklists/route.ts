import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DEFAULT_SETUP_ITEMS, type ChecklistItem } from '@/lib/setupChecklist'

// Shared tournament-setup checklist. One list per tournament that any staff
// member can check off and add to. Stored as JSON in AppSetting key
// `checklists:<id>` (no schema migration). Staff-only.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `checklists:${id}`
const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)

type Item = ChecklistItem

const DEFAULT_ITEMS: Item[] = DEFAULT_SETUP_ITEMS

async function readRaw(id: string): Promise<Item[] | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) } })
  if (!row) return null
  try { const v = JSON.parse(row.value || '[]'); return Array.isArray(v) ? v : null } catch { return null }
}
async function writeList(id: string, list: Item[]) {
  await prisma.appSetting.upsert({
    where: { key: key(id) },
    update: { value: JSON.stringify(list) },
    create: { key: key(id), value: JSON.stringify(list) },
  })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isStaff((session.user as any)?.role)) return NextResponse.json({ items: [] }, { status: session ? 403 : 401 })
    await ensureTable()
    const stored = await readRaw(params.id)
    return NextResponse.json({ items: stored && stored.length ? stored : DEFAULT_ITEMS })
  } catch { return NextResponse.json({ items: DEFAULT_ITEMS }) }
}

// Replace the whole list. Stamps done-by / done-at for items that just flipped done.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(role)) return NextResponse.json({ error: 'Staff only' }, { status: 403 })
    await ensureTable()
    const b = await req.json()
    const incoming = Array.isArray(b.items) ? b.items : []
    const me = session.user?.name || session.user?.email || 'Staff'
    const now = new Date().toISOString()

    const prev = (await readRaw(params.id)) || []
    const prevById = new Map(prev.map((p: Item) => [p.id, p]))

    const cleaned: Item[] = incoming
      .map((raw: any) => {
        const id = String(raw.id || Math.random().toString(36).slice(2, 10))
        const text = String(raw.text || '').trim()
        if (!text) return null
        const done = !!raw.done
        const before = prevById.get(id)
        let doneBy = before?.doneBy
        let doneAt = before?.doneAt
        if (done && (!before || !before.done)) { doneBy = me; doneAt = now }
        if (!done) { doneBy = undefined; doneAt = undefined }
        return { id, text: text.slice(0, 120), done, doneBy, doneAt } as Item
      })
      .filter(Boolean)
      .slice(0, 100) as Item[]

    await writeList(params.id, cleaned)
    return NextResponse.json({ ok: true, items: cleaned })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
