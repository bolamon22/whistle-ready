// Custom domains → org slug. To connect a new org domain:
//   1) add the host(s) here (apex + www),
//   2) add the domain in Vercel (Project → Settings → Domains),
//   3) point DNS at Vercel (A record for apex / CNAME for subdomain).
// Middleware rewrites the apex to the org's /o/[slug] pages and the org chrome
// emits root-relative links so the address bar stays clean.
export const ORG_DOMAINS: Record<string, string> = {
  'sunshinelax.com': 'sunshine-events-group',
  'www.sunshinelax.com': 'sunshine-events-group',
}

export function hostOnly(host?: string | null): string {
  return (host || '').toLowerCase().split(':')[0]
}
export function orgSlugForHost(host?: string | null): string | null {
  return ORG_DOMAINS[hostOnly(host)] || null
}
export function isCustomOrgHost(host?: string | null): boolean {
  return !!orgSlugForHost(host)
}
