import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { orgById } from '@/lib/org'
import { sendEmail, orgSender } from '@/lib/email'

// Team housing (Bo, Sep 5 2026): the org's housing company gets a weekly report of
// which clubs still need hotel blocks, plus a magic-link board (no login) to log
// bookings. It shares data with /tournaments/[id]/travel — clubs answer needsHotel at
// registration, and the hotel/rooms/nights the housing contact logs are EXACTLY the
// raw columns the grant room-night report totals. housingStatus/housingNotes are two
// more raw TeamRegistration columns (house pattern: guarded ALTERs, not in the schema).

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

export type HousingStatus = 'needs' | 'progress' | 'booked' | 'local'

export async function ensureHousingCols() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelName" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelRooms" INTEGER NOT NULL DEFAULT 0`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelNights" INTEGER NOT NULL DEFAULT 0`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "housingStatus" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "housingNotes" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  // One club can split across multiple hotels (they book through the housing
  // company's own site; Vinny logs what lands). Bookings are the source of truth;
  // the reg's hotelName/hotelRooms/hotelNights become SYNCED AGGREGATES so older
  // readers (confirmation payloads, exports) keep working. In-app table, not in
  // schema.prisma — same lesson as StaffInvite: a repo migration means nothing.
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "HousingBooking" (
      id TEXT PRIMARY KEY,
      regId TEXT NOT NULL,
      hotel TEXT NOT NULL DEFAULT '',
      rooms INTEGER NOT NULL DEFAULT 0,
      nights INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "HousingBooking_regId" ON "HousingBooking"(regId)`)
  } catch { /* exists */ }
}

export type HousingBookingRow = { id: string; hotel: string; rooms: number; nights: number }

export async function bookingsByReg(regIds: string[]): Promise<Map<string, HousingBookingRow[]>> {
  const map = new Map<string, HousingBookingRow[]>()
  if (!regIds.length) return map
  const ph = regIds.map(() => '?').join(',')
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, regId, hotel, rooms, nights FROM "HousingBooking" WHERE regId IN (${ph}) ORDER BY createdAt ASC`, ...regIds)
  for (const r of rows) {
    const k = String(r.regId)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push({ id: String(r.id), hotel: String(r.hotel ?? ''), rooms: Number(r.rooms) || 0, nights: Number(r.nights) || 0 })
  }
  return map
}

// Keep the reg's legacy single-hotel columns describing the bookings in aggregate,
// so deriveStatus and every older reader stay truthful: total rooms/night, a
// nights figure that makes rooms × nights equal the real room-night total, and a
// name that says when a club is split.
export async function syncRegAggregates(regId: string) {
  const rows = (await bookingsByReg([regId])).get(regId) ?? []
  const real = rows.filter(b => b.hotel.trim() || b.rooms || b.nights)
  const sumRooms = real.reduce((s, b) => s + b.rooms, 0)
  const roomNights = real.reduce((s, b) => s + b.rooms * b.nights, 0)
  const name = real.length === 0 ? '' : real.length === 1 ? real[0].hotel : `${real.length} hotels`
  const nights = sumRooms > 0 ? Math.round(roomNights / sumRooms) : (real.length ? real[0].nights : 0)
  await prisma.$executeRawUnsafe(
    `UPDATE "TeamRegistration" SET "hotelName" = ?, "hotelRooms" = ?, "hotelNights" = ? WHERE id = ?`,
    name.slice(0, 120), sumRooms, nights, regId)
}

// Explicit board status wins; otherwise derive: "No" at registration = local,
// a named hotel with rooms+nights = booked, a named hotel alone = in progress.
export function deriveStatus(r: { needsHotel?: unknown; housingStatus?: unknown; hotelName?: unknown; hotelRooms?: unknown; hotelNights?: unknown }): HousingStatus {
  const hs = String(r.housingStatus || '')
  if (hs === 'local') return 'local'
  if (hs === 'booked' || hs === 'progress' || hs === 'needs') return hs as HousingStatus
  if (String(r.needsHotel || '') === 'No') return 'local'
  const rooms = Number(r.hotelRooms) || 0
  const nights = Number(r.hotelNights) || 0
  if (String(r.hotelName || '').trim()) return rooms > 0 && nights > 0 ? 'booked' : 'progress'
  return 'needs'
}

