import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

// "Add to queue" — the org keeps a few standing posting times (e.g. Tue 11:00,
// Thu 6:30pm); queueing a post drops it into the next slot nothing else already
// occupies. Slots are stored per org in AppSetting (same pattern as org clubs),
// times are in the org's local wall-clock as entered, resolved on the client.
//
// GET  → { slots, next: [ISO...] }   (next 6 open slot times, computed here)
// PUT  → { slots }                    director only

export type QueueSlot = { dow: number; h: number; m: number } // dow 0=Sun … 6=Sat
const DEFAULT_SLOTS: QueueSlot[] = [{ dow: 2, h: 11, m: 0 }, { dow: 4, h: 18, m: 30 }, { dow: 6, h: 9, m: 0 }]

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
function key(orgId: string) { return `socialQueue:${orgId}` }

async function loadSlots(orgId: string): Promise<{ slots: QueueSlot[]; tzOffsetMin: number }> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } })
  if (!row) return { slots: DEFAULT_SLOTS, tzOffsetMin: 240 }
  try {
    const v = JSON.parse(row.value)
    const slots = Array.isArray(v.slots) ? v.slots.filter((s: any) => Number.isInteger(s.dow) && Number.isInteger(s.h) && Number.isInteger(s.m)) : DEFAULT_SLOTS
    return { slots: slots.length ? slots : DEFAULT_SLOTS, tzOffsetMin: Number.isFinite(v.tzOffsetMin) ? v.tzOffsetMin : 240 }
  } catch { return { slots: DEFAULT_SLOTS, tzOffsetMin: 240 } }
}

// Next `count` slot instants after `from`, skipping any that already have a
// (non-canceled) post at that exact time for this org. tzOffsetMin is the org's
// UTC offset (minutes behind UTC, e.g. 240 for EDT) so "11:00" means 11:00 local.
function nextSlots(slots: QueueSlot[], tzOffsetMin: number, from: Date, taken: Set<number>, count: number): Date[] {
  const out: Date[] = []
  const start = new Date(from.getTime() - tzOffsetMin * 60000) // shift into "local as UTC"
  for (let day = 0; day < 60 && out.length < count; day++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day))
    for (const s of [...slots].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))) {
      if (d.getUTCDay() !== s.dow) continue
      const local = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), s.h, s.m)
      const instant = new Date(local + tzOffsetMin * 60000)
      if (instant <= from || taken.has(instant.getTime())) continue
      out.push(instant)
      if (out.length >= count) break
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ slots: DEFAULT_SLOTS, tzOffsetMin: 240, next: [] })
  const { slots, tzOffsetMin } = await loadSlots(gate.orgId)
  const tz = Number(new URL(req.url).searchParams.get('tz')) // client may pass its own offset
  const offset = Number.isFinite(tz) && tz !== 0 ? tz : tzOffsetMin
  const existing = await prisma.scheduledPost.findMany({
    where: { orgId: gate.orgId, status: { notIn: ['canceled'] }, scheduledFor: { gte: new Date() } },
    select: { scheduledFor: true },
  })
  const taken = new Set(existing.map(e => e.scheduledFor.getTime()))
  return NextResponse.json({ slots, tzOffsetMin: offset, next: nextSlots(slots, offset, new Date(), taken, 6).map(d => d.toISOString()) })
}

export async function PUT(req: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as any
  const slots: QueueSlot[] = (Array.isArray(body.slots) ? body.slots : [])
    .map((s: any) => ({ dow: Number(s.dow), h: Number(s.h), m: Number(s.m) }))
    .filter((s: QueueSlot) => s.dow >= 0 && s.dow <= 6 && s.h >= 0 && s.h <= 23 && s.m >= 0 && s.m <= 59)
  if (!slots.length) return NextResponse.json({ error: 'Add at least one queue time' }, { status: 400 })
  const tzOffsetMin = Number.isFinite(Number(body.tzOffsetMin)) ? Number(body.tzOffsetMin) : 240
  await ensureTable()
  const value = JSON.stringify({ slots, tzOffsetMin })
  await prisma.appSetting.upsert({ where: { key: key(gate.orgId) }, update: { value }, create: { key: key(gate.orgId), value } })
  return NextResponse.json({ ok: true, slots, tzOffsetMin })
}
