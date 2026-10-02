import permissionsConfig from './role-permissions.json'

// Which pages a role may open. Shared by middleware (the real gate) and the
// tournament nav (so a tab the role cannot open is not shown at all).
//
// A path belongs to the MOST SPECIFIC feature whose route matches it, and the
// role needs that feature. The old check allowed a path if ANY allowed route
// was a prefix of it, and two routes were prefixes of everything: "/" (the
// tournaments list) and "/tournaments/*" (schedule). So any role with either
// could open every page, Financials included, and the per-feature switches did
// nothing for directors, assigners or schedulers.
//
// A path that no feature names keeps its old behavior: open to roles that have
// the tournaments list, closed to the rest. That covers pages added after the
// permission list was written without locking anyone out of them.

type Feature = { key: string; routes: string[] }
const FEATURES = permissionsConfig.features as Feature[]

const COMPILED = FEATURES.flatMap(f => f.routes.map(route => ({
  key: f.key,
  route,
  // "*" is one path segment; the route must end on a segment boundary, so
  // "/tournaments/*/registrations" does not also match ".../registrations-old".
  re: new RegExp('^' + route.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+').replace(/\/$/, '') + '(?=/|$)'),
  weight: route.replace(/\*/g, '').length,
})))

/** The feature that owns this path, or null when none names it. */
export function featureFor(pathname: string): string | null {
  let best: { key: string; weight: number } | null = null
  for (const c of COMPILED) {
    if (c.route === '/' ? pathname !== '/' : !c.re.test(pathname)) continue
    if (!best || c.weight > best.weight) best = { key: c.key, weight: c.weight }
  }
  return best?.key ?? null
}

export function roleHasFeature(role: string, key: string): boolean {
  if (role === 'admin') return true
  const perms = (permissionsConfig.roles as Record<string, Record<string, boolean>>)[role]
  return !!perms?.[key]
}

export function roleCanAccess(role: string, pathname: string): boolean {
  if (role === 'admin') return true
  if (pathname.startsWith('/admin')) return false
  const owner = featureFor(pathname)
  if (owner) return roleHasFeature(role, owner)
  return roleHasFeature(role, 'tournaments_list')
}
