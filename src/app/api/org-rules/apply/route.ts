import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function targetOrgId(req: NextRequest, session: any): string | null {
  const role = session?.user?.role
  const paramOrg = new URL(req.url).searchParams.get('org')
  if (role === 'admin' && paramOrg) return paramOrg
  return session?.user?.orgId ?? null
}

// GET: map of tournamentId -> rulesSourceId for the org (powers pre-checked apply UI).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ links: {} })
  try {
    const ts = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM "Tournament" WHERE orgId = ?', orgId)
    const links: Record<string, string> = {}
    for (const t of ts || []) {
      const row = await prisma.appSetting.findUnique({ where: { key: `tournamentSite:${t.id}` } }).catch(() => null)
      if (row) { try { const c = JSON.parse((row as any).value || '{}'); if (c.rulesSourceId) links[String(t.id)] = c.rulesSourceId } catch {} }
    }
    return NextResponse.json({ links })
  } catch { return NextResponse.json({ links: {} }) }
}

// POST { setId, tournamentIds, detach? } — links (or clears) a rule set on each event.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  try {
    const { setId, tournamentIds, detach } = await req.json() as any
    const ids: string[] = Array.isArray(tournamentIds) ? tournamentIds.map(String) : []
    let applied = 0
    for (const id of ids) {
      const t = await prisma.$queryRawUnsafe<any[]>('SELECT orgId FROM "Tournament" WHERE id = ?', id)
      if (!t?.[0] || String(t[0].orgId) !== String(orgId)) continue
      const key = `tournamentSite:${id}`
      const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
      let c: any = {}
      try { c = JSON.parse((row as any)?.value || '{}') } catch {}
      if (detach) delete c.rulesSourceId
      else c.rulesSourceId = String(setId)
      await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(c) }, create: { key, value: JSON.stringify(c) } })
      applied++
    }
    return NextResponse.json({ ok: true, applied })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'error' }, { status: 500 }) }
}
