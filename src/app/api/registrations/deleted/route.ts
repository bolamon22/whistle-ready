import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { ensurePaymentGuard } from '@/lib/paymentGuard'

export async function GET(req: NextRequest) {
  // Auth (Aug 2026): staff only — was previously callable with no auth and
  // returned full contact info for a whole tournament.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([])

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  // Hard-purge anything older than 30 days (Bo's safety window, Aug 2026) --
  // EXCEPT anything money ever touched.
  //
  // RegistrationPayment cascades on delete, so purging a registration destroys
  // its charges and its refunds with it, permanently. Tampa Tarpons pulled out of
  // Monster Mash, was refunded $1,095, and the obvious next step was to delete the
  // entry -- which would have set a timer on the only record of that refund, to go
  // off the next time anyone opened this panel. A bank can ask about an ACH refund
  // long after 30 days, and "we deleted it" is not an answer (Bo, Sep 28 2026).
  //
  // So a registration with any payment row is kept indefinitely. Nothing else about
  // it changes: it stays soft-deleted, out of every count, roster and report. It
  // simply stops being disposable.
  // Done as count-then-delete-by-id rather than a relation filter inside
  // deleteMany: this is the code path that destroys data permanently, and a
  // relation filter I cannot run here is not something to find out about in
  // production. Counting first is explicit and reads the same way in a year.
  // Wrapped, too, so a failure in housekeeping can never take the panel down --
  // and a failure means nothing is purged, which is the right way to fail.
  try {
    const stale = await prisma.teamRegistration.findMany({
      where: { tournamentId, deletedAt: { not: null, lt: cutoff } },
      select: { id: true, _count: { select: { payments: true } } },
    })
    const purgeable = stale.filter(r => r._count.payments === 0).map(r => r.id)
    if (purgeable.length) {
      await prisma.teamRegistration.deleteMany({ where: { id: { in: purgeable } } })
    }
  } catch (e) {
    console.error('Deleted-registration purge skipped:', e)
  }

  // Payments come back with the row now. They were left out before, so a deleted
  // registration's money was invisible from the day it was deleted -- the panel
  // could not answer "what did we refund them" even while the row still existed.
  // Bare include pulls every column, stripeIntentId among them, so the guard has
  // to have run or Prisma selects a column the database may not have yet.
  await ensurePaymentGuard()
  const deleted = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: { not: null } },
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
    orderBy: { deletedAt: 'desc' },
  })
  // Merged duplicates are soft-deleted too; say where they went so nobody "restores" an empty shell.
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT d.id, d."mergedIntoId" AS mergedIntoId, t."clubName" AS mergedIntoName
         FROM "TeamRegistration" d LEFT JOIN "TeamRegistration" t ON t.id = d."mergedIntoId"
        WHERE d."tournamentId" = ? AND d."deletedAt" IS NOT NULL AND d."mergedIntoId" <> ''`, tournamentId)
    const byId = new Map((rows || []).map(r => [r.id, r]))
    return NextResponse.json(deleted.map(d => ({ ...d, mergedIntoId: byId.get(d.id)?.mergedIntoId || '', mergedIntoName: byId.get(d.id)?.mergedIntoName || '' })))
  } catch {
    return NextResponse.json(deleted)
  }
}
