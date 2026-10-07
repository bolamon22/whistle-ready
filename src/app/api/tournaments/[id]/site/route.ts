import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
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

// Which copy of the content a page has: a fingerprint of the stored text. GET sends
// it in the X-Content-Rev header and a save must send it back as X-Base-Rev.
// Tournament setup saves the whole content on every Save Changes, so a page opened
// before someone else saved used to put its old copy back over theirs (Monster
// Mash lost its 10 nearby hotels twice that way, Oct 7 2026). A save from an older
// copy now gets 409 with the stored copy, and the page merges its edits into it and
// saves again (lib/eventContentMerge.ts).
const revOf = (stored: string) => createHash('sha1').update(stored).digest('hex').slice(0, 16)

function conflict(stored: string) {
  let current: unknown = {}
  try { current = JSON.parse(stored || '{}') } catch { /* keep {} */ }
  return NextResponse.json(
    { error: 'This event page was saved somewhere else since you opened it. Reload to get the latest.', current, rev: revOf(stored) },
    { status: 409 },
  )
}

// Per-tournament public "event page" content (overview, fees, locations, hotels, rules, contacts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
    return NextResponse.json(row ? JSON.parse(row.value || '{}') : {}, { headers: { 'X-Content-Rev': revOf(row?.value ?? '') } })
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
    const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
    const stored = row?.value ?? ''
    if (req.headers.get('x-base-rev') !== revOf(stored)) return conflict(stored)
    // Write only over the copy just checked, in case another save lands in between.
    const written = row
      ? (await prisma.appSetting.updateMany({ where: { key: key(params.id), value: stored }, data: { value } })).count
      : await prisma.appSetting.create({ data: { key: key(params.id), value } }).then(() => 1, () => 0)
    if (!written) {
      const now = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
      return conflict(now?.value ?? '')
    }
    // Published pages are cached briefly (see `revalidate` on those pages); refresh
    // them now so staff see their edit immediately instead of waiting for expiry.
    for (const p of [`/tournaments/${params.id}/event`, `/tournaments/${params.id}/rules`, `/tournaments/${params.id}/hotels`]) {
      try { revalidatePath(p) } catch { /* cache refresh is best-effort */ }
    }
    return NextResponse.json({ ok: true, rev: revOf(value) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
