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
import type { PassCardData, CardTheme } from '@/lib/playerPassCard'
import { CARD_THEMES } from '@/lib/playerPassCard'

export type PlayerPass = {
  submission: FormSubmission & { orgId: string; tournamentId: string }
  card: Omit<PassCardData, 'qrDataUrl' | 'qr2DataUrl'>
  theme: CardTheme
  /** What the player's QR opens: the link the family chose (highlight reel, Instagram…), else the card page. */
  qrUrl: string
  /** What the event / organization QR opens (see eventQrFor). */
  qr2Url: string
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

// ── org settings for the card ────────────────────────────────────────────────
export type EventQrChoice = 'event' | 'instagram' | 'facebook' | 'website' | 'custom'
export type PlayerPassConfig = {
  enabled: boolean
  /** Card look (Forms settings → Player card → Card style). */
  theme: CardTheme
  /** The second QR on the card (Forms settings → Player card): what it opens + caption. */
  eventQr: EventQrChoice
  eventLink: string
  eventLabel: string
}
export async function playerPassConfig(orgId: string): Promise<PlayerPassConfig> {
  const off: PlayerPassConfig = { enabled: false, theme: 'classic', eventQr: 'event', eventLink: '', eventLabel: '' }
  if (!orgId) return off
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>('SELECT value FROM "AppSetting" WHERE key = ?', `orgForms:${orgId}`)
    const cfg = rows?.[0]?.value ? JSON.parse(String(rows[0].value) || '{}') : {}
    const p = cfg?.player || {}
    const choice = String(p.cardEventQr || 'event') as EventQrChoice
    const theme = String(p.cardTheme || 'classic') as CardTheme
    return {
      enabled: p?.fields?.playerPass === true,
      theme: CARD_THEMES.some(t => t.id === theme) ? theme : 'classic',
      eventQr: (['event', 'instagram', 'facebook', 'website', 'custom'] as string[]).includes(choice) ? choice : 'event',
      eventLink: String(p.cardEventLink || '').trim(),
      eventLabel: String(p.cardEventLabel || '').trim(),
    }
  } catch { return off }
}
/** The org's "Player pass" switch (Forms settings → Player waiver → Optional fields). Off by default. */
export async function playerPassEnabled(orgId: string): Promise<boolean> { return (await playerPassConfig(orgId)).enabled }

/** Org website config (logo override + socials) from the site editor. */
export async function orgSiteConfig(orgId: string): Promise<{ logo: string; socials: { instagram: string; facebook: string; website: string } }> {
  const out = { logo: '', socials: { instagram: '', facebook: '', website: '' } }
  if (!orgId) return out
  try {
    const s = await prisma.$queryRawUnsafe<any[]>('SELECT value FROM "AppSetting" WHERE key = ?', `orgSite:${orgId}`)
    const c = s?.[0]?.value ? JSON.parse(String(s[0].value) || '{}') : {}
    out.logo = String(c.logo || '')
    out.socials = { instagram: String(c.socials?.instagram || ''), facebook: String(c.socials?.facebook || ''), website: String(c.socials?.website || '') }
  } catch {}
  return out
}

/** Instagram handle or URL → URL; anything already a URL passes through cleanCardLink. */
function socialUrl(kind: 'instagram' | 'facebook', v: string): string {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s) || s.includes('.')) return cleanCardLink(s)
  const handle = s.replace(/^@/, '')
  return kind === 'instagram' ? `https://instagram.com/${handle}` : `https://facebook.com/${handle}`
}

/**
 * The event / organization QR on the card, per the org's setting: the tournament's event page
 * on the org's own domain (default), the org's Instagram or Facebook, its website, or a custom
 * link. Falls back down the list when the chosen one is blank.
 */
