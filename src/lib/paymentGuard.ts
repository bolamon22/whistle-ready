// ONE STRIPE PAYMENT, ONE ROW -- enforced by the database, not by looking first.
//
// WHAT WENT WRONG. Four separate paths can record a team's Stripe payment: the
// checkout-return PATCH, two webhook events, and the reconcile sweep. Each one
// asked "is this intent already recorded?" and wrote if the answer was no. That
// is check-then-act, and on 18 Sep 2026 two of them interleaved: both checks ran
// before either insert landed, both came back clean, both wrote. LaxManiax's
// Fall Classic then read $5,980 paid against a $4,485 invoice off a single
// $1,539.85 charge, and their club director opened a portal showing a $1,495
// credit he had never earned.
//
// No amount of re-checking fixes that, because the gap between the check and the
// write is where the race lives. The only thing that closes it is the database
// refusing the second row, so that is what this does: a UNIQUE index across
// (registrationId, stripeIntentId). The second writer now gets a constraint
// violation, which recordTeamPayment() reads as "someone beat me to it" -- the
// outcome we wanted all along.
//
// The index is PARTIAL -- `WHERE "stripeIntentId" <> ''` -- because a club may
// legitimately pay by check three times, and those rows carry no intent at all.
// Only Stripe-backed rows are constrained.
import { prisma } from './db'

export type GuardState = {
  column: boolean
  index: boolean
  backfilled: number
  /** Rows already duplicated when we tried to build the index; it cannot exist
   *  until they are cleaned up, and a silent failure here would mean the guard
   *  quietly is not guarding. Surfaced by /api/payments/audit. */
  duplicatesBlocking: number
}

let building: Promise<GuardState> | null = null

/** Idempotent, memoized per process. Awaited by every payment write path. */
export function ensurePaymentGuard(): Promise<GuardState> {
  if (!building) building = build()
  return building
}

async function build(): Promise<GuardState> {
  const state: GuardState = { column: false, index: false, backfilled: 0, duplicatesBlocking: 0 }

  // Raw ALTER rather than a migration, the same way every other late column on
  // this schema was added (see ensureRegistrationColumns in api/registrations).
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "RegistrationPayment" ADD COLUMN "stripeIntentId" TEXT NOT NULL DEFAULT ''`)
  } catch { /* already there, which is the normal case */ }

  try {
    await prisma.$queryRawUnsafe(`SELECT "stripeIntentId" FROM "RegistrationPayment" LIMIT 1`)
    state.column = true
  } catch {
    return state           // no column, no guard -- writers fall back to plain inserts
  }

  // Every historical row put the intent in its note, so the column can be filled
  // from what is already there and the index covers the back catalogue too.
  try {
    const rows: { id: unknown; notes: unknown }[] = await prisma.$queryRawUnsafe(
      `SELECT id, notes FROM "RegistrationPayment" WHERE "stripeIntentId" = '' AND notes LIKE '%pi/_%' ESCAPE '/'`)
    for (const r of rows || []) {
      const pi = /pi_[A-Za-z0-9]+/.exec(String(r.notes || ''))?.[0]
      if (!pi) continue
      await prisma.$executeRawUnsafe(
        `UPDATE "RegistrationPayment" SET "stripeIntentId" = ? WHERE id = ?`, pi, String(r.id))
      state.backfilled++
    }
  } catch { /* best effort: a partial backfill still guards everything new */ }

  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationPayment_reg_intent_key"
         ON "RegistrationPayment" ("registrationId", "stripeIntentId")
        WHERE "stripeIntentId" <> ''`)
    state.index = true
  } catch {
    try {
      const d: { n: unknown }[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM (
           SELECT "registrationId", "stripeIntentId" FROM "RegistrationPayment"
            WHERE "stripeIntentId" <> '' GROUP BY 1, 2 HAVING COUNT(*) > 1)`)
      state.duplicatesBlocking = Number(d?.[0]?.n || 0)
    } catch { /* leave it at 0; the index flag already says it is not active */ }
  }

  return state
}

/** Both shapes the drivers use for "you broke a unique index". */
function isDuplicateRow(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  if (code === 'P2002' || code === 'SQLITE_CONSTRAINT_UNIQUE') return true
  return /unique constraint/i.test(String((e as { message?: string })?.message || ''))
}

/**
 * Record one Stripe-backed team payment.
 *
 * Returns false when the row already existed -- which is a success, not an
 * error: it means another path recorded the same intent first. Callers should
 * use it to decide whether to fire the "payment received" notification, so a
 * club is not pinged twice for one payment.
 */
export async function recordTeamPayment(row: {
  registrationId: string
  amount: number
  method: string
  receivedAt: string
  notes: string
  /** The Stripe PaymentIntent id. Empty means a manual row, which is unguarded. */
  piId: string
}): Promise<boolean> {
  const guard = await ensurePaymentGuard()

  // The pre-flight check stays. It is no longer what makes this correct -- the
  // index is -- but it saves a thrown error on the overwhelmingly common path
  // where the payment really was already recorded minutes ago.
  if (row.piId) {
    const existing = await prisma.registrationPayment.findFirst({
      where: { registrationId: row.registrationId, notes: { contains: row.piId } },
      select: { id: true },
    })
    if (existing) return false
  }

  const data: Record<string, unknown> = {
    registrationId: row.registrationId,
    amount: row.amount,
    method: row.method,
    checkNumber: '',
    receivedAt: row.receivedAt,
    notes: row.notes,
  }
  if (guard.column) data.stripeIntentId = row.piId

  try {
    await prisma.registrationPayment.create({ data: data as never })
    return true
  } catch (e) {
    if (isDuplicateRow(e)) return false      // the race, refused by the database
    throw e
  }
}
