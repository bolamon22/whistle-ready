// Campaign tagging for links we put in outbound email.
//
// Why this exists: Plausible (and GA4) can only separate "they clicked the
// email" from "they typed the address" when the link carries utm_* params.
// Without them every click lands in Direct / None, and the question Bo
// actually asks after a send — "did the teams respond?" — is unanswerable.
// (Checked Oct 15 2026: zero campaigns recorded in 30 days, because nothing
// we send has ever been tagged.)
//
// One seam, same rule as email.ts: callers pass a campaign to sendEmail() and
// this file decides what a tagged link looks like. Don't tag links by hand at
// the call sites — they drift.

import { ORG_DOMAINS } from '@/lib/orgDomains'

// Only our own pages get tagged. A utm_* param on someone else's URL (the
// housing company's booking site, a Google Maps link, an unsubscribe) is noise
// at best and breaks signed links at worst.
const TRACKED_HOSTS = new Set<string>([
  ...Object.keys(ORG_DOMAINS),
  'whistleready.app',
])

function isTracked(host: string): boolean {
  const bare = host.replace(/^www\./, '').toLowerCase()
  return TRACKED_HOSTS.has(bare)
}

/** A readable campaign id from free text — normally the email's own subject
 *  line, so what shows up in Plausible's Campaigns tab is the subject Bo
 *  typed rather than a code only this file understands. */
export function campaignSlug(s: string, max = 48): string {
  const slug = String(s || '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')   // en/em dashes people paste into subjects
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
  return slug || 'email'
}

/** Add the campaign params to one URL. Returns it unchanged when it isn't ours,
 *  isn't parseable, or already carries a utm_source (a caller that tagged it
 *  deliberately wins). */
export function withCampaign(url: string, campaign: string): string {
  let u: URL
  try { u = new URL(url) } catch { return url }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return url
  if (!isTracked(u.hostname)) return url
  if (u.searchParams.has('utm_source')) return url
  u.searchParams.set('utm_source', 'email')
  u.searchParams.set('utm_medium', 'email')
  u.searchParams.set('utm_campaign', campaign)
  return u.toString()
}

// Matches a bare URL in HTML or plain text. Trailing punctuation is excluded so
// "visit https://x.com/page." doesn't tag the sentence's full stop, and the
// quote/angle characters keep it from running past an href's closing quote.
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g

/** Tag every link to one of our hosts inside an email body.
 *
 *  Pass html:true for an HTML body. Separators inside an href are normally
 *  written `&amp;` — left alone, URL() reads the "amp;" as part of the next
 *  parameter name and the link comes out corrupted — so in HTML mode we decode
 *  before parsing and re-encode after. Plain text has no entities, so it is
 *  left exactly as written. */
export function tagLinks(body: string, campaign: string, opts?: { html?: boolean }): string {
  if (!body || !campaign) return body
  const html = !!opts?.html
  return body.replace(URL_RE, m => {
    // A URL that ends in punctuation is usually a sentence ending, not a path.
    const trail = m.match(/[.,;:!?]+$/)
    const raw = trail ? m.slice(0, -trail[0].length) : m
    const decoded = html ? raw.replace(/&amp;/g, '&') : raw
    const tagged = withCampaign(decoded, campaign)
    if (tagged === decoded) return m           // not ours: hand back the original, entities and all
    return (html ? tagged.replace(/&/g, '&amp;') : tagged) + (trail ? trail[0] : '')
  })
}
