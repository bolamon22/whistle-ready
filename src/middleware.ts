import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import permissionsConfig from './lib/role-permissions.json'

const PUBLIC_ROUTES = ['/login', '/register', '/o/']  // /o/[slug] = public org website
const ALL_ROLES_ROUTES = ['/profile', '/api/profile', '/api/auth', '/dashboard/', '/unauthorized']

const FEATURE_ROUTE_MAP: Record<string, string[]> = {}
for (const feature of permissionsConfig.features) {
  FEATURE_ROUTE_MAP[feature.key] = feature.routes
}

const ROLE_HOME: Record<string, string> = {
  director:      '/dashboard/director',
  club_director: '/dashboard/club-director',
  assigner:      '/dashboard/assigner',
  scheduler:     '/dashboard/scheduler',
  coach:         '/dashboard/coach',
  staff:         '/dashboard/staff',
  parent:        '/dashboard/parent',
}

const ALWAYS_ADMIN_ONLY = ['/admin']

function roleCanAccess(role: string, pathname: string): boolean {
  if (role === 'admin') return true
  if (ALWAYS_ADMIN_ONLY.some(r => pathname.startsWith(r))) return false
  const rolePerms = permissionsConfig.roles[role as keyof typeof permissionsConfig.roles]
  if (!rolePerms) return false
  for (const [featureKey, allowed] of Object.entries(rolePerms)) {
    if (!allowed) continue
    const routes = FEATURE_ROUTE_MAP[featureKey] || []
    for (const route of routes) {
      const pattern = route.replace(/\*/g, '[^/]+')
      const regex = new RegExp(`^${pattern}`)
      if (regex.test(pathname) || pathname.startsWith(route.replace('/*', ''))) return true
    }
  }
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public routes, auth API, and all other API routes (they handle own auth)
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.next()
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return NextResponse.next()
  // Static assets in /public (logos, images, fonts, etc.) — never require auth
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|map)$/i.test(pathname)) return NextResponse.next()
  // Public tournament pages (divisions, schedule, standings, bracket, rules) — no login required
  if (/^\/tournaments\/[^/]+\/public(\/|$)/.test(pathname)) return NextResponse.next()
  // Public registration (teams/players can register without an account)
  if (/^\/tournaments\/[^/]+\/(register|player-register|player-waiver|vendor-request|event|rules|p)(\/|$)/.test(pathname)) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // Not logged in — redirect to login
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  const rawRole = (token.role as string) ?? 'staff'
  // Backward compat: existing users with old role values
  const realRole = rawRole === 'ref' || rawRole === 'scorekeeper' ? 'staff'
                 : rawRole === 'viewer' ? 'staff'
                 : rawRole
  const previewCookie = req.cookies.get('preview-role')?.value
  const previewOrgCookie = req.cookies.get('preview-org')?.value
  const isAdminPreviewing = realRole === 'admin' && !!previewCookie
  const role = isAdminPreviewing ? previewCookie! : realRole
  // Inject preview-org into request headers so API routes can read it
  const requestHeaders = new Headers(req.headers)
  if (realRole === 'admin' && previewOrgCookie) {
    requestHeaders.set('x-preview-org', previewOrgCookie)
  }

  // All-role routes
  if (ALL_ROLES_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next({ request: { headers: requestHeaders } })

  // Admin always has access to /admin
  if (realRole === 'admin' && pathname.startsWith('/admin')) return NextResponse.next({ request: { headers: requestHeaders } })

  // Real admin (not previewing) — full access
  if (realRole === 'admin' && !isAdminPreviewing) return NextResponse.next({ request: { headers: requestHeaders } })

  // Redirect non-privileged roles from home
  if (pathname === '/' && role !== 'admin' && role !== 'director') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/dashboard/staff', req.url))
  }

  // Check permissions
  if (roleCanAccess(role, pathname)) return NextResponse.next({ request: { headers: requestHeaders } })

  // Blocked
  return NextResponse.redirect(new URL('/unauthorized', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)', ]
}
