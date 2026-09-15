import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { findUnrecordedPayments, recordStripePayment } from '@/lib/stripeReconcile'

// Staff-facing half of the Stripe reconcile (see src/lib/stripeReconcile.ts).
// GET  — what has Stripe charged that we never recorded?
// POST — record one of them, by payment intent id.

export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const raw = Number(new URL(req.url).searchParams.get('days'))
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 180) : 30
  const result = await findUnrecordedPayments(days)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  let body: { piId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const piId = String(body.piId ?? '')
  if (!piId) return NextResponse.json({ error: 'piId required' }, { status: 400 })
  const res = await recordStripePayment(piId)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, recorded: res.recorded })
}
