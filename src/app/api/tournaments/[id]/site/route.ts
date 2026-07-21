import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}
const key = (id: string) => `tournamentSite:${id}`

// Per-tournament public "event page" content (overview, fees, locations, hotels, rules, contacts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
    return NextResponse.json(row ? JSON.parse(row.value || '{}') : {})
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Sign in to edit' }, { status: 401 })
  try {
    await ensureTable()
    const value = JSON.stringify(await req.json() || {})
    await prisma.appSetting.upsert({
      where: { key: key(params.id) },
      update: { value },
      create: { key: key(params.id), value },
    })
    // Published pages are cached briefly (see `revalidate` on those pages); refresh
    // them now so staff see their edit immediately instead of waiting for expiry.
    for (const p of [`/tournaments/${params.id}/event`, `/tournaments/${params.id}/rules`]) {
      try { revalidatePath(p) } catch { /* cache refresh is best-effort */ }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
