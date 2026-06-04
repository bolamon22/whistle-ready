import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import permissionsConfig from './lib/role-permissions.json'

const PUBLIC_ROUTES = ['/login', '/register']
const ALL_ROLES_ROUTES = ['/profile', '/api/profile', '/api/auth', '/dashboard/', '/unauthorized']

// Map feature keys to route prefixes they protect
const FEATURE_ROUTE_MAP: Record<string, string[]> = {}
for (const feature of permissionsConfig.features) {
  FEATURE_ROUTE_MAP[feature.key] = feature.routes
}

const ROLE_HOME: Record<string, string> = {
  director:      '/dashboard/director',
  club_director: '/dashboard/club-director',
  assigner:      '/dashboard/assigner',
  coach:         '/dashboard/coach',
  ref:           '/dashboard/ref',
  scorekeeper:   '/dashboard/scorekeeper',
  parent:        '/dashboard/parent',
  viewer:        '/dashboard/viewer',
}

// Always-blocked routes per role (regardless of permissions config)
const ALWAYS_ADMIN_ONLY = ['/admin']

function roleCanAccess(role: string, pathname: string): boolean {
  // Admin always allowed (when not previewing)
  if (role === 'admin') return true

  // Always-admin-only routes
  if (ALWAYS_ADMIN_ONLY.some(r => pathname.startsWith(r))) return false

  const rolePerms = permissionsConfig.roles[role as keyof typeof permissionsConfig.roles]
  if (!rolePerms) return false

  // Check each feature the role has access to
  for (const [featureKey, allowed] of Object.entries(rolePerms)) {
    if (!allowed) continue
    const routes = FEATURE_ROUTE_MAP[featureKey] || []
    for (const route of routes) {
      // Support wildcard routes like /tournaments/*/roster
      const pattern = route.replace(/\*/g, '[^/]+')
      const regex = new RegExp(`^${pattern}`)
      if (regex.test(pathname) || pathname.startsWith(route.replace('/*', ''))) return true
    }
  }
  return false
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token
    const realRole = (token?.role as string) ?? 'viewer'

    const previewCookie = req.cookies.get('preview-role')?.value
    const isAdminPreviewing = realRole === 'admin' && !!previewCookie
    const role = isAdminPreviewing ? previewCookie! : realRole

    // Public routes
    if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

    // Not logged in
    if (!token) return NextResponse.redirect(new URL('/login', req.url))

    // All-role routes (profile, dashboards, etc.)
    if (ALL_ROLES_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

    // Real admin always has access to /admin routes, even while previewing
    if (realRole === 'admin' && pathname.startsWith('/admin')) return NextResponse.next()

    // Real admin (not previewing) — full access
    if (realRole === 'admin' && !isAdminPreviewing) return NextResponse.next()

    // Redirect non-privileged roles from home
    if (pathname === '/' && role !== 'admin' && role !== 'director') {
      return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/dashboard/viewer', req.url))
    }

    // Check permissions config
    if (roleCanAccess(role, pathname)) return NextResponse.next()

    // Blocked
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl
        if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return true
        if (pathname.startsWith('/api/auth')) return true
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)', ]
}
