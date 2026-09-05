import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { ensureHousingCols, housingBoard, housingSettings, orgForHousingCode, deriveStatus } from '@/lib/housing'

// The housing board's data — two doors to the same rows:
//   ?code=  : the housing company's magic link (no login; code is the secret)
//   no code : the org side (requireStaff), same payload plus contact info always
async function resolveOrg(req: Request, body?: { code?: unknown; viewOrgId?: unknown }): Promise<{ orgId: string; viaCode: boolean } | NextResponse> {
  const url = new URL(req.url)
  const code = String(body?.code ?? url.searchParams.get('code') ?? '')
  if (code) {
    const orgId = await orgForHousingCode(code)
    if (!orgId) return NextResponse.json({ error: 'This link is no longer active' }, { status: 404 })
    return { orgId, viaCode: true }
  }
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const viewOrgId = body?.viewOrgId ?? url.searchParams.get('viewOrgId')
  const orgId = gate.role === 'admin' ? String(viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  return { orgId, viaCode: false }
}

export async function GET(req: Request) {
  const res = await resolveOrg(req)
  if (res instanceof NextResponse) return res
  const [events, settings, org] = await Promise.all([housingBoard(res.orgId), housingSettings(res.orgId), orgById(res.orgId)])
  const hideContact = res.viaCode && !settings.includeContact
  return NextResponse.json({
    orgName: org?.name || 'Whistle Ready',
    events: hideContact
      ? events.map(e => ({ ...e, clubs: e.clubs.map(c => ({ ...c, clubContact: '', contactEmail: '', contactPhone: '' })) }))
      : events,
  })
}

const STATUSES = ['needs', 'progress', 'booked', 'local']

export async function POST(req: Request) {
  let body: { code?: unknown; viewOrgId?: unknown; regId?: unknown; status?: unknown; hotelName?: unknown; hotelRooms?: unknown; hotelNights?: unknown; notes?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const res = await resolveOrg(req, body)
  if (res instanceof NextResponse) return res

  const regId = String(body.regId ?? '')
  if (!regId) return NextResponse.json({ error: 'regId is required' }, { status: 400 })
  await ensureHousingCols()
  // The reg must belong to one of THIS org's tournaments — the code (or session org)
  // scopes every write; nothing cross-org is reachable.
  const own: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT r.id, r.needsHotel FROM "TeamRegistration" r JOIN "Tournament" t ON r.tournamentId = t.id
     WHERE r.id = ? AND t.orgId = ? AND r.deletedAt IS NULL`, regId, res.orgId)
  if (!own.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.status !== undefined) {
    const status = String(body.status)
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 })
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "housingStatus" = ? WHERE id = ?`, status, regId)
    // Keep the registration's overnight answer coherent with the board's call —
    // these are the working actuals the grant report totals.
    const needsHotel = String(own[0].needsHotel || '')
    if (status === 'local' && needsHotel !== 'No') {
      await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "needsHotel" = 'No' WHERE id = ?`, regId)
    } else if (status !== 'local' && needsHotel === 'No') {
      await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "needsHotel" = 'Yes' WHERE id = ?`, regId)
    }
  }
  if (body.hotelName !== undefined) await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "hotelName" = ? WHERE id = ?`, String(body.hotelName ?? '').slice(0, 120), regId)
  if (body.hotelRooms !== undefined) await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "hotelRooms" = ? WHERE id = ?`, Math.max(0, Number(body.hotelRooms) || 0), regId)
  if (body.hotelNights !== undefined) await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "hotelNights" = ? WHERE id = ?`, Math.max(0, Number(body.hotelNights) || 0), regId)
  if (body.notes !== undefined) await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "housingNotes" = ? WHERE id = ?`, String(body.notes ?? '').slice(0, 500), regId)

  const after: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT needsHotel, housingStatus, hotelName, hotelRooms, hotelNights FROM "TeamRegistration" WHERE id = ?`, regId)
  return NextResponse.json({ ok: true, status: after.length ? deriveStatus(after[0]) : 'needs' })
}
