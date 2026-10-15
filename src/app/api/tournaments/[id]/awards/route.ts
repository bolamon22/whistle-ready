import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'

// Awards and champion photos, one row per division (Bo, Oct 14 2026: the field director
// makes sure "awards are given out [and the] photo of champs [is] taken"). A division
// with a championship game is keyed by that game; a pool-play-only division by its name,
// so its winner still gets medals and a photo. Any staff login can tick a row (field ops
// usually hands out the medals); the record keeps who and when.
// AppSetting `awards:<tournamentId>` = { [key]: { awards, photo, photoUrl, note, by, at } }.

const key = (id: string) => `awards:${id}`
type Mark = { awards?: boolean; photo?: boolean; photoUrl?: string; note?: string; by?: string; at?: string }

async function ensure() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch { /* exists */ }
}
async function read(id: string): Promise<Record<string, Mark>> {
  try { const r = await prisma.appSetting.findUnique({ where: { key: key(id) } }); const v = r ? JSON.parse(r.value) : {}; return v && typeof v === 'object' ? v : {} } catch { return {} }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  await ensure()
  const games = await prisma.game.findMany({ where: { tournamentId: params.id, isCanceled: false }, select: { id: true, division: true, gameNumber: true, date: true, startTime: true, location: true, team1: true, team2: true, score1: true, score2: true, isChampionship: true } })
  const marks = await read(params.id)
  const divisions = Array.from(new Set(games.map(g => g.division).filter(Boolean))).sort()
  const rows = divisions.flatMap(d => {
    const champs = games.filter(g => g.division === d && g.isChampionship)
    if (!champs.length) return [{ key: `div:${d}`, division: d, game: null, mark: marks[`div:${d}`] || {} }]
    return champs.map(g => ({ key: g.id, division: d, game: g, mark: marks[g.id] || {} }))
  })
  return NextResponse.json({ rows })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const k = String(b.key || '').slice(0, 200)
  if (!k) return NextResponse.json({ error: 'key required' }, { status: 400 })
  await ensure()
  const all = await read(params.id)
  const cur = all[k] || {}
  const next: Mark = { ...cur, by: String(gate.session?.user?.name || gate.session?.user?.email || 'Staff'), at: new Date().toISOString() }
  if (typeof b.awards === 'boolean') next.awards = b.awards
  if (typeof b.photo === 'boolean') next.photo = b.photo
  if (typeof b.photoUrl === 'string') { const u = b.photoUrl.slice(0, 300); if (u && !u.startsWith('/api/img/')) return NextResponse.json({ error: 'Upload the photo here' }, { status: 400 }); next.photoUrl = u; if (u) next.photo = true }
  if (typeof b.note === 'string') next.note = b.note.replace(/\s+/g, ' ').trim().slice(0, 200)
  all[k] = next
  const value = JSON.stringify(all)
  await prisma.appSetting.upsert({ where: { key: key(params.id) }, create: { key: key(params.id), value }, update: { value } })
  return NextResponse.json({ ok: true, mark: next })
}
