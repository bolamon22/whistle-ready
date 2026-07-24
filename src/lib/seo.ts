import { DOMAIN_BY_SLUG } from './orgDomains'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://whistleready.app').replace(/\/+$/, '')

export function abs(path: string): string {
  if (!path) return SITE_URL
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

// Canonical URL for an org page. Orgs with their own domain canonicalize THERE
// (e.g. https://sunshineeventsgroup.com/gallery) — regardless of which host the
// visitor used — so search credit consolidates on the org's domain. Everyone
// else stays under whistleready.app/o/{slug}.
export function orgAbs(slug: string, path = ''): string {
  const domain = DOMAIN_BY_SLUG[slug]
  return domain ? `https://${domain}${path}` : abs(`/o/${slug}${path}`)
}

// Same idea for a tournament page: if the owning org has a custom domain, the
// canonical lives there (/tournaments/* passes through on custom hosts).
export function tournamentAbs(orgSlug: string | null | undefined, path: string): string {
  const domain = orgSlug ? DOMAIN_BY_SLUG[orgSlug] : undefined
  return domain ? `https://${domain}${path}` : abs(path)
}

export function stripMd(s?: string): string {
  return (s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`~|-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function clip(s?: string, n = 155): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t
}
