import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { listInviteTemplates, saveInviteTemplate, deleteInviteTemplate } from '@/lib/inviteTemplateStore'

// Bo's saved invite letters. Stored PER ORG, not per tournament — the tournament
// in the path is just where the page lives; a letter he saves is there for every
// event he runs. Org comes off the session, never the URL.

function orgFor(gate: { role?: string; orgId?: string | null }, override?: unknown) {
  return gate.role === 'admin' ? String(override || gate.orgId || '') : String(gate.orgId || '')
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const orgId = orgFor(gate, new URL(req.url).searchParams.get('viewOrgId'))
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  return NextResponse.json({ templates: await listInviteTemplates(orgId) })
}

export async function PUT(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  let payload: { key?: unknown; label?: unknown; subject?: unknown; body?: unknown; viewOrgId?: unknown } = {}
  try { payload = await req.json() } catch { /* validated below */ }
  const orgId = orgFor(gate, payload.viewOrgId)
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const res = await saveInviteTemplate(orgId, {
    key: payload.key == null ? undefined : String(payload.key),
    label: payload.label == null ? undefined : String(payload.label),
    subject: String(payload.subject ?? ''),
    body: String(payload.body ?? ''),
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ok: true, key: res.key, templates: res.templates })
}

export async function DELETE(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const url = new URL(req.url)
  const orgId = orgFor(gate, url.searchParams.get('viewOrgId'))
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const key = String(url.searchParams.get('key') || '')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  return NextResponse.json({ ok: true, templates: await deleteInviteTemplate(orgId, key) })
}
