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
  // Every kind, straight off COMM_KINDS — the account letter was missing when this
  // was a hand-written list, so its pill sat on "Loading letter…" forever.
  const kinds = Object.keys(COMM_KINDS) as CommKind[]
  const org = await orgById(orgId)
  const loaded = await Promise.all(kinds.map(k => commLetterFor(orgId, k)))
  const letters: Record<string, { subject: string; body: string; custom: boolean }> = {}
  kinds.forEach((k, i) => { letters[k] = loaded[i] })
  return NextResponse.json({ letters, orgName: org?.name || '' })
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
