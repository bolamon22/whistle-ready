import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { DEFAULT_ASSIGNER_GROUPS, PAY_GROUPS } from '@/lib/payGroups'
import { assignerPaySettings, saveAssignerPay } from '@/lib/payScope'
import { orgPeople, roleIn } from '@/lib/orgMembers'

// Which staff pay each assigner sees (lib/payGroups): boys refs, girls refs,
// scorekeepers, field ops & trainers. The admin sets it for anyone on Users; a
// director for the assigners in their own organization on Your team (members from
// another organization included, lib/orgMembers).

export async function GET() {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  let ids: string[] = []
  if (gate.role === 'admin') {
    ids = (await prisma.user.findMany({ where: { role: 'assigner' }, select: { id: true } })).map(u => u.id)
  } else if (gate.orgId) {
    try {
      ids = (await orgPeople(gate.orgId)).filter(p => p.role === 'assigner').map(p => p.id)
    } catch { /* no orgId column yet: nobody to list */ }
  }
  return NextResponse.json({ groups: PAY_GROUPS, defaults: DEFAULT_ASSIGNER_GROUPS, assigners: await assignerPaySettings(ids) })
}

export async function PUT(req: Request) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const userId = String(b.userId || '')
  if (!userId || !Array.isArray(b.groups)) return NextResponse.json({ error: 'userId and groups are required' }, { status: 400 })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'No such user' }, { status: 404 })
  if (gate.role !== 'admin' && (!gate.orgId || !(await roleIn(userId, gate.orgId)))) {
    return NextResponse.json({ error: 'You can set this only for people in your organization.' }, { status: 403 })
  }
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  const groups = await saveAssignerPay(userId, b.groups, by)
  return NextResponse.json({ ok: true, groups })
}
