import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// Reel maker settings saved to finish later (Bo, Oct 18 2026: "save a draft here too").
// One AppSetting row per org, `reelDrafts:{orgId}`, holding the list as JSON: which cleared
// players, their looks, length, song, posting day and cover. Nothing is on the calendar
// until the Reel is made. GET lists; POST saves (same id = overwrite); DELETE ?id removes.
export const runtime = 'nodejs'
const MAX = 50
const key = (orgId: string) => `reelDrafts:${orgId}`
export type ReelDraft = { id: string; label: string; savedAt: string; playerIds: string[]; look: string; looks?: string[]; setup: Record<string, unknown> }

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
async function read(orgId: string): Promise<ReelDraft[]> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } }).catch(() => null)
  try { const v = row ? JSON.parse(row.value) : []; return Array.isArray(v) ? v : [] } catch { return [] }
}
async function write(orgId: string, list: ReelDraft[]) {
  const value = JSON.stringify(list.slice(0, MAX))
  await prisma.appSetting.upsert({ where: { key: key(orgId) }, update: { value }, create: { key: key(orgId), value } })
}
const str = (v: unknown, n: number) => String(v ?? '').slice(0, n)
const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(x => str(x, 64)).filter(x => /^[\w-]{4,64}$/.test(x)).slice(0, 4)

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ drafts: [] })
  return NextResponse.json({ drafts: await read(gate.orgId) })
}

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const b = await req.json().catch(() => ({} as any))
  const playerIds = ids(b.playerIds)
  if (!playerIds.length) return NextResponse.json({ error: 'No players' }, { status: 400 })
  const s = b.setup && typeof b.setup === 'object' ? b.setup : {}
  const setup = {
    picks: (Array.isArray(s.picks) ? s.picks : []).map((x: unknown) => str(x, 40)).slice(0, 4),
    order: (Array.isArray(s.order) ? s.order : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < 4).slice(0, 4),
    len: Number(s.len) || 0, song: str(s.song, 60), day: /^\d{4}-\d{2}-\d{2}$/.test(String(s.day)) ? String(s.day) : '', coverIdx: Math.max(0, Math.min(12, Number(s.coverIdx) || 0)),
    // The squad's parts in play order, up to two or more per player (ReelMaker "+ Look").
    seq: (Array.isArray(s.seq) ? s.seq : []).map((x: any) => ({ i: Number(x?.i), style: str(x?.style, 40) })).filter((x: { i: number; style: string }) => Number.isInteger(x.i) && x.i >= 0 && x.i < 4 && x.style).slice(0, 12),
  }
  const id = /^[\w-]{4,40}$/.test(String(b.id || '')) ? String(b.id) : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  const draft: ReelDraft = { id, label: str(b.label, 120) || 'Reel', savedAt: new Date().toISOString(), playerIds, look: str(b.look, 40), ...(Array.isArray(b.looks) ? { looks: b.looks.map((x: unknown) => str(x, 40)).slice(0, 4) } : {}), setup }
  const drafts = [draft, ...(await read(gate.orgId)).filter(d => d.id !== id)]
  await write(gate.orgId, drafts)
  return NextResponse.json({ drafts, draft })
}

export async function DELETE(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const drafts = (await read(gate.orgId)).filter(d => d.id !== id)
  await write(gate.orgId, drafts)
  return NextResponse.json({ drafts })
}
