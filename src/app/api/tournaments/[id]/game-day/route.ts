import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireDirector, orgGate } from '@/lib/apiAuth'
import { gameDayKey, inGameDayWindow, gameDayWindow } from '@/lib/gameDay'

export const dynamic = 'force-dynamic'

// Game day mode for one event (lib/gameDay). GET is public: the phone asks whether to
// open the Game day screen, and gets the organization's next event for the
// "Looking for the next one?" line. POST (director) turns the mode off or back on.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT id, name, startDate, endDate, orgId FROM "Tournament" WHERE id = ?', params.id)
    const t = rows?.[0]
    if (!t) return NextResponse.json({ active: false }, { status: 404 })
    const set = await prisma.appSetting.findUnique({ where: { key: gameDayKey(params.id) } }).catch(() => null)
    const off = set?.value === 'off'
    const start = String(t.startDate || ''), end = String(t.endDate || '')
    let next: any = null
    if (t.orgId) {
      const after = (end || start).slice(0, 10)
      const n: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ? AND id <> ? AND startDate > ? AND TRIM(COALESCE(name,'')) <> '' ORDER BY startDate LIMIT 1`,
        String(t.orgId), params.id, after).catch(() => [])
      if (n?.[0]) next = { id: String(n[0].id), name: String(n[0].name), startDate: String(n[0].startDate || ''), endDate: String(n[0].endDate || '') }
    }
    // The event page's hero photo, faded behind the Game day header so phones see the
    // same event they know from the full site. A stored data: URL is skipped (too big
    // to send on every visit); uploaded photos are links.
    let heroImage = ''
    try {
      const site = await prisma.appSetting.findUnique({ where: { key: `tournamentSite:${params.id}` } })
      const h = site ? JSON.parse(site.value || '{}')?.heroImage : ''
      if (typeof h === 'string' && h && !h.startsWith('data:')) heroImage = h
    } catch { /* no photo */ }
    const w = gameDayWindow(start, end)
    const body = { active: inGameDayWindow(start, end) && !off, inWindow: inGameDayWindow(start, end), off, from: w?.from || '', to: w?.to || '', name: String(t.name || ''), heroImage, next }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
  } catch {
    return NextResponse.json({ active: false })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const refused = await orgGate(gate, params.id)
  if (refused) return refused
  const body = await req.json().catch(() => ({}))
  const value = body?.on === false ? 'off' : 'auto'
  await prisma.appSetting.upsert({ where: { key: gameDayKey(params.id) }, create: { key: gameDayKey(params.id), value }, update: { value } })
  return NextResponse.json({ ok: true, off: value === 'off' })
}
