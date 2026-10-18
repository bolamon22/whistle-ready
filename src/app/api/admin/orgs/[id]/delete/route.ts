import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { deleteOrg, orgImpact } from '@/lib/orgDelete'

// Admin → Organizations → an organization → Delete (lib/orgDelete).
// GET  -> what deleting it would take away, and why it can't be deleted if it can't.
// POST { confirm: its name } -> deletes it.
async function admin() {
  const session = await getServerSession(authOptions)
  return (session?.user as any)?.role === 'admin' ? session : null
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!(await admin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const impact = await orgImpact(params.id)
  return impact ? NextResponse.json(impact) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await admin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const r = await deleteOrg(params.id, String(body?.confirm ?? ''), String(session.user?.name || session.user?.email || ''))
  return r.ok ? NextResponse.json({ ok: true, deleted: r.impact }) : NextResponse.json({ error: r.error }, { status: r.status })
}
