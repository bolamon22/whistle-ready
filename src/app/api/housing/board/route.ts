import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { ensureHousingCols, housingBoard, housingSettings, orgForHousingCode, deriveStatus, bookingsByReg, syncRegAggregates } from '@/lib/housing'

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
  // On the housing company's door, contact info follows the org's toggle — and a
  // LOCAL club never ships contact info at all (no rooms to chase, Bo).
  const stripAll = res.viaCode && !settings.includeContact
  return NextResponse.json({
    orgName: org?.name || 'Whistle Ready',
    bookingUrl: settings.bookingUrl || '',
    events: res.viaCode
      ? events.map(e => ({ ...e, clubs: e.clubs.map(c => (stripAll || c.status === 'local') ? { ...c, clubContact: '', contactEmail: '', contactPhone: '' } : c) }))
      : events,
  })
}

const STATUSES = ['needs', 'progress', 'booked', 'local']

export async function POST(req: Request) {
  let body: {
    code?: unknown; viewOrgId?: unknown; regId?: unknown; status?: unknown; notes?: unknown
    addBooking?: { hotel?: unknown; rooms?: unknown; nights?: unknown }
    updateBooking?: { id?: unknown; hotel?: unknown; rooms?: unknown; nights?: unknown }
    removeBooking?: unknown
  } = {}
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
  if (body.notes !== undefined) await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "housingNotes" = ? WHERE id = ?`, String(body.notes ?? '').slice(0, 500), regId)

  // Bookings: one club can split across several hotels (they book through the housing
  // company's site; Vinny logs each block that lands). Every mutation re-syncs the
  // reg's aggregate columns so the travel/grant page and older readers stay truthful.
  let touchedBookings = false
  if (body.addBooking !== undefined) {
    const b = body.addBooking ?? {}
    await prisma.$executeRawUnsafe(`INSERT INTO "HousingBooking" (id, regId, hotel, rooms, nights) VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(), regId, String(b.hotel ?? '').slice(0, 120), Math.max(0, Number(b.rooms) || 0), Math.max(0, Number(b.nights) || 0))
    touchedBookings = true
  }
  if (body.updateBooking !== undefined) {
    const b = body.updateBooking ?? {}
    const bid = String(b.id ?? '')
    const owned: Record<string, unknown>[] = bid ? await prisma.$queryRawUnsafe(
      `SELECT id FROM "HousingBooking" WHERE id = ? AND regId = ?`, bid, regId) : []
    if (!owned.length) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (b.hotel !== undefined) await prisma.$executeRawUnsafe(`UPDATE "HousingBooking" SET hotel = ?, updatedAt = datetime('now') WHERE id = ?`, String(b.hotel ?? '').slice(0, 120), bid)
    if (b.rooms !== undefined) await prisma.$executeRawUnsafe(`UPDATE "HousingBooking" SET rooms = ?, updatedAt = datetime('now') WHERE id = ?`, Math.max(0, Number(b.rooms) || 0), bid)
    if (b.nights !== undefined) await prisma.$executeRawUnsafe(`UPDATE "HousingBooking" SET nights = ?, updatedAt = datetime('now') WHERE id = ?`, Math.max(0, Number(b.nights) || 0), bid)
    touchedBookings = true
  }
  if (body.removeBooking !== undefined) {
    const bid = String(body.removeBooking ?? '')
    if (bid) await prisma.$executeRawUnsafe(`DELETE FROM "HousingBooking" WHERE id = ? AND regId = ?`, bid, regId)
    touchedBookings = true
  }
  if (touchedBookings) await syncRegAggregates(regId)

  const after: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT needsHotel, housingStatus, hotelName, hotelRooms, hotelNights FROM "TeamRegistration" WHERE id = ?`, regId)
  const bookings = (await bookingsByReg([regId])).get(regId) ?? []
  return NextResponse.json({
    ok: true,
    status: after.length ? deriveStatus(after[0]) : 'needs',
    bookings,
    roomNights: bookings.reduce((s, b) => s + b.rooms * b.nights, 0),
  })
}
