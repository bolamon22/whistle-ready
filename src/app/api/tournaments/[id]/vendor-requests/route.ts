import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Staff: list player-waiver submissions for THIS tournament. Submissions are stored
// per-org (orgFormSubmissions:{orgId}) and tagged with tournamentId.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ submissions: [] }, { status: 401 })
  const id = params.id
  try {
    const t = await prisma.$queryRawUnsafe<any[]>('SELECT orgId FROM "Tournament" WHERE id = ?', id)
    const orgId = t?.[0]?.orgId
    if (!orgId) return NextResponse.json({ submissions: [] })
    const row = await prisma.appSetting.findUnique({ where: { key: `orgFormSubmissions:${orgId}` } })
    const all = row ? JSON.parse(row.value || '[]') : []
    const subs = (Array.isArray(all) ? all : []).filter((s: any) => s.formType === 'vendor' && s?.data?.tournamentId === id)
    return NextResponse.json({ submissions: subs })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

// Staff: delete ONE vendor request (e.g. spam or a test entry). The submissions list is
// shared across the whole org, so we only ever drop an entry that is BOTH formType
// 'vendor' AND tagged with this tournamentId — never anything else in the org's list.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
    const t = await prisma.$queryRawUnsafe<any[]>('SELECT orgId FROM "Tournament" WHERE id = ?', id)
    const orgId = t?.[0]?.orgId
    if (!orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    const key = `orgFormSubmissions:${orgId}`
    const row = await prisma.appSetting.findUnique({ where: { key } })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const all = JSON.parse(row.value || '[]')
    const list: any[] = Array.isArray(all) ? all : []
    const next = list.filter((s: any) => !(s?.id === subId && s?.formType === 'vendor' && s?.data?.tournamentId === id))
    if (next.length === list.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(next) } })
    return NextResponse.json({ ok: true, removed: list.length - next.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
