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
  /** WHICH rows are blocking it. A count on its own is not actionable -- the
   *  same complaint this file makes about the old reconcile check. The blocking
   *  pair can sit on a soft-deleted registration, where no page will ever show
   *  it, so the only way to find it is to name it here. Read-only; cleaning it
   *  up stays a deliberate act. */
  duplicateRows: {
    registrationId: string
    clubName: string
    tournamentId: string
    deleted: boolean
    stripeIntentId: string
    rows: { id: string; amount: number; method: string; receivedAt: string; notes: string }[]
  }[]
}

let building: Promise<GuardState> | null = null

/** Idempotent, memoized per process. Awaited by every payment write path. */
export function ensurePaymentGuard(): Promise<GuardState> {
  if (!building) building = build()
  return building
}

async function build(): Promise<GuardState> {
  const state: GuardState = { column: false, index: false, backfilled: 0, duplicatesBlocking: 0, duplicateRows: [] }

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

    // And WHICH ones. The registration is joined in without a deletedAt filter
    // on purpose: a blocking pair on a deleted registration is invisible to
    // every page in the app, so a count alone leaves nowhere to look.
    try {
      const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
        `SELECT p.id, p."registrationId", p."stripeIntentId", p.amount, p.method,
                p."receivedAt", p.notes, r."clubName", r."tournamentId", r."deletedAt"
           FROM "RegistrationPayment" p
           JOIN "TeamRegistration" r ON r.id = p."registrationId"
          WHERE p."stripeIntentId" <> ''
            AND (p."registrationId", p."stripeIntentId") IN (
                  SELECT "registrationId", "stripeIntentId" FROM "RegistrationPayment"
                   WHERE "stripeIntentId" <> '' GROUP BY 1, 2 HAVING COUNT(*) > 1)
          ORDER BY p."registrationId", p."stripeIntentId", p."receivedAt"
          LIMIT 200`)
      const groups = new Map<string, GuardState['duplicateRows'][number]>()
      for (const r of rows || []) {
        const key = `${String(r.registrationId)}|${String(r.stripeIntentId)}`
        if (!groups.has(key)) groups.set(key, {
          registrationId: String(r.registrationId),
          clubName: String(r.clubName || ''),
          tournamentId: String(r.tournamentId || ''),
          deleted: r.deletedAt != null,
          stripeIntentId: String(r.stripeIntentId),
          rows: [],
        })
        groups.get(key)!.rows.push({
          id: String(r.id),
          amount: Number(r.amount) || 0,
          method: String(r.method || ''),
          receivedAt: String(r.receivedAt || ''),
          notes: String(r.notes || '').slice(0, 200),
        })
      }
      state.duplicateRows = [...groups.values()]
    } catch { /* detail is a nicety; the count and the index flag still stand */ }
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
/**
 * Follow a merged-away registration to the one that survived.
 *
 * WHY. A Stripe PaymentIntent carries the registration id that existed when the
 * club paid, frozen in its metadata. Merge that registration into another and the
 * id in Stripe still names the dead row -- nothing goes back and rewrites metadata
 * on an intent already in flight. ACH makes this routine rather than rare: the
 * money takes four business days, long enough for staff to merge a duplicate in
 * between.
 *
 * Miami Thunder, Sep 2026: paid $1,495 by bank transfer on the 25th, their two
 * duplicate registrations were merged the same week, and the intent was still
 * processing. Without this the payment lands on the deleted row and the club reads
 * $1,495 still owing with the money already in the bank.
 *
 * /pay already does this -- see mergedInto in pay-info and the redirect in
 * pay/[regId]. The recorders never got the same treatment.
 *
 * Follows a chain (A merged into B merged into C) with a hop cap and a seen-set so
 * a cycle returns instead of spinning. mergedIntoId is a lazy raw ALTER, so on a
 * database where nothing has ever been merged this throws -- which correctly means
 * "no redirect".
 */
async function liveRegistrationId(id: string): Promise<string> {
  let current = String(id || '')
  if (!current) return current
  const seen = new Set<string>([current])
  for (let hop = 0; hop < 5; hop++) {
    let next = ''
    try {
      const rows = await prisma.$queryRawUnsafe<{ mergedIntoId?: string }[]>(
        `SELECT "mergedIntoId" FROM "TeamRegistration" WHERE id = ?`, current)
      next = String(rows?.[0]?.mergedIntoId || '').trim()
    } catch {
      return current   // column not there: nothing in this database has been merged
    }
    if (!next || seen.has(next)) return current
    seen.add(next)
    current = next
  }
  return current
}

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

  // Resolved BEFORE the duplicate check, not merely before the insert: that check
  // is scoped to a registration id, so asking it about the dead row would miss a
  // payment already recorded against the live one and write a second copy.
  const registrationId = await liveRegistrationId(row.registrationId)
  if (registrationId !== row.registrationId) {
    console.log(`[payment] ${row.piId || 'manual'} names merged registration ${row.registrationId}; recording against ${registrationId}`)
  }

  // The pre-flight check stays. It is no longer what makes this correct -- the
  // index is -- but it saves a thrown error on the overwhelmingly common path
  // where the payment really was already recorded minutes ago.
  if (row.piId) {
    const existing = await prisma.registrationPayment.findFirst({
      where: { registrationId, notes: { contains: row.piId } },
      select: { id: true },
    })
    if (existing) return false
  }

  const data: Record<string, unknown> = {
    registrationId,
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