export type HousingSettings = { contactName: string; contactEmail: string; cadence: 'weekly' | 'twice' | 'manual'; includeContact: boolean; bookingUrl: string; lastSentAt: string }
const SETTINGS_DEFAULTS: HousingSettings = { contactName: '', contactEmail: '', cadence: 'weekly', includeContact: true, bookingUrl: '', lastSentAt: '' }

export async function housingSettings(orgId: string): Promise<HousingSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `housing:${orgId}` } })
    if (row?.value) return { ...SETTINGS_DEFAULTS, ...JSON.parse(row.value) }
  } catch { /* defaults */ }
  return { ...SETTINGS_DEFAULTS }
}

export async function saveHousingSettings(orgId: string, patch: Partial<HousingSettings>): Promise<HousingSettings> {
  const merged = { ...(await housingSettings(orgId)), ...patch }
  const key = `housing:${orgId}`
  const value = JSON.stringify(merged)
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  return merged
}

// Board link code — same minting rules as the recruiting link (joinCode).
export async function housingCode(orgId: string): Promise<string> {
  const key = `housingCode:${orgId}`
  const existing = await prisma.appSetting.findUnique({ where: { key } })
  let code = existing?.value || ''
  if (!code) {
    code = crypto.randomBytes(6).toString('base64url')
    await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } })
  }
  const mapKey = `housingCodeMap:${code}`
  await prisma.appSetting.upsert({ where: { key: mapKey }, update: { value: orgId }, create: { key: mapKey, value: orgId } })
  return code
}

export async function rotateHousingCode(orgId: string): Promise<string> {
  const old = (await prisma.appSetting.findUnique({ where: { key: `housingCode:${orgId}` } }))?.value
  const code = crypto.randomBytes(6).toString('base64url')
  await prisma.appSetting.upsert({ where: { key: `housingCode:${orgId}` }, update: { value: code }, create: { key: `housingCode:${orgId}`, value: code } })
  await prisma.appSetting.upsert({ where: { key: `housingCodeMap:${code}` }, update: { value: orgId }, create: { key: `housingCodeMap:${code}`, value: orgId } })
  if (old) { try { await prisma.appSetting.delete({ where: { key: `housingCodeMap:${old}` } }) } catch { /* no map */ } }
  return code
}

export async function orgForHousingCode(code: string): Promise<string | null> {
  if (!code || code.length > 16) return null
  const map = await prisma.appSetting.findUnique({ where: { key: `housingCodeMap:${code}` } })
  const orgId = map?.value || null
  if (!orgId) return null
  const current = await prisma.appSetting.findUnique({ where: { key: `housingCode:${orgId}` } })
  return current?.value === code ? orgId : null // rotated-away links die
}

export function housingBoardUrl(code: string) { return `${APP_URL}/housing/${code}` }

export type HousingClub = {
  regId: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; numTeams: number; needsHotel: string; status: HousingStatus
  bookings: HousingBookingRow[]; roomNights: number; notes: string
}
export type HousingEvent = { id: string; name: string; startDate: string; endDate: string; location: string; clubs: HousingClub[] }

