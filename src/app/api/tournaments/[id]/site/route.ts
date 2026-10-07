import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'

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

// Saving needs the Builder's own permission (tournament_setup: directors and
// admins) and the event's org. It used to take any signed-in account, and anyone
// can make a coach, parent or club-director account through /api/auth/register,
// so a stranger could rewrite an event page, including the hotel buttons families
// book through (Oct 7 2026).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireFeature('tournament_setup')
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId !== orgId) return NextResponse.json({ error: 'Not your organization' }, { status: 403 })
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
    for (const p of [`/tournaments/${params.id}/event`, `/tournaments/${params.id}/rules`, `/tournaments/${params.id}/hotels`]) {
      try { revalidatePath(p) } catch { /* cache refresh is best-effort */ }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
