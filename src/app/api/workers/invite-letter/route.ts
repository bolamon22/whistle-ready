import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { INVITE_LETTER_DEFAULTS, inviteLetterFor } from '@/lib/inviteLetter'

// GET/PUT the org's editable invite letters (see src/lib/inviteLetter.ts for why).
// PUT {audience, subject, body} saves; {audience, reset:true} returns to the default.

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const viewOrgId = new URL(req.url).searchParams.get('viewOrgId')
  const orgId = gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const [staff, recruit, org] = await Promise.all([
    inviteLetterFor(orgId, 'staff'),
    inviteLetterFor(orgId, 'recruit'),
    orgById(orgId),
  ])
  return NextResponse.json({ staff, recruit, orgName: org?.name || '', defaults: INVITE_LETTER_DEFAULTS })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { audience?: unknown; subject?: unknown; body?: unknown; reset?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const audience = body.audience === 'recruit' ? 'recruit' as const : body.audience === 'staff' ? 'staff' as const : null
  if (!audience) return NextResponse.json({ error: 'audience must be staff or recruit' }, { status: 400 })
  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const key = `inviteLetter:${audience}:${orgId}`
  if (body.reset === true) {
    try { await prisma.appSetting.delete({ where: { key } }) } catch { /* wasn't customized */ }
    return NextResponse.json({ ok: true, letter: { ...INVITE_LETTER_DEFAULTS[audience], custom: false } })
  }
  const subject = String(body.subject ?? '').trim().slice(0, 200)
  const letterBody = String(body.body ?? '').trim().slice(0, 4000)
  if (!subject || !letterBody) return NextResponse.json({ error: 'Subject and letter are both required' }, { status: 400 })
  const value = JSON.stringify({ subject, body: letterBody })
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  return NextResponse.json({ ok: true, letter: { subject, body: letterBody, custom: true } })
}
