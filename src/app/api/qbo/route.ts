import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import {
  connectionFor, qboSettings, saveQboSettings, qboStates, backfillPreview, syncNow, syncPending, linkExisting, markRefundEntered,
} from '@/lib/qboSync'

// The registrations page's QuickBooks panel (lib/qboSync): where the sync
// stands for an event, turning it on, the backfill list and sending it, "Sync
// now", linking an invoice made by hand, and refunds entered by hand.
// For staff who can see money, and only for their own org's events.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function gate(tournamentId: string) {
  const g = await requireMoney()
  if (!g.ok) return { ok: false as const, res: g.res }
  const orgId = tournamentId ? await tournamentOrgId(tournamentId) : null
  if (!orgId) return { ok: false as const, res: NextResponse.json({ error: 'Event not found' }, { status: 404 }) }
  if (g.role !== 'admin' && g.orgId !== orgId) return { ok: false as const, res: NextResponse.json({ error: 'Not your event' }, { status: 403 }) }
  return { ok: true as const, orgId, userId: g.userId }
}

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get('tournamentId') || ''
  const g = await gate(tournamentId)
  if (!g.ok) return g.res
  const conn = await connectionFor(g.orgId, [g.userId])
  const { settings, regs } = await qboStates(g.orgId, tournamentId)
  const preview = req.nextUrl.searchParams.get('preview') ? await backfillPreview(g.orgId, tournamentId, g.userId) : null
  return NextResponse.json({
    connection: conn.ok ? { ok: true, company: conn.companyName } : { ok: false, reason: conn.reason, message: conn.message },
    settings: { enabled: settings.enabled, startedAt: settings.startedAt, lastRunAt: settings.lastRunAt || '', lastProblem: settings.lastProblem || '' },
    regs,
    preview,
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* checked below */ }
  const tournamentId = String(body.tournamentId || '')
  const g = await gate(tournamentId)
  if (!g.ok) return g.res
  const action = String(body.action || '')
  // A registration named in the request must belong to this event.
  const regIds = (Array.isArray(body.regIds) ? body.regIds : body.registrationId ? [body.registrationId] : []).map(String).filter(Boolean)
  if (regIds.length) {
    const rows: { id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM "TeamRegistration" WHERE tournamentId = ? AND id IN (${regIds.map(() => '?').join(',')})`, tournamentId, ...regIds)
    if (rows.length !== new Set(regIds).size) return NextResponse.json({ error: 'Registration not in this event' }, { status: 400 })
  }

  if (action === 'enable') {
    const conn = await connectionFor(g.orgId, [g.userId])
    if (!conn.ok) return NextResponse.json({ error: conn.message }, { status: 503 })
    const cur = await qboSettings(g.orgId)
    const s = await saveQboSettings(g.orgId, { enabled: true, startedAt: cur.startedAt || new Date().toISOString(), userId: g.userId })
    return NextResponse.json({ ok: true, settings: { enabled: s.enabled, startedAt: s.startedAt } })
  }
  if (action === 'disable') {
    const s = await saveQboSettings(g.orgId, { enabled: false })
    return NextResponse.json({ ok: true, settings: { enabled: s.enabled, startedAt: s.startedAt } })
  }
  if (action === 'run') {
    const r = await syncPending(g.orgId)
    if (r.problem) return NextResponse.json({ error: r.problem }, { status: 503 })
    return NextResponse.json({ ok: true, ...r })
  }
  if (action === 'sync' || action === 'backfill') {
    if (!regIds.length) return NextResponse.json({ error: 'Pick at least one registration' }, { status: 400 })
    if (regIds.length > 100) return NextResponse.json({ error: 'Up to 100 at a time' }, { status: 400 })
    const r = await syncNow(g.orgId, regIds, { userId: g.userId })
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.busy ? 409 : 503 })
    return NextResponse.json(r)
  }
  if (action === 'link') {
    const docNumber = String(body.docNumber || '').trim()
    if (regIds.length !== 1 || !/^\d{1,21}$/.test(docNumber)) return NextResponse.json({ error: 'Pick a registration and an invoice number' }, { status: 400 })
    const r = await linkExisting(g.orgId, regIds[0], docNumber, g.userId)
    return NextResponse.json(r.ok ? { ok: true, message: r.message } : { error: r.message }, { status: r.ok ? 200 : 400 })
  }
  if (action === 'refundEntered') {
    const paymentId = String(body.paymentId || '')
    const rows: { id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT p.id FROM "RegistrationPayment" p JOIN "TeamRegistration" r ON r.id = p.registrationId WHERE p.id = ? AND r.tournamentId = ?`, paymentId, tournamentId)
    if (!rows.length) return NextResponse.json({ error: 'Payment not in this event' }, { status: 400 })
    await markRefundEntered(paymentId)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
