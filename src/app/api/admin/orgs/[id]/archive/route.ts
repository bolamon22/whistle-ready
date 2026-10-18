import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setArchived } from '@/lib/orgArchive'

// Admin → Organizations → an organization → Archive / Restore (lib/orgArchive).
// POST { archived: true | false } -> { ok, archivedAt }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const r = await setArchived(params.id, body?.archived === true, String(session?.user?.name || session?.user?.email || ''))
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status })
}
