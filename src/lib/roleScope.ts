// What each role may SEE, as opposed to which pages it may open (that is
// lib/routeAccess). Plain functions with no server imports, so API routes,
// middleware and client pages all agree on one answer.
//
// The scheduler is staff who builds the schedule. Bo, Oct 2026: he "shouldn't
// be privy to any of the financial information", but "can also know that a
// team is paid but not how much ... red flags if a team is in jeopardy of a no
// show". So money is a separate permission from staff access, and payment
// STATUS (paid / partial / unpaid) is not money.
//
// Staff pay is split further by group (boys refs, girls refs, scorekeepers, field
// ops & trainers; lib/payGroups). An assigner sees only the groups set for them;
// pass their PayScope (lib/payScope) as `scope` and pay outside it comes back blank.

import { type PayScope, seesPay, workerPayGroups } from './payGroups'

/** Roles an admin can preview with "View as". */
export const PREVIEW_ROLES = ['director', 'club_director', 'assigner', 'scheduler', 'field_director', 'coach', 'staff', 'parent'] as const

/** Dollar amounts: invoices, payments, balances, income, expenses. */
export const canSeeMoney = (role: string) => role === 'admin' || role === 'director'

/** Staff pay rates and pay totals. The assigner sets ref pay, so it sees these. */
export const canSeeStaffPay = (role: string) => canSeeMoney(role) || role === 'assigner'

/** Emails, phone numbers and notes for clubs, coaches and staff. */
export const canSeeContacts = (role: string) => canSeeMoney(role) || role === 'assigner'

// The field director (Bo, Oct 13 2026: Jamie Wolf "is just going to be working the
// event") runs game day at the events assigned to them (lib/fieldDirector). They see
// the scorekeepers, athletic trainers and field ops, with their email and phone so
// they can call them on game day, but not refs, never pay, and never the notes or
// mailing address (a check-payout detail).
export const FIELD_DIRECTOR_JOBS = ['scorekeeper', 'athletic_trainer', 'field_ops'] as const

/** A staff record's jobs: its roles list, else its default role. Takes the JSON
 *  string the database stores or an already-parsed list. */
export function workerJobs(w: unknown): string[] {
  if (!w || typeof w !== 'object') return []
  const o = w as { roles?: unknown; defaultRole?: unknown }
  let r: unknown = o.roles
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { r = [] } }
  const list = Array.isArray(r) ? r.map(String).filter(Boolean) : []
  return list.length ? list : (o.defaultRole ? [String(o.defaultRole)] : [])
}

/** Whether a field director sees this staff member at all (one of their jobs). */
export function fieldDirectorSees(w: unknown): boolean {
  return workerJobs(w).some(j => (FIELD_DIRECTOR_JOBS as readonly string[]).includes(j))
}

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

/** Whether this viewer sees this staff member's rate and payout details: a role
 *  with staff pay, and (for an assigner) a pay group the person works in. */
export function seesWorkerPay(w: unknown, role: string, scope?: PayScope | null): boolean {
  if (!canSeeStaffPay(role)) return false
  if (!scope || scope.all) return true
  return seesPay(scope, workerPayGroups(w as { roles?: string; defaultRole?: string; gender?: string }))
}

/** Remove what this role may not see from a worker row. Returns a copy. */
export function redactWorker<T>(w: T, role: string, scope?: PayScope | null): T {
  if (!w || typeof w !== 'object') return w
  const pay = seesWorkerPay(w, role, scope), contacts = canSeeContacts(role)
  if (pay && contacts) return w
  // A field director keeps the email and phone of the staff they run.
  const reach = role === 'field_director' && fieldDirectorSees(w)
  const out: Record<string, unknown> = { ...(w as Record<string, unknown>) }
  if (!pay) for (const k of WORKER_PAY_KEYS) if (k in out) out[k] = null
  if (!contacts) for (const k of WORKER_CONTACT_KEYS) if (k in out && !(reach && (k === 'email' || k === 'phone'))) out[k] = null
  return out as T
}

/** Blank only the pay and payout fields this viewer may not see. For lists such as
 *  the game schedule that never carried the contact rules. */
export function redactWorkerPay<T>(w: T, role: string, scope?: PayScope | null): T {
  if (!w || typeof w !== 'object' || seesWorkerPay(w, role, scope)) return w
  const out: Record<string, unknown> = { ...(w as Record<string, unknown>) }
  for (const k of WORKER_PAY_KEYS) if (k in out) out[k] = null
  return out as T
}

/** Drop the fields this role is shown blank from an update body, so saving a
 *  form it cannot fully see does not write those blanks over real values. Pass the
 *  stored worker with the scope: an assigner can't change pay outside their groups. */
export function stripWorkerUpdate(body: Record<string, unknown>, role: string, scope?: PayScope | null, stored?: unknown): Record<string, unknown> {
  const out = { ...body }
  if (!canSeeStaffPay(role) || (scope && !scope.all && stored && !seesWorkerPay(stored, role, scope))) for (const k of WORKER_PAY_KEYS) delete out[k]
  if (!canSeeContacts(role)) for (const k of WORKER_CONTACT_KEYS) delete out[k]
  return out
}
