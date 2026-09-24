// Does what our books say clubs have paid match what Stripe actually charged?
//
// The companion to /api/payments/reconcile, which only ever asked the opposite
// question -- "did Stripe take money we never recorded". That check was green
// the whole time LaxManiax's Fall Classic showed a $1,495 credit that did not
// exist, because the error was an EXTRA row, not a missing one (Sep 2026).
//
// Read-only. Fixing anything it finds is a deliberate act on the registrations
// page, not something this route does on its own.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { auditPayments } from '@/lib/stripeReconcile'
import { ensurePaymentGuard } from '@/lib/paymentGuard'

export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res

  const sp = new URL(req.url).searchParams
  const raw = Number(sp.get('days'))
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 365) : 180

  // Named events, or every event that actually holds a payment -- scanning the
  // whole tournament table would walk years of finished seasons for nothing.
  let ids = sp.getAll('tournamentId').filter(Boolean)
  if (!ids.length) {
    const rows: { tournamentId: string }[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT r."tournamentId" AS tournamentId
         FROM "RegistrationPayment" p
         JOIN "TeamRegistration" r ON r.id = p."registrationId"
        WHERE r."deletedAt" IS NULL`)
    ids = rows.map(r => String(r.tournamentId)).filter(Boolean)
  }

  // Also reports whether the unique index that PREVENTS duplicates is actually
  // in place. It can fail to build if rows are already duplicated, and a guard
  // that quietly is not guarding is worse than none.
  const guard = await ensurePaymentGuard()

  const result = await auditPayments(ids, days)
  const problems = result.events.reduce((n, e) => n + e.problems.length, 0)
  const overstated = result.events.reduce(
    (sum, e) => sum + e.problems.reduce((s, p) => s + p.overstatedBy, 0), 0)

  return NextResponse.json(
    { ...result, guard, summary: { events: result.events.length, problems, overstated } },
    { status: result.ok ? 200 : 502 },
  )
}
