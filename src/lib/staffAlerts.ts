import { prisma } from '@/lib/db'
import { sendToSubscriptions } from '@/lib/push'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { tournamentOrgId, orgById } from '@/lib/org'

// Game-day phone alerts for STAFF (field requests), plus an email backup.
//
// Field requests used to reach only people staring at the Field Request board.
// Now each request pushes to the phones of staff who turned on alerts for that
// group (Medical, Field Ops, Refs, Scorekeepers, Assigners; "All staff" reaches
// everyone with alerts on), and emails the people on this event's roster whose
// job it is, unless they already got the phone alert.
//
// One list in AppSetting `staffPush` (dozens of devices at most). Each entry
// remembers who and which org, so an alert only goes to that event's staff.

export const ALERT_GROUPS = ['medical', 'fieldops', 'refs', 'scorekeepers', 'assigners'] as const
export type AlertGroup = typeof ALERT_GROUPS[number]

export interface StaffSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userId: string
  email: string
  name: string
  role: string
  orgId: string | null
  groups: AlertGroup[]
  label?: string
  createdAt: string
}

const KEY = 'staffPush'
async function readAll(): Promise<StaffSub[]> {
  try { const r = await prisma.appSetting.findUnique({ where: { key: KEY } }); const v = r ? JSON.parse(r.value || '[]') : []; return Array.isArray(v) ? v : [] } catch { return [] }
}
async function writeAll(list: StaffSub[]) {
  const value = JSON.stringify(list)
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
}

export const cleanGroups = (g: unknown): AlertGroup[] =>
  Array.isArray(g) ? (g.filter(x => (ALERT_GROUPS as readonly string[]).includes(String(x))) as AlertGroup[]) : []

export async function findSub(endpoint: string): Promise<StaffSub | null> {
  return (await readAll()).find(s => s.endpoint === endpoint) || null
}
export async function saveSub(sub: Omit<StaffSub, 'createdAt'>): Promise<void> {
  const list = (await readAll()).filter(s => s.endpoint !== sub.endpoint)
  list.push({ ...sub, createdAt: new Date().toISOString() })
  await writeAll(list)
}
export async function setGroups(endpoint: string, userId: string, groups: AlertGroup[]): Promise<boolean> {
  const list = await readAll()
  const i = list.findIndex(s => s.endpoint === endpoint && s.userId === userId)
  if (i < 0) return false
  list[i] = { ...list[i], groups }
  await writeAll(list)
  return true
}
export async function removeSub(endpoint: string): Promise<void> {
  await writeAll((await readAll()).filter(s => s.endpoint !== endpoint))
}

// Worker roles -> the field-request groups that person answers.
const ROLE_GROUP: Record<string, AlertGroup> = { athletic_trainer: 'medical', field_ops: 'fieldops', ref: 'refs', scorekeeper: 'scorekeepers' }
const workerGroups = (w: { defaultRole?: unknown; roles?: unknown; isAssigner?: unknown }): AlertGroup[] => {
  const out = new Set<AlertGroup>()
  let roles: string[] = []
  try { roles = JSON.parse(String(w.roles || '[]')) } catch { /* none */ }
  for (const r of [String(w.defaultRole || ''), ...(Array.isArray(roles) ? roles : [])]) { const g = ROLE_GROUP[r]; if (g) out.add(g) }
  if (w.isAssigner === true || w.isAssigner === 1 || w.isAssigner === '1') out.add('assigners')
  return Array.from(out)
}

/** A sensible starting choice for a person turning alerts on: event runners get
 *  everything; staff get the groups that match their job in the Staff Pool. */
export async function defaultGroupsFor(email: string, role: string): Promise<AlertGroup[]> {
  if (['admin', 'director', 'assigner', 'scheduler', 'field_director'].includes(role)) return [...ALERT_GROUPS]
  try {
    const rows: any[] = await prisma.$queryRawUnsafe('SELECT defaultRole, roles, isAssigner FROM "Worker" WHERE lower(email) = lower(?)', email)
    const g = new Set<AlertGroup>()
    for (const r of rows || []) workerGroups(r).forEach(x => g.add(x))
    if (g.size) return Array.from(g)
  } catch { /* fall through */ }
  return [...ALERT_GROUPS]
}

export interface FieldRequestEntry { id: string; text: string; group: string; urgency?: string; from: string; fromUserId?: string }

/** Who should hear about a request by email: the roster people whose job it is.
 *  "Ref needed" / "No team" / "All staff" go to the assigners, not every ref. */