export function eventQrFor(a: { cfg: PlayerPassConfig; socials: { instagram: string; facebook: string; website: string }; tournamentId: string; orgSite: string; base: string }): { url: string; label: string } {
  const siteBase = a.orgSite ? `https://${a.orgSite}` : a.base
  const event = a.tournamentId ? { url: `${siteBase}/tournaments/${a.tournamentId}/event`, label: 'Event info' } : null
  const insta = socialUrl('instagram', a.socials.instagram); const fb = socialUrl('facebook', a.socials.facebook)
  const web = cleanCardLink(a.socials.website) || (a.orgSite ? `https://${a.orgSite}` : '')
  const custom = cleanCardLink(a.cfg.eventLink)
  const pick = (): { url: string; label: string } | null => {
    switch (a.cfg.eventQr) {
      case 'custom': return custom ? { url: custom, label: a.cfg.eventLabel || 'Scan me' } : null
      case 'instagram': return insta ? { url: insta, label: a.cfg.eventLabel || 'Follow us on Instagram' } : null
      case 'facebook': return fb ? { url: fb, label: a.cfg.eventLabel || 'Find us on Facebook' } : null
      case 'website': return web ? { url: web, label: a.cfg.eventLabel || a.orgSite || 'Our website' } : null
      default: return event ? { ...event, label: a.cfg.eventLabel || event.label } : null
    }
  }
  return pick() || event || (insta ? { url: insta, label: 'Follow us on Instagram' } : null) || (web ? { url: web, label: a.orgSite || 'Our website' } : null) || { url: a.base, label: 'Whistle Ready' }
}

export async function loadPlayerPass(token: string, base: string): Promise<PlayerPass | null> {
  const sub = await getSubmissionByPassToken(token)
  if (!sub || sub.formType !== 'player') return null
  const cfg = await playerPassConfig(sub.orgId)
  if (!cfg.enabled) return null   // switched off → the card does not exist
  const data = sub.data || {}

  let tournament: any = null, org: any = null
  if (sub.tournamentId) {
    try { const r = await prisma.$queryRawUnsafe<any[]>('SELECT id, name, logoUrl, startDate, endDate, location, orgId FROM "Tournament" WHERE id = ?', sub.tournamentId); tournament = r?.[0] || null } catch {}
  }
  const orgId = sub.orgId || tournament?.orgId || ''
  const site = await orgSiteConfig(orgId)
  if (orgId) {
    try { const r = await prisma.$queryRawUnsafe<any[]>('SELECT id, name, slug, logoUrl FROM "Organization" WHERE id = ?', orgId); org = r?.[0] || null } catch {}
    if (org && site.logo) org.logoUrl = site.logo
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
  // A logo the family uploaded on the form when the club had none (also "Other / not listed" clubs).
  if (!clubLogoUrl) clubLogoUrl = String(data.clubLogoUrl || '').trim()

  const passUrl = `${base}/pass/${token}`
  const cardLink = cleanCardLink(data.cardLink)
  const qrUrl = cardLink || passUrl
  const orgSite = (org?.slug && DOMAIN_BY_SLUG[String(org.slug)]) || ''
  const eventQr = eventQrFor({ cfg, socials: site.socials, tournamentId: sub.tournamentId, orgSite, base })
  const card: PlayerPass['card'] = {
    code: passCode(token),
    playerName: String(data.playerName || '').trim() || 'Player',
    // "Other / not listed" stores no club and the typed "Club Team" text as the team: show
    // that text where the club goes so the card doesn't say "Club".
    clubName: clubName || team,
    teamName: clubName ? team : '',
    division,
    jersey: String(data.jerseyNumber || '').trim().replace(/^#/, ''),
    position: String(data.position || '').trim(),
    photoUrl: String(data.photoUrl || '').trim(),
    clubLogoUrl,
    tournamentName: String(tournament?.name || '').trim(),
    tournamentLogoUrl: String(tournament?.logoUrl || org?.logoUrl || '').trim(),
    tournamentDates: fmtRange(String(tournament?.startDate || ''), String(tournament?.endDate || '')),
    location: String(tournament?.location || '').trim(),
    orgName: String(org?.name || '').trim(),
    orgLogoUrl: String(org?.logoUrl || '').trim(),
    orgSite,
    signedOn: fmtDate(sub.submittedAt),
    qrLabel: cardLink ? qrLabelFor(cardLink) : 'My player card',
    qr2Label: eventQr.label,
  }
  return { submission: sub, card, theme: cfg.theme, qrUrl, qr2Url: eventQr.url, passUrl }
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
