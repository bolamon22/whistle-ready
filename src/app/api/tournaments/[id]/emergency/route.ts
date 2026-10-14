import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { EAP_KEYS, EAP_EDIT_ROLES, eapDefaults } from '@/lib/emergencyPlan'

// The event's emergency action plan (lib/emergencyPlan). GET: any staff login
// (a field director only for their own events). PUT: directors, field directors,
// admins and athletic trainers, who know the venue's AED and hospital best.

const key = (id: string) => `eap:${id}`

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

async function isTrainer(email: string): Promise<boolean> {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return false
  try {
    const r = await prisma.$queryRawUnsafe<any[]>(`SELECT roles, defaultRole FROM "Worker" WHERE lower(email) = ? LIMIT 1`, e)
    const w = r[0]; if (!w) return false
    let roles: string[] = []
    try { roles = JSON.parse(w.roles || '[]') } catch { /* bad JSON */ }
    return roles.includes('athletic_trainer') || w.defaultRole === 'athletic_trainer'
  } catch { return false }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  await ensureTable()
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true, location: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } }).catch(() => null)
  let saved: any = null
  try { saved = row ? JSON.parse(row.value) : null } catch { /* bad JSON */ }
  const canEdit = EAP_EDIT_ROLES.includes(gate.role) || await isTrainer(String(gate.session?.user?.email || ''))
  const plan = saved?.plan || { ...eapDefaults(), address: t.location || '' }
  return NextResponse.json({ event: t.name, plan, saved: !!saved, updatedAt: saved?.updatedAt || null, updatedBy: saved?.updatedBy || null, canEdit })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  if (!EAP_EDIT_ROLES.includes(gate.role) && !await isTrainer(String(gate.session?.user?.email || ''))) {
    return NextResponse.json({ error: 'Only directors and athletic trainers can edit the emergency plan' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const plan: Record<string, string> = {}
  for (const k of EAP_KEYS) plan[k] = String(body?.plan?.[k] ?? '').slice(0, 2000).trim()
  await ensureTable()
  const value = JSON.stringify({ plan, updatedAt: new Date().toISOString(), updatedBy: String(gate.session?.user?.name || gate.session?.user?.email || 'Staff') })
  await prisma.appSetting.upsert({ where: { key: key(params.id) }, create: { key: key(params.id), value }, update: { value } })
  return NextResponse.json({ ok: true })
}
