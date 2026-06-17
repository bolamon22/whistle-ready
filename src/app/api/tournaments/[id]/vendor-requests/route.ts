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
