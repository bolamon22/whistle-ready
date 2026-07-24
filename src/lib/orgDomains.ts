// Custom domains → org slug, for serving an org's pages AT a custom domain root
// (host-based routing in middleware + root-relative org chrome links).
//
// sunshineeventsgroup.com is hosted directly (domain added in Vercel, DNS → Vercel):
// / serves the org landing, /gallery /work /results /register/* and info pages all
// work at the root, and /tournaments/* passes through unchanged.
// sunshinelax.com stays a GoDaddy forward (301 → sunshineeventsgroup.com after
// cutover) — a forwarded domain never reaches the app as its own host.
export const ORG_DOMAINS: Record<string, string> = {
  'sunshineeventsgroup.com': 'sunshine-events-group',
}

// Reverse map: org slug → its primary custom domain. Used by seo.ts to emit
// canonical URLs (and the sitemap) on the org's own domain so search credit
// accrues there instead of whistleready.app.
export const DOMAIN_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(ORG_DOMAINS).map(([domain, slug]) => [slug, domain])
)

// Old WordPress URLs (per host) → their new home, as 301s in middleware so
// Google transfers ranking and old backlinks keep working. Keys are
// trailing-slash-normalized paths. Event-specific targets point at the CURRENT
// season's tournament — update the ids when next year's events replace them.
// (Monster Mash 2026 = cmqjrmdum…, Fall Classic 2026 = cmqjrwppx…)
const MM = '/tournaments/cmqjrmdum0000f7po8pf4rgxo'
const FC = '/tournaments/cmqjrwppx0000krs8lu1f8xue'
export const LEGACY_REDIRECTS: Record<string, Record<string, string>> = {
  'sunshineeventsgroup.com': {
    '/our-events': '/',
    '/sunshine-summer-kick-off': '/',
    '/sunandsandlax': '/',
    '/monster-mash-lax-clash': `${MM}/event`,
    '/sunshine-state-fall-classic': `${FC}/event`,
    '/register-teams': `${MM}/register`,
    '/player-waiver': `${MM}/player-waiver`,
    '/schedules': `${MM}/public`,
    '/hotels': `${MM}/event`,
    '/locations': `${MM}/event`,
    '/fields': `${MM}/event`,
    '/rules': `${MM}/rules`,
    '/tie-breakers': `${MM}/rules`,
    '/refund-policy': '/',
    '/weather-policy': '/',
    '/vendors': '/register/vendor',
    '/more-info': '/',
    '/category/blog': '/',
    '/thrilling-showdowns-and-unyielding-spirit-a-season-recap-of-the-premier-lacrosse-league': '/',
  },
}

// The old WordPress SportsPress theme shipped demo content (fake players, teams,
// venues) that Google indexed. Anything under these prefixes 301s to the org
// landing so crawlers clean up instead of 404-looping. '/staff' is deliberately
// absent — the app's own staff routes live there.
export const LEGACY_JUNK_PREFIXES = [
  '/player/', '/team/', '/event/', '/league/', '/list/', '/position/', '/role/',
  '/season/', '/table/', '/venue/', '/calendar/', '/category/',
  '/testimonials-category/', '/trending/',
]

export function hostOnly(host?: string | null): string {
  return (host || '').toLowerCase().split(':')[0]
}
export function orgSlugForHost(host?: string | null): string | null {
  return ORG_DOMAINS[hostOnly(host)] || null
}
export function isCustomOrgHost(host?: string | null): boolean {
  return !!orgSlugForHost(host)
}
