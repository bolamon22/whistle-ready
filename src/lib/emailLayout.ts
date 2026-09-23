// One branded shell for outbound org email.
//
// Everything here is table-based with inline styles on purpose: Outlook ignores
// <style> blocks and most flexbox, Gmail strips <head>, and no client will fetch a
// web font. Colours are explicit (including on text) so a dark-mode client can't
// paint our light card behind its own light text.
//
// Images must be ABSOLUTE — a mail client has no origin to resolve `/api/img/...`
// against — so call absUrl() with the org's public base.

const INK = '#0f172a'
const BODY = '#475569'
const MUTED = '#94a3b8'
const LINE = '#e2e8f0'
const BAND = '#0b1220'
const ACCENT = '#0d9488'
const PAGE = '#f1f5f9'

export function absUrl(base: string, url?: string | null): string {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  // Anything carrying its own scheme is already as absolute as it gets, and a
  // data: URI in particular must never be prefixed. Organization.logoUrl still
  // held an inlined 271 KB PNG, so `base + u` produced a 271 KB junk src and the
  // whole message came in at ~292 KB -- past Gmail's ~102 KB limit, which clipped
  // it to a blank body. No client renders <img src="data:"> anyway (Gmail and
  // Outlook both strip it), so dropping it costs nothing and keeps mail small.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]
  if (scheme) return ''
  return `${base.replace(/\/$/, '')}/${u.replace(/^\//, '')}`
}

/**
 * Pixel size of a remote image, or null when it can't be read.
 *
 * WHY THIS EXISTS: a logo has to be given explicit width AND height in email --
 * Outlook's Word engine ignores `width:auto`, so a single fixed box is the only
 * thing that renders predictably. Hard-coding a square box is what squashed the
 * Monster Mash wordmark: it is 453x180, and 44x44 crushed it to unreadable.
 *
 * So measure once and scale to fit. PNG carries its dimensions in the IHDR at a
 * fixed offset and GIF in its header; JPEG needs a segment walk, which is more
 * than this is worth -- an unmeasurable image falls back to a square box, the
 * same as before. Cached per URL for the life of the process, so a send to forty
 * clubs fetches the logo once, not forty times.
 */
const sizeCache = new Map<string, { w: number; h: number } | null>()
export async function imageSize(url: string): Promise<{ w: number; h: number } | null> {
  if (!url) return null
  if (sizeCache.has(url)) return sizeCache.get(url)!
  let out: { w: number; h: number } | null = null
  try {
    const res = await fetch(url)
    if (res.ok) {
      const b = Buffer.from(await res.arrayBuffer())
      if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') {
        out = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
      } else if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') {
        out = { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
      }
      if (out && (!out.w || !out.h)) out = null
    }
  } catch { /* unreachable image -- fall back to the square box */ }
  sizeCache.set(url, out)
  return out
}

/** Scale to fit inside a box without distorting. Rounds to whole pixels. */
export function fitBox(nat: { w: number; h: number } | null, maxW: number, maxH: number): { w: number; h: number } {
  if (!nat || !nat.w || !nat.h) return { w: maxH, h: maxH }
  const k = Math.min(maxW / nat.w, maxH / nat.h)
  return { w: Math.max(1, Math.round(nat.w * k)), h: Math.max(1, Math.round(nat.h * k)) }
}

