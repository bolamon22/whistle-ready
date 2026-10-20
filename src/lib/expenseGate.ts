import { eventGate, type AuthResult } from '@/lib/apiAuth'
import { canSeeMoney } from '@/lib/roleScope'
import { orgScoped } from '@/lib/orgScope'
import { expensesUsingReceipt, receiptMeta, workersByEmail, type EventInfo, type ReceiptMeta, type StaffWorker } from '@/lib/eventExpenses'

// Who may do what with receipts (lib/eventExpenses). Server only.
//
// The office (money roles: director, admin) sees and settles every receipt of its
// organization's events. Anyone else on staff turns in receipts for events of their
// own organization (a field director: only the events they work) and sees only their
// own, which they can change until the office approves them.

export type Gate = Extract<AuthResult, { ok: true }>

/** An admin who isn't viewing one organization in View as. */
export const realAdmin = (gate: Gate) => gate.session?.user?.role === 'admin' && !gate.viewing

/** The office: money roles, held to their organization by orgGate. */
export const isOffice = (gate: Gate) => canSeeMoney(gate.role)

export type StaffContext = { email: string; workers: StaffWorker[]; orgs: Set<string> }

/** The signed-in person's Staff Pool records (by login email, never from the request)
 *  and the organizations they work for: the one they are signed in to, and for plain
 *  staff (who aren't held to one organization) each of their records' too. */
export async function staffContext(gate: Gate): Promise<StaffContext> {
  const email = String(gate.session?.user?.email ?? '').trim().toLowerCase()
  const workers = await workersByEmail(email)
  const orgs = new Set<string>()
  if (gate.orgId) orgs.add(gate.orgId)
  if (!orgScoped(gate.role)) for (const w of workers) if (w.orgId) orgs.add(w.orgId)
  return { email, workers, orgs }
}

/** Whether this person may turn in a receipt for this event. */
export function mayUseEvent(gate: Gate, ctx: StaffContext, ev: EventInfo): boolean {
  if (realAdmin(gate)) return true
  if (!ev.orgId || !ctx.orgs.has(ev.orgId)) return false
  return !eventGate(gate, ev.id)
}

/** Who the receipt is for: their Staff Pool record in the event's organization, when
 *  they have one (its Zelle or Venmo is how the office pays them back). */
export function buyerFor(gate: Gate, ctx: StaffContext, ev: EventInfo): { personName: string; workerId: string } {
  const w = ctx.workers.find(x => x.orgId === ev.orgId)
  const name = w?.name || String(gate.session?.user?.name ?? '').trim() || ctx.email
  return { personName: name.slice(0, 120), workerId: w?.id || '' }
}

/** A receipt file is shown to whoever uploaded it, to the person whose receipt it is,
 *  to the office of the event it is on, and to an admin. Nobody else, ever. */
export async function canSeeReceipt(gate: Gate, meta: ReceiptMeta): Promise<boolean> {
  if (realAdmin(gate)) return true
  if (meta.userId && meta.userId === gate.userId) return true
  const uses = await expensesUsingReceipt(meta.id)
  if (!uses.length) return false
  if (isOffice(gate)) return uses.some(u => !!u.orgId && u.orgId === gate.orgId)
  if (uses.some(u => u.userId && u.userId === gate.userId)) return true
  const ws = (await workersByEmail(String(gate.session?.user?.email ?? ''))).map(w => w.id)
  return uses.some(u => u.workerId && ws.includes(u.workerId))
}

/** Why this receipt file can't go on an expense, or null. Only the person who uploaded
 *  a file attaches it, and a file goes on one expense (`except`: the one being edited). */
export async function receiptProblem(receiptId: string, userId: string, admin: boolean, except = ''): Promise<string | null> {
  const meta = await receiptMeta(receiptId)
  if (!meta || (!admin && meta.userId !== userId)) return 'That receipt photo didn’t upload. Add it again.'
  if ((await expensesUsingReceipt(receiptId)).some(u => u.id !== except)) return 'That receipt is already on another expense.'
  return null
}
