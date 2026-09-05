import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { housingSettings, saveHousingSettings, housingCode, rotateHousingCode, housingBoardUrl } from '@/lib/housing'

// The org's housing setup: contact, cadence, contact-info toggle, board link.
async function orgFor(gate: { role: string; orgId: string | null }, viewOrgId: unknown) {
  return gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
}

export async function GET(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const orgId = await orgFor(gate, new URL(req.url).searchParams.get('viewOrgId'))
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const settings = await housingSettings(orgId)
  return NextResponse.json({ settings, boardUrl: housingBoardUrl(await housingCode(orgId)) })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { viewOrgId?: unknown; rotate?: unknown; contactName?: unknown; contactEmail?: unknown; cadence?: unknown; includeContact?: unknown; bookingUrl?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const orgId = await orgFor(gate, body.viewOrgId)
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  if (body.rotate === true) {
    return NextResponse.json({ ok: true, boardUrl: housingBoardUrl(await rotateHousingCode(orgId)) })
  }
  const patch: Record<string, unknown> = {}
  if (body.contactName !== undefined) patch.contactName = String(body.contactName ?? '').slice(0, 120)
  if (body.contactEmail !== undefined) patch.contactEmail = String(body.contactEmail ?? '').trim().toLowerCase().slice(0, 200)
  if (body.cadence !== undefined && ['weekly', 'twice', 'manual'].includes(String(body.cadence))) patch.cadence = String(body.cadence)
  if (body.includeContact !== undefined) patch.includeContact = body.includeContact === true
  if (body.bookingUrl !== undefined) patch.bookingUrl = String(body.bookingUrl ?? '').trim().slice(0, 300)
  const settings = await saveHousingSettings(orgId, patch)
  return NextResponse.json({ ok: true, settings, boardUrl: housingBoardUrl(await housingCode(orgId)) })
}
