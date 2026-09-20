import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function normName(s: unknown): string { return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '') }
function normPhone(s: unknown): string {
  const d = String(s ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d.slice(-10) : ''
}

/**
 * Edit distance, stopped as soon as it exceeds `cap`.
 *
 * WHY THIS IS HERE: exact matching missed the case this panel exists for. Bo imported a
 * pool of staff as sample data, real people are now signing themselves up through the
 * recruiting link, and the two spellings rarely agree to the letter -- "Haley Nolan"
 * signs up fresh while "Hayley Nolan" sits in the import. One letter apart, and because
 * the imported half was seeded with no email and no phone there is nothing else to match
 * on, so the pair was invisible: two records for one person, and her assignments and pay
 * history split across both.
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > cap) return cap + 1   // every path through this row is already too far
    prev = row
  }
  return prev[b.length]
}

/** No email and no phone: almost always a seeded/imported row rather than a real signup. */
const noContact = (w: Record<string, unknown>) =>
  !String(w.email ?? '').trim() && !normPhone(w.phone)
function slim(w: Record<string, unknown>) {
  return {
    id: String(w.id), name: String(w.name ?? ''), email: (w.email as string | null) ?? null,
    phone: (w.phone as string | null) ?? null, defaultRole: String(w.defaultRole ?? 'ref'),
    roles: String(w.roles ?? '[]'), certLevel: String(w.certLevel ?? ''),
    payMethod: String(w.payMethod ?? ''), payHandle: (w.payHandle as string | null) ?? null,
    association: (w.association as string | null) ?? null, createdAt: String(w.createdAt ?? ''),
  }
}

async function resolveOrgId(req: Request, gate: { role: string; orgId: string | null }, fromBody?: unknown): Promise<string> {
  if (gate.role !== 'admin') return gate.orgId ?? ''
  const url = new URL(req.url)
  return String(fromBody ?? url.searchParams.get('viewOrgId') ?? gate.orgId ?? '')
}

// GET /api/workers/duplicates[?viewOrgId=] — likely duplicate Workers in the org's
// pool, paired by same email, same phone, or same normalized name. Pairs the
// organizer marked "not duplicates" (AppSetting workerDupeDismissed:{org}) stay hidden.
export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const orgId = await resolveOrgId(req, gate)

  const client = db()
  const res = orgId
    ? await client.execute({ sql: `SELECT * FROM "Worker" WHERE orgId = ? ORDER BY createdAt ASC`, args: [orgId] })
    : await client.execute(`SELECT * FROM "Worker" ORDER BY createdAt ASC`)
  const workers = res.rows as unknown as Record<string, unknown>[]

  let dismissed: string[] = []
  try {
    const d = await prisma.appSetting.findUnique({ where: { key: `workerDupeDismissed:${orgId || 'all'}` } })
    if (d) dismissed = JSON.parse(d.value)
  } catch { /* none dismissed */ }
  const dismissedSet = new Set(dismissed)

  const pairs: { key: string; reasons: string[]; a: ReturnType<typeof slim>; b: ReturnType<typeof slim> }[] = []
  for (let i = 0; i < workers.length && pairs.length < 50; i++) {
    for (let j = i + 1; j < workers.length && pairs.length < 50; j++) {
      const A = workers[i], B = workers[j]
      const reasons: string[] = []
      const emailA = String(A.email ?? '').trim().toLowerCase(), emailB = String(B.email ?? '').trim().toLowerCase()
      if (emailA && emailA === emailB) reasons.push('same email')
      const phoneA = normPhone(A.phone), phoneB = normPhone(B.phone)
      if (phoneA && phoneA === phoneB) reasons.push('same phone')
      const nameA = normName(A.name), nameB = normName(B.name)
      if (nameA.length >= 5 && nameA === nameB) reasons.push('same name')
      else if (nameA.length >= 8 && nameB.length >= 8) {
        // One letter apart is a spelling of the same name far more often than it is two
        // people. Two letters apart is weaker -- siblings on staff can sit that close
        // ("Emma Johnson" / "Ella Johnson") -- so it only counts when one side has no
        // contact details at all, which is the signature of a seeded import.
        const d = editDistance(nameA, nameB, 2)
        if (d === 1) reasons.push('nearly the same name')
        else if (d === 2 && (noContact(A) || noContact(B))) reasons.push('nearly the same name, and one has no contact details')
      }
      if (!reasons.length) continue
      const key = [String(A.id), String(B.id)].sort().join(':')
      if (dismissedSet.has(key)) continue
      pairs.push({ key, reasons, a: slim(A), b: slim(B) })
    }
  }
  return NextResponse.json({ pairs })
}

// POST {action:'dismiss', key} — remember a pair as "not duplicates"
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { action?: unknown; key?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const key = String(body.key ?? '')
  if (body.action !== 'dismiss' || !/^[\w-]+:[\w-]+$/.test(key)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const orgId = await resolveOrgId(req, gate, body.viewOrgId)
  const storageKey = `workerDupeDismissed:${orgId || 'all'}`
  let dismissed: string[] = []
  try {
    const d = await prisma.appSetting.findUnique({ where: { key: storageKey } })
    if (d) dismissed = JSON.parse(d.value)
  } catch { /* start fresh */ }
  if (!dismissed.includes(key)) dismissed.push(key)
  const value = JSON.stringify(dismissed.slice(-500))
  await prisma.appSetting.upsert({ where: { key: storageKey }, update: { value }, create: { key: storageKey, value } })
  return NextResponse.json({ ok: true })
}
