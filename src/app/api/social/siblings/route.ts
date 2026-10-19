import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getSubmission } from '@/lib/formSubmissions'
import { linkSiblings, unlinkSibling } from '@/lib/siblings'

// Link players as siblings for the "Siblings" post look (lib/siblings). POST { ids, rel }
// links 2–4 of the org's players (rel: '' from their genders, or brothers/sisters/mixed);
// DELETE ?id= takes one player out of their group.
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const b = await req.json().catch(() => ({} as any))
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 4)
  const subs = await Promise.all(ids.map((id: string) => getSubmission(gate.orgId!, id).catch(() => null)))
  if (subs.some(s => !s || s.formType !== 'player')) return NextResponse.json({ error: 'Those players aren\'t in your organization' }, { status: 404 })
  if (new Set(subs.map(s => String((s as any)?.tournamentId || s?.data?.tournamentId || ''))).size > 1) return NextResponse.json({ error: 'Siblings need to be at the same event' }, { status: 400 })
  try { return NextResponse.json({ ok: true, ids: await linkSiblings(ids, String(b.rel || '')) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'Could not link them' }, { status: 400 }) }
}

export async function DELETE(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!(await getSubmission(gate.orgId, id).catch(() => null))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await unlinkSibling(id)
  return NextResponse.json({ ok: true })
}
