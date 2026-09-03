// Server side of the player pass: find the waiver by its pass token, gather what the card
// shows (tournament, org, club logo, photo), and turn images into something Satori can
// draw. Rendering itself is src/lib/playerPassCard.tsx (pure) + the /pass/[token]/card.png
// route.
import QRCode from 'qrcode'
import { createClient } from '@libsql/client'
import { prisma } from '@/lib/db'
import { getSubmissionByPassToken, passCode, type FormSubmission } from '@/lib/formSubmissions'
import { DOMAIN_BY_SLUG } from '@/lib/orgDomains'
import { cleanCardLink, qrLabelFor } from '@/lib/cardLink'
export { cleanCardLink, qrLabelFor }
import type { PassCardData } from '@/lib/playerPassCard'

export type PlayerPass = {
  submission: FormSubmission & { orgId: string; tournamentId: string }
  card: Omit<PassCardData, 'qrDataUrl'>
  /** What the QR opens: the link the family chose (highlight reel, Instagram…), else the card page. */
  qrUrl: string
  /** Absolute URL of the card page itself (email, share). */
  passUrl: string
}

/** Public origin for absolute links. NEXTAUTH_URL in production; the request's host otherwise. */
export function appBaseUrl(req?: Request | Headers): string {
  const env = String(process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env
  if (req) {
    try {
      const h = req instanceof Headers ? req : req.headers
      const host = h.get('x-forwarded-host') || h.get('host') || ''
      const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
      if (host) return `${proto}://${host}`
    } catch { /* fall through */ }
  }
  return env || 'http://localhost:3000'
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "2026-10-17" + "2026-10-18" → "Oct 17–18, 2026"; tolerant of blanks and odd formats. */
export function fmtRange(start: string, end: string): string {
  const parse = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null }
  const a = parse(start), b = parse(end)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  if (!a && !b) return ''
  if (!a || !b || a.getTime() === b.getTime()) { const d = (a || b)!; return d.toLocaleDateString('en-US', { ...opts, year: 'numeric' }) }
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${a.getUTCDate()}–${b.getUTCDate()}, ${a.getUTCFullYear()}`
  }
  return `${a.toLocaleDateString('en-US', opts)} – ${b.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

/** Team as the parent picked it, without the "Club — " prefix the stored teamName carries. */
export function teamOnly(data: any): string {
  const pick = String(data?.teamPick || '').trim()
  if (pick && pick !== '__other') return pick
  const other = String(data?.teamOther || '').trim()
  if (other) return other
  const full = String(data?.teamName || '').trim(), club = String(data?.clubName || '').trim()
  if (club && full.startsWith(club)) return full.slice(club.length).replace(/^\s*[—\-–]\s*/, '').trim()
  return full === '__other' ? '' : full
}

/** The org's "Player pass" switch (Forms settings → Player waiver → Optional fields). Off by default. */
export async function playerPassEnabled(orgId: string): Promise<boolean> {
  if (!orgId) return false
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>('SELECT value FROM "AppSetting" WHERE key = ?', `orgForms:${orgId}`)
    const cfg = rows?.[0]?.value ? JSON.parse(String(rows[0].value) || '{}') : {}
    return cfg?.player?.fields?.playerPass === true
  } catch { return false }
}

export async function loadPlayerPass(token: string, base: string): Promise<PlayerPass | null> {
  const sub = await getSubmissionByPassToken(token)
  if (!sub || sub.formType !== 'player') return null
  if (!(await playerPassEnabled(sub.orgId))) return null   // switched off → the pass does not exist
  const data = sub.data || {}

  let tournament: any = null, org: any = null
  if (sub.tournamentId) {
    try { const r = await prisma.$queryRawUnsafe<any[]>('SELECT id, name, logoUrl, startDate, endDate, location, orgId FROM "Tournament" WHERE id = ?', sub.tournamentId); tournament = r?.[0] || null } catch {}
  }
  const orgId = sub.orgId || tournament?.orgId || ''
  if (orgId) {
    try { const r = await prisma.$queryRawUnsafe<any[]>('SELECT id, name, slug, logoUrl FROM "Organization" WHERE id = ?', orgId); org = r?.[0] || null } catch {}
    try {
      const s = await prisma.$queryRawUnsafe<any[]>('SELECT value FROM "AppSetting" WHERE key = ?', `orgSite:${orgId}`)
      if (s?.[0]?.value && org) { const c = JSON.parse(String(s[0].value) || '{}'); if (c.logo) org.logoUrl = c.logo }
    } catch {}
  }

  // Club logo + division come from the club's team registration for this tournament.
  const clubName = String(data.clubName || '').trim()
  const team = teamOnly(data)
  let clubLogoUrl = '', division = ''
  if (sub.tournamentId && clubName) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        'SELECT r.clubLogoUrl AS clubLogo, t.teamName AS team, t.division AS division, t.logoUrl AS teamLogo FROM "TeamRegistration" r LEFT JOIN "RegisteredTeam" t ON t.registrationId = r.id WHERE r.tournamentId = ? AND r.clubName = ? AND r.deletedAt IS NULL',
        sub.tournamentId, clubName)
      for (const r of rows || []) {
        if (team && String(r.team || '').trim() === team) {
          division = String(r.division || '').trim()
          if (r.teamLogo) clubLogoUrl = String(r.teamLogo)
        }
      }
      if (!clubLogoUrl) for (const r of rows || []) { const l = String(r.clubLogo || r.teamLogo || '').trim(); if (l) { clubLogoUrl = l; break } }
    } catch {}
  }

  const passUrl = `${base}/pass/${token}`
  const cardLink = cleanCardLink(data.cardLink)
  const qrUrl = cardLink || passUrl
  const card: PlayerPass['card'] = {
    code: passCode(token),
    playerName: String(data.playerName || '').trim() || 'Player',
    // "Other / not listed" stores no club and the typed "Club Team" text as the team: show
    // that text where the club goes so the card doesn't say "Club".
    clubName: clubName || team,
    teamName: clubName ? team : '',
    division,
    jersey: String(data.jerseyNumber || '').trim().replace(/^#/, ''),
    photoUrl: String(data.photoUrl || '').trim(),
    clubLogoUrl,
    tournamentName: String(tournament?.name || '').trim(),
    tournamentLogoUrl: String(tournament?.logoUrl || org?.logoUrl || '').trim(),
    tournamentDates: fmtRange(String(tournament?.startDate || ''), String(tournament?.endDate || '')),
    location: String(tournament?.location || '').trim(),
    orgName: String(org?.name || '').trim(),
    orgLogoUrl: String(org?.logoUrl || '').trim(),
    orgSite: (org?.slug && DOMAIN_BY_SLUG[String(org.slug)]) || '',
    signedOn: fmtDate(sub.submittedAt),
    qrLabel: cardLink ? qrLabelFor(cardLink) : 'My player card',
  }
  return { submission: sub, card, qrUrl, passUrl }
}

