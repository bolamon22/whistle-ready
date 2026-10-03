// Where each role lands after signing in. Shared by the login form and the org
// website's "My account" link so the two can't disagree. No imports: this runs
// in client components.
//
// On whistleready.app, "/" is the app itself: admins get the tournaments list,
// and middleware sends any other role from "/" to its own dashboard. On an
// org's own domain (sunshineeventsgroup.com), "/" is the org's public website
// and the middleware rewrite runs before that redirect. A role whose home is
// "/" would sign in there and land back on the homepage, as if nothing had
// happened.
const HOME: Record<string, string> = {
  admin:         '/',
  director:      '/dashboard/director',
  club_director: '/dashboard/club-director',
  assigner:      '/dashboard/assigner',
  scheduler:     '/dashboard/scheduler',
  coach:         '/dashboard/coach',
  staff:         '/dashboard/staff',
  ref:           '/dashboard/ref',
  scorekeeper:   '/dashboard/scorekeeper',
  parent:        '/dashboard/parent',
  viewer:        '/dashboard/viewer',
}

/** The page a role should land on. Pass onOrgDomain when "/" is an org's
 *  public site rather than the app. */
export function roleHome(role: string | null | undefined, onOrgDomain = false): string {
  const home = HOME[role || ''] || '/'
  if (!onOrgDomain || home !== '/') return home
  return role === 'admin' ? '/dashboard/director' : '/dashboard/staff'
}
