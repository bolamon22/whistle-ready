// Links that go in the officials' emails (Bo, Oct 22 2026: refs and scorekeepers asked to
// get the rules and field maps with their games; "those could be links to the ones that
// already exist on the website"). For an event the organization runs itself, they come
// from what the public event page already shows:
//   - Rules: the event's rules page, when it has rules (the event's own text or a
//     linked Rules library set, lib/rules; AppSetting tournamentSite:{id}, orgRules:{org}).
//   - Field map and directions for each venue that has them (Tournament.venues, raw).
// An Assigner-plan organization usually has neither (the tournament director's site has
// them); its own uploads or links are a later step. Server only. Never throws.

import prisma from '@/lib/db'
import { resolveRules } from '@/lib/rules'
import { SITE_URL, tournamentAbs } from '@/lib/seo'

export type OfficialLink = { kind: 'rules' | 'map' | 'directions'; label: string; url: string }

const httpUrl = (u: string, origin: string) => {
  const s = String(u || '').trim()
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('/')) return origin + s
  return ''
}

export async function officialLinks(tournamentId: string): Promise<OfficialLink[]> {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT t."venues" AS venues, t."orgId" AS orgId, o."slug" AS slug FROM "Tournament" t LEFT JOIN "Organization" o ON o."id" = t."orgId" WHERE t."id" = ?`, tournamentId)
    const row = rows[0]
    if (!row) return []
    // Uploaded maps (/api/img/...) are served from whistleready.app, not from a custom domain.
    const origin = SITE_URL
    const keys = [`tournamentSite:${tournamentId}`, ...(row.orgId ? [`orgRules:${row.orgId}`] : [])]
    const settings = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const val = (k: string) => { try { return JSON.parse(settings.find(s => s.key === k)?.value || '{}') } catch { return {} } }
    const site = val(`tournamentSite:${tournamentId}`)
    const sets = row.orgId ? val(`orgRules:${row.orgId}`)?.sets : []
    const out: OfficialLink[] = []
    if (resolveRules(site, Array.isArray(sets) ? sets : []).body.trim()) {
      out.push({ kind: 'rules', label: 'Rules', url: tournamentAbs(row.slug || null, `/tournaments/${tournamentId}/rules`) })
    }
    let venues: any[] = []
    try { const raw = JSON.parse(row.venues || '[]'); venues = Array.isArray(raw) ? raw : (Array.isArray(raw?.venues) ? raw.venues : []) } catch { /* none */ }
    const named = venues.filter(v => v && (v.fieldMapUrl || v.mapUrl))
    for (const v of named) {
      const name = String(v.name || '').trim()
      const map = httpUrl(v.fieldMapUrl, origin)
      if (map) out.push({ kind: 'map', label: named.length > 1 && name ? `Field map: ${name}` : 'Field map', url: map })
      const dir = httpUrl(v.mapUrl, origin)
      if (dir) out.push({ kind: 'directions', label: named.length > 1 && name ? `Directions: ${name}` : `Directions${name ? ` to ${name}` : ''}`, url: dir })
    }
    return out
  } catch (e) {
    console.error('officialLinks', e)
    return []
  }
}

/** The email block: a short "Before you go" list of the links. '' when there are none. */
export function officialLinksHtml(links: OfficialLink[], esc: (s: string) => string): string {
  if (!links.length) return ''
  return `<p style="margin:20px 0 6px;font:700 13px Arial,Helvetica,sans-serif;color:#0f172a">Before you go</p>
    <p style="margin:0;font-size:14px;line-height:1.9">${links.map(l => `<a href="${esc(l.url)}" style="color:#0f766e;font-weight:700">${esc(l.label)}</a>`).join(' &nbsp;·&nbsp; ')}</p>`
}

export function officialLinksText(links: OfficialLink[]): string {
  return links.length ? '\n\nBefore you go:\n' + links.map(l => `${l.label}: ${l.url}`).join('\n') : ''
}
