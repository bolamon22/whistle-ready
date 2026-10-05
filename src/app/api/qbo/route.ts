import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { tournamentOrgId, orgById } from '@/lib/org'
import {
  verifiedConnection, qboSettings, saveQboSettings, qboStates, backfillPreview, syncNow, syncPending, setInvoiceNumber, markRefundEntered,
} from '@/lib/qboSync'

// "Sunshine Events Group, LLC" and "Sunshine Events Group" are the same company.
const sameName = (a: string, b: string) => {
  const n = (x: string) => x.toLowerCase().replace(/\b(llc|inc|co|corp|ltd)\b/g, '').replace(/[^a-z0-9]/g, '')
  const x = n(a), y = n(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

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
  const conn = await verifiedConnection(g.orgId, [g.userId])
  const { settings, regs } = await qboStates(g.orgId, tournamentId)
  const preview = req.nextUrl.searchParams.get('preview') ? await backfillPreview(g.orgId, tournamentId, g.userId) : null
  const org = await orgById(g.orgId)
  return NextResponse.json({
    connection: conn.ok
      ? { ok: true, company: conn.companyName, org: org?.name || '', sameCompany: sameName(conn.companyName, org?.name || '') }
      : { ok: false, reason: conn.reason, message: conn.message },
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
    // Turning it on fixes the company: the sync never writes to any other.
    const cur = await qboSettings(g.orgId)
    if (cur.realmId) await saveQboSettings(g.orgId, { realmId: '' })
    const conn = await verifiedConnection(g.orgId, [g.userId])
    if (!conn.ok) {
      if (cur.realmId) await saveQboSettings(g.orgId, { realmId: cur.realmId })
      return NextResponse.json({ error: conn.message }, { status: 503 })
    }
    const s = await saveQboSettings(g.orgId, { enabled: true, startedAt: cur.startedAt || new Date().toISOString(), userId: g.userId, realmId: conn.realmId, companyName: conn.companyName })
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
    // Give a registration its QuickBooks invoice number: linked now if QuickBooks
    // answers, otherwise saved for the PDF and linked by the sync later.
    const docNumber = String(body.docNumber || '').trim()
    if (regIds.length !== 1 || !/^\d{1,21}$/.test(docNumber)) return NextResponse.json({ error: 'Pick a registration and an invoice number' }, { status: 400 })
    const r = await setInvoiceNumber(g.orgId, regIds[0], docNumber, { userId: g.userId, date: String(body.date || '') })
    return NextResponse.json(r.ok ? { ok: true, linked: !!r.linked, message: r.message } : { error: r.message }, { status: r.ok ? 200 : 400 })
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