export function esc(x: unknown): string {
  return String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

/** A label/value block — what they applied for, at a glance. */
export function detailRows(rows: [string, string][]): string {
  const live = rows.filter(([, v]) => String(v || '').trim())
  if (!live.length) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;margin:22px 0 4px">
    ${live.map(([k, v], i) => `<tr>
      <td style="padding:11px 16px;font:400 13px/1.4 Arial,Helvetica,sans-serif;color:${MUTED};${i ? `border-top:1px solid ${LINE};` : ''}white-space:nowrap">${esc(k)}</td>
      <td style="padding:11px 16px;font:700 14px/1.45 Arial,Helvetica,sans-serif;color:${INK};${i ? `border-top:1px solid ${LINE};` : ''}text-align:right">${esc(v)}</td>
    </tr>`).join('')}
  </table>`
}

/** A button that still looks like one in Outlook. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr>
    <td style="background:${ACCENT};border-radius:10px">
      <a href="${href}" style="display:inline-block;padding:13px 28px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(label)}</a>
    </td>
  </tr></table>`
}

export function panel(title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;margin:20px 0"><tr>
    <td style="padding:16px 18px">
      <div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT};margin-bottom:8px">${esc(title)}</div>
      <div style="font:400 14px/1.65 Arial,Helvetica,sans-serif;color:${BODY}">${body}</div>
    </td>
  </tr></table>`
}

export type EmailShell = {
  orgName: string
  /** Absolute URL, or '' — absUrl() it before passing. */
  logoUrl?: string
  /** Where the header mark points. The event's own page, usually. */
  logoHref?: string
  /** Alt text for the header mark. Falls back to orgName. Images are off by
   *  default in Gmail for a sender nobody has replied to yet, so this is what
   *  most first-time recipients actually see. */
  logoAlt?: string
  /** Rendered box for the header mark. fitBox() it from imageSize() so a wide
   *  wordmark is not squashed into a square. Defaults to 44x44. */
  logoBox?: { w: number; h: number }
  /** Rendered box for the footer mark. Defaults to 40x40. */
  footerLogoBox?: { w: number; h: number }
  bannerUrl?: string
  eyebrow?: string
  title: string
  /** Pre-escaped HTML. */
  body: string
  footerNote?: string
  /** A second, smaller mark in the footer — the organizer's, when the header is
   *  carrying the event's. Absolute, same as logoUrl. */
  footerLogoUrl?: string
  footerHref?: string
}

// Guard at the point of use too: absUrl() is the only sane way in, but a caller
// that hand-builds a src shouldn't be able to blow the message past a client's
// clip limit. 2 KB is far more than any real image URL needs.
const SRC_MAX = 2000
const safeSrc = (u?: string): string => (u && u.length <= SRC_MAX && !/^data:/i.test(u) ? u : '')

export function renderEmail(a: EmailShell): string {
  const logoSrc = safeSrc(a.logoUrl)
  // width/height are attributes as well as CSS: a client with images off still
  // reserves the box, so the header does not collapse and reflow on load.
  // A wordmark gets a white chip behind it so it reads on the dark band; the chip
  // is sized to the logo rather than the logo to the chip.
  const lb = a.logoBox && a.logoBox.w && a.logoBox.h ? a.logoBox : { w: 44, h: 44 }
  const logoImg = logoSrc
    ? `<img src="${logoSrc}" width="${lb.w}" height="${lb.h}" alt="${esc(a.logoAlt || a.orgName)}" style="display:block;width:${lb.w}px;height:${lb.h}px;border:0">`
    : ''
  const logo = logoImg && a.logoHref
    ? `<a href="${a.logoHref}" style="text-decoration:none;border:0">${logoImg}</a>`
    : logoImg
  const footLogoSrc = safeSrc(a.footerLogoUrl)
  const fb = a.footerLogoBox && a.footerLogoBox.w && a.footerLogoBox.h ? a.footerLogoBox : { w: 40, h: 40 }
  const footLogoImg = footLogoSrc
    ? `<img src="${footLogoSrc}" width="${fb.w}" height="${fb.h}" alt="${esc(a.orgName)}" style="display:block;width:${fb.w}px;height:${fb.h}px;border:0">`
    : ''
  const footLogo = footLogoImg && a.footerHref
    ? `<a href="${a.footerHref}" style="text-decoration:none;border:0">${footLogoImg}</a>`
    : footLogoImg
  const banner = safeSrc(a.bannerUrl)
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:26px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border-collapse:separate;overflow:hidden;border:1px solid ${LINE}">

      <tr><td style="background:${BAND};padding:20px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${logo ? `<td style="padding-right:12px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:8px;padding:6px">${logo}</td></tr></table></td>` : ''}
          <td>
            ${a.eyebrow ? `<div style="font:700 10.5px/1 Arial,Helvetica,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#5eead4;margin-bottom:5px">${esc(a.eyebrow)}</div>` : ''}
            <div style="font:700 17px/1.2 Arial,Helvetica,sans-serif;color:#ffffff">${esc(a.orgName)}</div>
          </td>
        </tr></table>
      </td></tr>

      ${banner ? `<tr><td style="padding:0"><img src="${banner}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>` : ''}

      <tr><td style="padding:28px 26px 30px">
        <h1 style="margin:0 0 14px;font:700 23px/1.25 Arial,Helvetica,sans-serif;color:${INK}">${esc(a.title)}</h1>
        <div style="font:400 15px/1.7 Arial,Helvetica,sans-serif;color:${BODY}">${a.body}</div>
      </td></tr>

      <tr><td style="padding:16px 26px 22px;border-top:1px solid ${LINE};background:#fbfcfd">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${footLogo ? `<td style="padding-right:10px;vertical-align:top">${footLogo}</td>` : ''}
          <td style="vertical-align:top">
            <div style="font:700 13px/1.4 Arial,Helvetica,sans-serif;color:${INK}">${a.footerHref ? `<a href="${a.footerHref}" style="color:${INK};text-decoration:none">${esc(a.orgName)}</a>` : esc(a.orgName)}</div>
            ${a.footerNote ? `<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};margin-top:4px">${a.footerNote}</div>` : ''}
          </td>
        </tr></table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`
}
