import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { COMM_KINDS, commLetterFor, type CommKind } from '@/lib/commLetters'

// GET/PUT the org's pre-tournament club letters (see src/lib/commLetters.ts).

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const viewOrgId = new URL(req.url).searchParams.get('viewOrgId')
  const orgId = gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const [waiver, schedule, confirm, org] = await Promise.all([
    commLetterFor(orgId, 'waiver'), commLetterFor(orgId, 'schedule'), commLetterFor(orgId, 'confirm'), orgById(orgId),
  ])
  return NextResponse.json({ letters: { waiver, schedule, confirm }, orgName: org?.name || '' })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { kind?: unknown; subject?: unknown; body?: unknown; reset?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const kind = String(body.kind ?? '') as CommKind
  if (!COMM_KINDS[kind]) return NextResponse.json({ error: 'Unknown letter kind' }, { status: 400 })
  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const key = `commLetter:${kind}:${orgId}`
  if (body.reset === true) {
    try { await prisma.appSetting.delete({ where: { key } }) } catch { /* wasn't customized */ }
    return NextResponse.json({ ok: true, letter: { ...COMM_KINDS[kind].defaults, custom: false } })
  }
  const subject = String(body.subject ?? '').trim().slice(0, 200)
  const letterBody = String(body.body ?? '').trim().slice(0, 4000)
  if (!subject || !letterBody) return NextResponse.json({ error: 'Subject and letter are both required' }, { status: 400 })
  const value = JSON.stringify({ subject, body: letterBody })
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  return NextResponse.json({ ok: true, letter: { subject, body: letterBody, custom: true } })
}
