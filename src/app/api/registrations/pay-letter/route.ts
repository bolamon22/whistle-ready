import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { PAY_LETTER_DEFAULTS, payLetterFor } from '@/lib/payLetter'

// GET/PUT the org's payment-reminder letter (see src/lib/payLetter.ts).

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const viewOrgId = new URL(req.url).searchParams.get('viewOrgId')
  const orgId = gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const [letter, org] = await Promise.all([payLetterFor(orgId), orgById(orgId)])
  return NextResponse.json({ letter, orgName: org?.name || '', defaults: PAY_LETTER_DEFAULTS })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { subject?: unknown; body?: unknown; reset?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const key = `payLetter:${orgId}`
  if (body.reset === true) {
    try { await prisma.appSetting.delete({ where: { key } }) } catch { /* wasn't customized */ }
    return NextResponse.json({ ok: true, letter: { ...PAY_LETTER_DEFAULTS, custom: false } })
  }
  const subject = String(body.subject ?? '').trim().slice(0, 200)
  const letterBody = String(body.body ?? '').trim().slice(0, 4000)
  if (!subject || !letterBody) return NextResponse.json({ error: 'Subject and letter are both required' }, { status: 400 })
  const value = JSON.stringify({ subject, body: letterBody })
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  return NextResponse.json({ ok: true, letter: { subject, body: letterBody, custom: true } })
}
