import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { syncNow } from '@/lib/qboSync'

// One registration to QuickBooks now (the card's QuickBooks chip). The work is
// lib/qboSync's: it used to be done here, and left the invoice number blank
// (the company numbers its own invoices, so QuickBooks won't), used an item
// the company doesn't have, and let any signed-in user run it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const g = await requireMoney()
  if (!g.ok) return g.res
  let registrationId = ''
  try { registrationId = String((await req.json())?.registrationId || '') } catch { /* checked below */ }
  const rows: { tournamentId: string }[] = registrationId
    ? await prisma.$queryRawUnsafe(`SELECT tournamentId FROM "TeamRegistration" WHERE id = ?`, registrationId)
    : []
  if (!rows.length) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  const orgId = await tournamentOrgId(rows[0].tournamentId)
  if (!orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (g.role !== 'admin' && g.orgId !== orgId) return NextResponse.json({ error: 'Not your event' }, { status: 403 })
  const r = await syncNow(orgId, [registrationId], { userId: g.userId })
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.busy ? 409 : 503 })
  const one = r.results[0]
  if (one?.status === 'error') return NextResponse.json({ error: one.message, result: one }, { status: 502 })
  return NextResponse.json({ ok: true, result: one, docNumber: one?.docNumber || '' })
}
