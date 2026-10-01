import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { payLetterFor, payLetterDefaults, payLetterKey, type PayLetterVariant } from '@/lib/payLetter'

// GET/PUT one of the org's two payment letters (see src/lib/payLetterText.ts):
// 'reminder' is the everyday ask, 'final' the waiting-list escalation. No variant
// means 'reminder', so an older caller keeps getting the letter it always got.
const asVariant = (v: unknown): PayLetterVariant => (String(v || '') === 'final' ? 'final' : 'reminder')

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const viewOrgId = new URL(req.url).searchParams.get('viewOrgId')
  const orgId = gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const variant = asVariant(new URL(req.url).searchParams.get('variant'))
  const [letter, org] = await Promise.all([payLetterFor(orgId, variant), orgById(orgId)])
  return NextResponse.json({ letter, variant, orgName: org?.name || '', defaults: payLetterDefaults(variant) })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { subject?: unknown; body?: unknown; reset?: unknown; viewOrgId?: unknown; variant?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const variant = asVariant(body.variant)
  const key = payLetterKey(orgId, variant)
  if (body.reset === true) {
    try { await prisma.appSetting.delete({ where: { key } }) } catch { /* wasn't customized */ }
    return NextResponse.json({ ok: true, variant, letter: { ...payLetterDefaults(variant), custom: false } })
  }
  const subject = String(body.subject ?? '').trim().slice(0, 200)
  const letterBody = String(body.body ?? '').trim().slice(0, 4000)
  if (!subject || !letterBody) return NextResponse.json({ error: 'Subject and letter are both required' }, { status: 400 })
  const value = JSON.stringify({ subject, body: letterBody })
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  return NextResponse.json({ ok: true, variant, letter: { subject, body: letterBody, custom: true } })
}