// Upcoming tournaments for the org (same date rule as the staff signup's event list).
export async function housingBoard(orgId: string): Promise<HousingEvent[]> {
  await ensureHousingCols()
  const ts: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, startDate, endDate, location FROM "Tournament" WHERE orgId = ? ORDER BY CASE WHEN startDate = '' THEN 1 ELSE 0 END, startDate ASC`, orgId)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = ts.filter(t => { const last = String(t.endDate || '') || String(t.startDate || ''); return !last || last >= today }).slice(0, 8)
  const events: HousingEvent[] = []
  for (const t of upcoming) {
    const regs: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, clubName, clubContact, contactEmail, contactPhone, clubBasedIn, numTeams, needsHotel, hotelName, hotelRooms, hotelNights, housingStatus, housingNotes
       FROM "TeamRegistration" WHERE tournamentId = ? AND deletedAt IS NULL ORDER BY clubName ASC`, String(t.id))
    // Rows written before multi-hotel bookings existed carry a single hotel in the
    // legacy columns — turn that into their first booking row, once.
    const bookings = await bookingsByReg(regs.map(r => String(r.id)))
    for (const r of regs) {
      const id = String(r.id)
      if (!bookings.has(id) && String(r.hotelName ?? '').trim()) {
        const b: HousingBookingRow = { id: crypto.randomUUID(), hotel: String(r.hotelName).trim(), rooms: Number(r.hotelRooms) || 0, nights: Number(r.hotelNights) || 0 }
        try {
          await prisma.$executeRawUnsafe(`INSERT INTO "HousingBooking" (id, regId, hotel, rooms, nights, source) VALUES (?, ?, ?, ?, ?, 'legacy')`,
            b.id, id, b.hotel, b.rooms, b.nights)
          bookings.set(id, [b])
        } catch { /* concurrent migrate */ }
      }
    }
    events.push({
      id: String(t.id), name: String(t.name ?? ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || ''),
      clubs: regs.map(r => {
        const bs = bookings.get(String(r.id)) ?? []
        return {
          regId: String(r.id), clubName: String(r.clubName ?? ''), clubContact: String(r.clubContact ?? ''),
          contactEmail: String(r.contactEmail ?? ''), contactPhone: String(r.contactPhone ?? ''),
          clubBasedIn: String(r.clubBasedIn ?? ''), numTeams: Number(r.numTeams) || 0, needsHotel: String(r.needsHotel ?? ''),
          status: deriveStatus(r), bookings: bs, roomNights: bs.reduce((s, b) => s + b.rooms * b.nights, 0),
          notes: String(r.housingNotes ?? ''),
        }
      }),
    })
  }
  return events
}

