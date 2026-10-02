// What each role may SEE, as opposed to which pages it may open (that is
// lib/routeAccess). Plain functions with no server imports, so API routes,
// middleware and client pages all agree on one answer.
//
// The scheduler is staff who builds the schedule. Bo, Oct 2026: he "shouldn't
// be privy to any of the financial information", but "can also know that a
// team is paid but not how much ... red flags if a team is in jeopardy of a no
// show". So money is a separate permission from staff access, and payment
// STATUS (paid / partial / unpaid) is not money.

/** Roles an admin can preview with "View as". */
export const PREVIEW_ROLES = ['director', 'club_director', 'assigner', 'scheduler', 'coach', 'staff', 'parent'] as const

/** Dollar amounts: invoices, payments, balances, income, expenses. */
export const canSeeMoney = (role: string) => role === 'admin' || role === 'director'

/** Staff pay rates and pay totals. The assigner sets ref pay, so it sees these. */
export const canSeeStaffPay = (role: string) => canSeeMoney(role) || role === 'assigner'

/** Emails, phone numbers and notes for clubs, coaches and staff. */
export const canSeeContacts = (role: string) => canSeeMoney(role) || role === 'assigner'

export type PayStatus = 'paid' | 'partial' | 'unpaid' | 'none'

/** Paid / partial / unpaid from an invoice and what has come in, no amounts. */
export function payStatus(invoiced: number, received: number): PayStatus {
  const inv = Number(invoiced) || 0, rec = Number(received) || 0
  if (inv <= 0) return rec > 0 ? 'paid' : 'none'
  if (rec >= inv - 0.005) return 'paid'
  return rec > 0 ? 'partial' : 'unpaid'
}

// A staff record (Worker) carries pay and payout details next to the name. A
// scheduler can see who is working and their roles, not what they are paid or
// how to reach or pay them.
const WORKER_PAY_KEYS = ['payRateOverride', 'hourlyRate', 'payMethod', 'payHandle', 'venmoHandle', 'zelleHandle']
const WORKER_CONTACT_KEYS = ['email', 'phone', 'notes', 'mailingAddress']

/** Remove what this role may not see from a worker row. Returns a copy. */
export function redactWorker<T>(w: T, role: string): T {
  if (!w || typeof w !== 'object') return w
  const pay = canSeeStaffPay(role), contacts = canSeeContacts(role)
  if (pay && contacts) return w
  const out: Record<string, unknown> = { ...(w as Record<string, unknown>) }
  if (!pay) for (const k of WORKER_PAY_KEYS) if (k in out) out[k] = null
  if (!contacts) for (const k of WORKER_CONTACT_KEYS) if (k in out) out[k] = null
  return out as T
}

/** Drop the fields this role is shown blank from an update body, so saving a
 *  form it cannot fully see does not write those blanks over real values. */
export function stripWorkerUpdate(body: Record<string, unknown>, role: string): Record<string, unknown> {
  const out = { ...body }
  if (!canSeeStaffPay(role)) for (const k of WORKER_PAY_KEYS) delete out[k]
  if (!canSeeContacts(role)) for (const k of WORKER_CONTACT_KEYS) delete out[k]
  return out
}