const EMAIL_ROUTE: Record<string, (w: any) => boolean> = {
  medical: w => workerGroups(w).includes('medical'),
  fieldops: w => workerGroups(w).includes('fieldops'),
  refs: w => workerGroups(w).includes('assigners'),
  assigners: w => workerGroups(w).includes('assigners'),
  all: w => workerGroups(w).includes('assigners'),
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/** Push + email for a new field request. Best-effort: never throws. */
export async function notifyFieldRequest(tournamentId: string, m: FieldRequestEntry): Promise<{ pushed: number; emailed: number }> {
  const out = { pushed: 0, emailed: 0 }
  try {
    const orgId = await tournamentOrgId(tournamentId)
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }).catch(() => null)
    const title = `${m.urgency === 'High' ? '🚨 ' : ''}Field request${m.urgency ? ` · ${m.urgency}` : ''}`
    const url = `/tournaments/${tournamentId}/communications`

    // 1) phones
    const all = await readAll()
    const targets = all.filter(s =>
      (s.orgId === orgId || (!s.orgId && s.role === 'admin')) &&
      s.userId !== m.fromUserId &&
      (m.group === 'all' || s.groups.includes(m.group as AlertGroup)))
    const pushedEmails = new Set<string>()
    if (targets.length) {
      const r = await sendToSubscriptions(targets, { title, body: `${m.text} — ${m.from}`, url, tag: `fr:${m.id}` })
      out.pushed = r.sent
      targets.forEach(s => { if (!r.gone.includes(s.endpoint) && s.email) pushedEmails.add(s.email.toLowerCase()) })
      if (r.gone.length) await writeAll((await readAll()).filter(s => !r.gone.includes(s.endpoint)))
    }

    // 2) email backup, to this event's roster, minus anyone whose phone just buzzed
    const route = EMAIL_ROUTE[m.group]
    if (route && emailEnabled()) {
      const roster = await prisma.rosterEntry.findMany({ where: { tournamentId }, include: { worker: true } }).catch(() => [])
      const to = new Set<string>()
      for (const r of roster as any[]) {
        const w = r.worker; const em = String(w?.email || '').trim().toLowerCase()
        if (em && route(w) && !pushedEmails.has(em)) to.add(em)
      }
      if (to.size) {
        const org = await orgById(orgId).catch(() => null)
        const subject = `${m.urgency === 'High' ? 'URGENT: ' : ''}${m.text}`
        const html = `<p style="font-size:16px"><strong>${esc(m.text)}</strong>${m.urgency ? ` <span style="color:#b91c1c">(${esc(m.urgency)})</span>` : ''}</p>
<p>From ${esc(m.from)}${t?.name ? ` at ${esc(t.name)}` : ''}.</p>
<p><a href="https://whistleready.app${url}">Open the Field Request board</a> and tap <strong>Respond</strong> so they know you're on the way.</p>
<p style="color:#64748b;font-size:12px">Turn on phone alerts in Whistle Ready to get these faster.</p>`
        const res = await Promise.all(Array.from(to).map(addr => sendEmail({ to: addr, subject, html, ...orgSender(org as any) })))
        out.emailed = res.filter(x => x.ok).length
      }
    }
  } catch (e) {
    console.error('[staffAlerts] notifyFieldRequest failed (non-blocking):', e)
  }
  return out
}

/** "<name> is on the way" to the phone(s) of whoever sent the request. */
export async function notifyRequester(fromUserId: string | undefined, tournamentId: string, text: string, by: string): Promise<void> {
  if (!fromUserId) return
  try {
    const subs = (await readAll()).filter(s => s.userId === fromUserId)
    if (subs.length) await sendToSubscriptions(subs, { title: `${by} is on the way`, body: text, url: `/tournaments/${tournamentId}/communications`, tag: `fr-ack:${text}` })
  } catch { /* best-effort */ }
}

/** Phone alerts to the staff whose alert subscription carries one of these emails
 *  (the assigner's "Notify officials" sends each person their own games). */
export async function pushToStaffEmails(emails: string[], payload: { title: string; body: string; url: string; tag: string }): Promise<number> {
  try {
    const want = new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))
    if (!want.size) return 0
    const subs = (await readAll()).filter(s => s.email && want.has(String(s.email).toLowerCase()))
    if (!subs.length) return 0
    const r = await sendToSubscriptions(subs, payload)
    if (r.gone.length) await writeAll((await readAll()).filter(s => !r.gone.includes(s.endpoint)))
    return r.sent
  } catch { return 0 }
}