// ── images for Satori ────────────────────────────────────────────────────────
// Satori draws http(s) URLs and data URLs. Uploads live in the DB (/api/img/<id>), so
// read those straight from the table instead of calling ourselves over HTTP.
export async function imageForSatori(url: string, base: string): Promise<string> {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.startsWith('data:')) return u
  const m = /^\/api\/img\/([^/?#]+)/.exec(u)
  if (m) {
    // Same read as /api/img/[id]: the blob comes back as a Uint8Array / ArrayBuffer.
    try {
      const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
      const r = await client.execute({ sql: 'SELECT mime, data FROM "UploadedImage" WHERE id = ?', args: [m[1]] })
      const row = r.rows[0] as any
      if (row?.data) {
        const raw = row.data
        const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
        return `data:${String(row.mime || 'image/png')};base64,${Buffer.from(bytes).toString('base64')}`
      }
    } catch {}
    return ''
  }
  if (u.startsWith('/')) return `${base}${u}`
  return u
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 448, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } })
}

// ── fonts ────────────────────────────────────────────────────────────────────
// Inter 400/700/800 from Google Fonts (TTF, which Satori can read), cached for the life
// of the process. If the fetch fails the card still renders in Satori's default font.
type SatoriFont = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: 'normal' }
let fontCache: Promise<SatoriFont[]> | null = null
export function loadPassFonts(): Promise<SatoriFont[]> {
  if (!fontCache) {
    fontCache = (async () => {
      const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800', {
        headers: { 'User-Agent': 'Mozilla/5.0 (BB10; Touch) AppleWebKit/537.10+ (KHTML, like Gecko) Version/10.0.9.2372 Mobile Safari/537.10+' },
        cache: 'no-store',
      }).then(r => r.text())
      const out: SatoriFont[] = []
      for (const weight of [400, 700, 800] as const) {
        const block = css.split('}').find(b => new RegExp(`font-weight:\\s*${weight}\\b`).test(b)) || ''
        const url = /url\((https:[^)]+\.(?:ttf|otf|woff))\)/.exec(block)?.[1]
        if (!url) continue
        const data = await fetch(url, { cache: 'no-store' }).then(r => r.arrayBuffer())
        out.push({ name: 'Inter', data, weight, style: 'normal' })
      }
      if (!out.length) throw new Error('no fonts')
      return out
    })().catch(e => { fontCache = null; throw e })
  }
  return fontCache
}
