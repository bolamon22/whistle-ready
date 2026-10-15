import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Incident reports (medical / safety / facility / weather). Stored as JSON in
// AppSetting key `incidents:<id>` (no schema migration). Staff-only.
//
// A Medical incident can carry an injury report (Bo, Oct 13 2026): who was hurt
// (player, coach, staff, spectator), the player's team and number, the injury,
// suspected concussion, what was done, the outcome, and whether a parent was told,
// plus dated follow-ups. That is health information, often about a minor, so the
// details go only to directors, admins, athletic trainers and whoever logged it.
// Everyone else sees that a medical incident was logged, where, and how serious.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `incidents:${id}`
const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)
const me = (session: any) => String(session?.user?.name || session?.user?.email || 'Staff')
const str = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Directors, admins and athletic trainers see injury details. */
async function seesMedical(session: any): Promise<boolean> {
  const role = String(session?.user?.role || '')
  if (role === 'admin' || role === 'director') return true
  const email = String(session?.user?.email || '').trim().toLowerCase()
  if (!email) return false
  try {
    const r = await prisma.$queryRawUnsafe<any[]>(`SELECT roles, defaultRole FROM "Worker" WHERE lower(email) = ? LIMIT 1`, email)
    const w = r[0]; if (!w) return false
    let roles: string[] = []
    try { roles = JSON.parse(w.roles || '[]') } catch { /* bad JSON */ }
    return roles.includes('athletic_trainer') || w.defaultRole === 'athletic_trainer'
  } catch { return false }
}
const isMedical = (i: any) => i?.type === 'Medical'
function redact(i: any) {
  return { ...i, description: 'Medical incident logged. Details are for athletic trainers and directors.', injury: undefined, followUps: undefined, redacted: true }
}
function cleanInjury(v: any) {
  if (!v || typeof v !== 'object') return null
  const who = ['player', 'coach', 'staff', 'spectator'].includes(v.who) ? v.who : 'player'
  return {
    who,
    name: str(v.name, 120), team: str(v.team, 120), number: str(v.number, 10), division: str(v.division, 80), gameNumber: str(v.gameNumber, 20),
    bodyPart: str(v.bodyPart, 60), concussion: !!v.concussion,
    treatment: str(v.treatment, 1000),
    outcome: str(v.outcome, 60),
    parentNotified: ['yes', 'no', 'not_needed'].includes(v.parentNotified) ? v.parentNotified : '',
    parentName: str(v.parentName, 120), parentPhone: str(v.parentPhone, 40),
    time: str(v.time, 20),
  }
}

async function readList(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) } })
  if (!row) return []
  try { const v = JSON.parse(row.value || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
async function writeList(id: string, list: any[]) {
  await prisma.appSetting.upsert({
    where: { key: key(id) },
    update: { value: JSON.stringify(list) },
    create: { key: key(id), value: JSON.stringify(list) },
  })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isStaff((session.user as any)?.role)) return NextResponse.json({ incidents: [] }, { status: session ? 403 : 401 })
    await ensureTable()
    const list = await readList(params.id)
    const full = await seesMedical(session)
    const who = me(session)
    return NextResponse.json({ incidents: list.map((i: any) => isMedical(i) && !full && i.by !== who ? redact(i) : i), medical: full })
  } catch { return NextResponse.json({ incidents: [] }) }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(role)) return NextResponse.json({ error: 'Staff only' }, { status: 403 })
    await ensureTable()
    const b = await req.json()
    const description = String(b.description || '').trim()
    if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    const type = String(b.type || 'Other')
    const injury = type === 'Medical' ? cleanInjury(b.injury) : null
    if (injury && injury.who === 'player' && !injury.name) return NextResponse.json({ error: 'Add the player\u2019s name' }, { status: 400 })
    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      type,
      field: String(b.field || '').trim(),
      severity: String(b.severity || 'Medium'),
      description,
      ...(injury ? { injury, followUps: [] as any[] } : {}),
      status: 'open',
      by: me(session),
      createdAt: new Date().toISOString(),
    }
    const list = await readList(params.id)
    await writeList(params.id, [entry, ...list].slice(0, 200))
    return NextResponse.json({ ok: true, incident: entry })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session || !isStaff(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    await ensureTable()
    const b = await req.json()
    const list = await readList(params.id)
    // A follow-up on an injury ("went to urgent care, wrist sprain", "mom picked him
    // up") or a changed outcome: added, never edited, so the record keeps its history.
    if (b.followUp || b.outcome) {
      const target = list.find((i: any) => i.id === b.id)
      if (!target || !isMedical(target)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!(await seesMedical(session)) && target.by !== me(session)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
      const note = { text: str(b.followUp, 1000), outcome: str(b.outcome, 60), by: me(session), at: new Date().toISOString() }
      const next = list.map((i: any) => i.id === b.id ? { ...i, injury: i.injury ? { ...i.injury, outcome: note.outcome || i.injury.outcome } : i.injury, followUps: [...(i.followUps || []), note] } : i)
      await writeList(params.id, next)
      return NextResponse.json({ ok: true })
    }
    // Who is fixing it (Oct 14 2026, field directors: a hole in the field or a torn net
    // gets handed to someone on field ops and tracked until it's fixed), and who closed
    // it, when, and what was done.
    if (!list.some((i: any) => i.id === b.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const now = new Date().toISOString()
    const next = list.map((i: any) => {
      if (i.id !== b.id) return i
      let out = { ...i }
      if (b.assignee !== undefined) out = { ...out, assignee: str(b.assignee, 80), assignedBy: me(session), assignedAt: now }
      if (b.status === 'resolved' && i.status !== 'resolved') out = { ...out, status: 'resolved', resolvedBy: me(session), resolvedAt: now, resolveNote: str(b.note, 300) }
      else if (b.status === 'open') out = { ...out, status: 'open', resolvedBy: undefined, resolvedAt: undefined, resolveNote: undefined }
      return out
    })
    await writeList(params.id, next)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session || !isStaff(role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    await ensureTable()
    const delId = req.nextUrl.searchParams.get('id')
    const me = session.user?.name || session.user?.email || ''
    const list = await readList(params.id)
    const next = list.filter((i: any) => i.id !== delId || (role !== 'director' && i.by !== me))
    await writeList(params.id, next)
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 }) }
}
