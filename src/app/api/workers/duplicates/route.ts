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
