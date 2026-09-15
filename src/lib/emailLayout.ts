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
  bannerUrl?: string
  eyebrow?: string
  title: string
  /** Pre-escaped HTML. */
  body: string
  footerNote?: string
}

// Guard at the point of use too: absUrl() is the only sane way in, but a caller
// that hand-builds a src shouldn't be able to blow the message past a client's
// clip limit. 2 KB is far more than any real image URL needs.
const SRC_MAX = 2000
const safeSrc = (u?: string): string => (u && u.length <= SRC_MAX && !/^data:/i.test(u) ? u : '')

export function renderEmail(a: EmailShell): string {
  const logoSrc = safeSrc(a.logoUrl)
  const logo = logoSrc
    ? `<img src="${logoSrc}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;border-radius:8px;background:#ffffff">`
    : ''
  const banner = safeSrc(a.bannerUrl)
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:26px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border-collapse:separate;overflow:hidden;border:1px solid ${LINE}">

      <tr><td style="background:${BAND};padding:20px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${logo ? `<td style="padding-right:12px">${logo}</td>` : ''}
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
        <div style="font:700 13px/1.4 Arial,Helvetica,sans-serif;color:${INK}">${esc(a.orgName)}</div>
        ${a.footerNote ? `<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};margin-top:4px">${a.footerNote}</div>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`
}
