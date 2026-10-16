import { NextRequest, NextResponse } from 'next/server'
import { requireMoney } from '@/lib/apiAuth'
import { findUnrecordedPayments, recordStripePayment } from '@/lib/stripeReconcile'

// Staff-facing half of the Stripe reconcile (see src/lib/stripeReconcile.ts).
// GET  — what has Stripe charged that we never recorded?
// POST — record one of them, by payment intent id.
//
// Money, so admins and directors only (it said any staff login, assigners included).
// A director sees and records only their own organization's payments: the Stripe
// account is the platform's, and other organizations' events can be on it (lib/orgScope).
const mine = (gate: { session?: any; orgId: string | null }) => (g: { orgId?: string | null }) =>
  gate.session?.user?.role === 'admin' || (!!g.orgId && g.orgId === gate.orgId)

export async function GET(req: NextRequest) {
  const gate = await requireMoney(); if (!gate.ok) return gate.res
  const raw = Number(new URL(req.url).searchParams.get('days'))
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 180) : 30
  const result = await findUnrecordedPayments(days)
  return NextResponse.json({ ...result, gaps: result.gaps.filter(mine(gate)) }, { status: result.ok ? 200 : 502 })
}

export async function POST(req: NextRequest) {
  const gate = await requireMoney(); if (!gate.ok) return gate.res
  let body: { piId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const piId = String(body.piId ?? '')
  if (!piId) return NextResponse.json({ error: 'piId required' }, { status: 400 })
  // A director records only a payment on their own organization's list.
  if (gate.session?.user?.role !== 'admin') {
    const list = await findUnrecordedPayments(180)
    if (!list.gaps.some(g => g.piId === piId && mine(gate)(g))) return NextResponse.json({ error: 'Not one of your organization’s payments' }, { status: 404 })
  }
  const res = await recordStripePayment(piId)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, recorded: res.recorded })
}