const STATUS_EMAIL: Record<HousingStatus, { label: string; color: string }> = {
  needs: { label: 'NEEDS HOTELS', color: '#dc2626' },
  progress: { label: 'IN PROGRESS', color: '#d97706' },
  booked: { label: 'BOOKED', color: '#059669' },
  local: { label: 'LOCAL — NOT NEEDED', color: '#64748b' },
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const fmtDates = (a: string, b: string) => {
  const f = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e
}

// Build + send the report (used by Send now AND the Monday/Thursday cron).
export async function sendHousingReport(orgId: string): Promise<{ ok: boolean; error?: string; needs?: number }> {
  const settings = await housingSettings(orgId)
  if (!settings.contactEmail) return { ok: false, error: 'Add your housing contact’s email first' }
  const events = (await housingBoard(orgId)).filter(e => e.clubs.length)
  if (!events.length) return { ok: false, error: 'No upcoming events with registrations yet' }
  const org = await orgById(orgId)
  const orgLabel = org?.name || 'Whistle Ready'
  const boardUrl = housingBoardUrl(await housingCode(orgId))
  const all = events.flatMap(e => e.clubs)
  const count = (s: HousingStatus) => all.filter(c => c.status === s).length
  const needs = count('needs')

  const chip = (n: number, label: string, color: string, bg: string) =>
    `<td style="background:${bg};border-radius:10px;padding:8px 12px;text-align:center;"><div style="font-size:18px;font-weight:800;color:${color};">${n}</div><div style="font-size:10px;font-weight:700;color:${color};letter-spacing:0.04em;">${label}</div></td>`

  const eventBlocks = events.map(ev => {
    const rows = ev.clubs.map(c => {
      const st = STATUS_EMAIL[c.status]
      const booked = c.bookings.length
        ? ` · ${c.bookings.map(b => `${esc(b.hotel || 'Hotel TBD')} ${b.rooms}rm×${b.nights}nt`).join(' + ')}`
        : ''
      const contact = settings.includeContact && c.status !== 'local' && (c.clubContact || c.contactEmail || c.contactPhone)
        ? `<div style="font-size:11px;color:#64748b;">${esc([c.clubContact, c.contactPhone, c.contactEmail].filter(Boolean).join(' · '))}</div>` : ''
      return `<tr><td style="padding:8px 4px;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">${esc(c.clubName)} <span style="font-weight:400;color:#94a3b8;">· ${c.numTeams} team${c.numTeams === 1 ? '' : 's'} · ${esc(c.clubBasedIn || '')}</span></div>
          ${contact}
        </td>
        <td style="padding:8px 4px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;"><span style="font-size:10px;font-weight:800;color:${st.color};">${st.label}</span><span style="font-size:10px;color:#64748b;">${booked}</span></td></tr>`
    }).join('')
    return `<div style="margin-top:20px;">
      <div style="border-bottom:2px solid #0f1f3d;padding-bottom:5px;"><span style="font-size:14px;font-weight:800;color:#0f172a;">${esc(ev.name)}</span> <span style="font-size:11px;color:#64748b;">${esc(fmtDates(ev.startDate, ev.endDate))}${ev.location ? ` · ${esc(ev.location)}` : ''}</span></div>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`
  }).join('')

  await sendEmail({
    ...orgSender(org),
    to: settings.contactEmail,
    subject: `Housing report — ${needs} club${needs === 1 ? '' : 's'} still need${needs === 1 ? 's' : ''} hotels`,
    html: `
      <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:0.12em;color:#0d9488;">${esc(orgLabel.toUpperCase())} · TEAM HOUSING</div>
        <h2 style="font-size: 21px; font-weight: 800; color: #0f172a; margin: 6px 0 8px;">Housing report</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          ${settings.contactName ? `Hi ${esc(settings.contactName)} — here` : 'Here'}'s where hotel blocks stand for our upcoming events.
          <strong style="color:#0f172a;">${needs} club${needs === 1 ? '' : 's'} still need${needs === 1 ? 's' : ''} rooms.</strong>
        </p>
        <table style="width:100%;border-collapse:separate;border-spacing:6px 0;"><tr>
          ${chip(needs, 'NEED HOTELS', '#dc2626', '#fef2f2')}
          ${chip(count('progress'), 'IN PROGRESS', '#d97706', '#fffbeb')}
          ${chip(count('booked'), 'BOOKED', '#059669', '#ecfdf5')}
        </tr></table>
        ${eventBlocks}
        ${settings.bookingUrl ? `<p style="color:#475569;font-size:12px;margin:16px 0 0;">Clubs book their rooms at <a href="${esc(settings.bookingUrl)}" style="color:#0d9488;">${esc(settings.bookingUrl)}</a> — log what comes through on the board so we're counting the same rooms.</p>` : ''}
        <div style="margin-top:24px;">
          <a href="${boardUrl}" style="display:inline-block;background:#14b8a6;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">Open the housing board &rarr;</a>
          <p style="color:#94a3b8;font-size:11px;margin:8px 0 0;">Your private link — no login needed. Log bookings there and ${esc(orgLabel)} sees them instantly.</p>
        </div>
        <p style="border-top:1px solid #f1f5f9;margin-top:20px;padding-top:12px;color:#94a3b8;font-size:11px;line-height:1.5;">Sent by Whistle Ready for ${esc(orgLabel)}. Reply to this email to reach us directly.</p>
      </div>
    `,
  })
  await saveHousingSettings(orgId, { lastSentAt: new Date().toISOString() })
  return { ok: true, needs }
}
