import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { roleCanAccess } from './lib/routeAccess'
import { PREVIEW_ROLES } from './lib/roleScope'
import { LEGAL_PATHS, isLegalPath } from './lib/legalRoutes'
import { orgSlugForHost, hostOnly, LEGACY_REDIRECTS, LEGACY_JUNK_PREFIXES, ORG_ICON_SLUGS, ORG_ICON_FILES, aliasRedirectForHost } from './lib/orgDomains'
import { orgScoped } from './lib/orgScope'

const PUBLIC_ROUTES = ['/unavailable', '/login', '/register', '/o/', '/forgot', '/reset', '/find', '/invite', '/join', '/verify', '/housing', '/confirm', '/confirm-games', '/share', '/guides', ...LEGAL_PATHS]  // /privacy + /terms = the privacy policy and terms of use (Intuit's QuickBooks review links to them); /housing/[code] = housing board; /confirm/[regId] = club team-confirmation (the id IS the key, like /pay); /confirm-games/[token] = an official confirming their games (lib/officialConfirm; already covered by '/confirm', named so a tighter '/confirm' can't lock officials out); /share/[regId] = ready-made messages a director sends their own families (same key model, and they often have no account yet)  // /o/[slug] = public org website; forgot/reset = password recovery; /find = public look-up; /invite + /join = staff signup links (recipients have NO account yet — the pages are token/code-gated themselves)
const ALL_ROLES_ROUTES = ['/profile', '/api/profile', '/api/auth', '/dashboard/', '/unauthorized', '/switch-org']
// Tournament pages that need no login. The pretty-URL block below tests against
// this same list: a public page keeps its short URL via a rewrite, and anything
// else is sent to the canonical /tournaments/<id>/... URL so the auth checks at
// the bottom of this file actually run. A rewrite returns immediately and would
// skip them, which is how /tournaments/<slug>/dashboard served the staff grid
// to anyone who guessed the slug.
const PUBLIC_TOURNAMENT_PATH = /^\/tournaments\/[^/]+\/(public|register|individual-register|player-register|player-waiver|coach-waiver|vendor-request|shoot|work|event|rules|hotel|hotels|p|today|champions)(\/|$)/

const ROLE_HOME: Record<string, string> = {
  director:      '/dashboard/director',
  club_director: '/dashboard/club-director',
  assigner:      '/dashboard/assigner',
  scheduler:     '/dashboard/scheduler',
  field_director: '/dashboard/field-director',
  client:        '/dashboard/client',
  coach:         '/dashboard/coach',
  staff:         '/dashboard/staff',
  parent:        '/dashboard/parent',
}

// Page access lives in lib/routeAccess, shared with the tournament nav so a tab
// the role cannot open is not shown either.

// One login, several organizations (lib/orgMembers). Directors, schedulers,
// assigners and field directors (lib/orgScope) work one organization at a time: an
// event of any other organization is turned away, its API answered as if nobody were
// signed in (the field director rule below, applied to organizations) and its staff
// pages sent through the switcher when the login is a member there, else home. Refs and
// scorekeepers (staff), clubs and families are not limited here: what they can do on
// an event is already theirs alone. Admins see everything. Routes that reach an event
// through another id (a game, a registration) check it with orgGate in lib/apiAuth.
const EVENT_ORG_MS = 60_000
const eventOrgs = new Map<string, { org: string | null; at: number }>()

/** The organization that runs an event, null for none, undefined when the lookup
 *  failed (then the request goes on: the lookup can fail only on our side, and a
 *  stuck lookup must not lock every director out of every event). */
async function eventOrg(req: NextRequest, id: string): Promise<string | null | undefined> {
  const hit = eventOrgs.get(id)
  if (hit && Date.now() - hit.at < EVENT_ORG_MS) return hit.org
  try {
    const r = await fetch(new URL(`/api/event-org?id=${encodeURIComponent(id)}`, req.url))
    if (!r.ok) return undefined
    const org = ((await r.json())?.orgId as string | null | undefined) ?? null
    if (eventOrgs.size > 5000) eventOrgs.clear()
    eventOrgs.set(id, { org, at: Date.now() })
    return org
  } catch { return undefined }
}

// Archived organizations (lib/orgArchive) are offline: their public site and their
// events' public pages show /unavailable. Read at most once a minute per instance, and
// only on those public pages; a failed read takes nothing offline.
const ARCHIVED_MS = 60_000
let archived: { at: number; slugs: Set<string>; tids: Set<string> } | null = null
async function archivedLists(req: NextRequest): Promise<{ slugs: Set<string>; tids: Set<string> }> {
  if (archived && Date.now() - archived.at < ARCHIVED_MS) return archived
  let slugs = new Set<string>(), tids = new Set<string>()
  try {
    const r = await fetch(new URL('/api/archived-orgs', req.url))
    const d = r.ok ? await r.json() : null
    slugs = new Set(((d?.slugs ?? []) as unknown[]).map(s => String(s).toLowerCase()))
    tids = new Set(((d?.tournamentIds ?? []) as unknown[]).map(String))
  } catch { /* nothing offline */ }
  archived = { at: Date.now(), slugs, tids }
  return archived
}
function unavailable(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = '/unavailable'
  url.search = ''
  return NextResponse.rewrite(url)
}

/** The event's organization when it isn't the one this login is working in. */
async function inOtherOrg(req: NextRequest, t: { role?: unknown; orgId?: unknown }, eventId: string): Promise<string | null> {
  if (!orgScoped(t.role)) return null
  const org = await eventOrg(req, eventId)
  return org && org !== (t.orgId ?? null) ? org : null
}

// An admin's View as (lib/previewView): the role being previewed and the organization
// being looked at, from this browser's cookies. With an organization, the preview gets
// what that organization's people get: its plan (preview-plan) and its events only.
// Without one, the role alone, as before. Null when this isn't an admin previewing.
type Preview = { role: string; orgId: string | null; planOff: string[] }
function previewOf(req: NextRequest, realRole: unknown): Preview | null {
  if (realRole !== 'admin') return null
  const role = req.cookies.get('preview-role')?.value || ''
  if (!(PREVIEW_ROLES as readonly string[]).includes(role)) return null
  const orgId = req.cookies.get('preview-org')?.value || null
  const planOff = orgId ? (req.cookies.get('preview-plan')?.value || '').split(',').filter(Boolean) : []
  return { role, orgId, planOff }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // --- Event vanity domains (jinglebrawllax.com → the Jingle Brawl event page) ---
  // Everything on the host goes to the one page, permanently.
  const alias = aliasRedirectForHost(req.headers.get('host'))
  if (alias) return NextResponse.redirect(alias, 301)

  // --- Custom org domains (e.g. sunshinelax.com → Sunshine Events Group) ---
  // Serve the org's public pages at the domain root; keep global routes
  // (tournaments, api, assets, auth) working as-is.
  const customSlug = orgSlugForHost(req.headers.get('host'))
  if (customSlug) {
    const host = (req.headers.get('host') || '').toLowerCase()
    if (host.startsWith('www.')) {
      return NextResponse.redirect(`https://${host.slice(4)}${pathname}${req.nextUrl.search}`, 308)
    }
    // Spam URLs from the domain's pre-Sunshine life (German e-commerce junk —
    // ~142K of them in Search Console) get an explicit 410 Gone: same meaning
    // as 404 but Google drops 410s from its index faster. Never redirect these.
    if (/^\/(itm|iam)\//.test(pathname)) return new NextResponse(null, { status: 410 })
    // Legacy URLs from the domain's previous (WordPress) site → 301 to their new
    // home, BEFORE the rewrite, so Google transfers history and backlinks work.
    const bare = pathname.replace(/\/+$/, '') || '/'
    const legacyMap = LEGACY_REDIRECTS[hostOnly(host)]
    if (legacyMap) {
      const target = legacyMap[bare]
      if (target && target !== bare) return NextResponse.redirect(new URL(target, req.url), 301)
      if (bare !== '/' && LEGACY_JUNK_PREFIXES.some(p => bare.startsWith(p))) {
        return NextResponse.redirect(new URL('/', req.url), 301)
      }
    }
    // The org's own favicon / app icons / web manifest on its domain (see ORG_ICON_SLUGS).
    if (ORG_ICON_FILES.has(pathname) && ORG_ICON_SLUGS.has(customSlug)) {
      const url = req.nextUrl.clone()
      url.pathname = `/org-icons/${customSlug}${pathname}`
      return NextResponse.rewrite(url)
    }
    // NOTE: '/register' passthrough is EXACT match only — the org's own register
    // pages (/register/player, /register/vendor) must rewrite to /o/{slug}/register/*
    // or they 404 on the custom domain.
    //
    // EVERY emailed token link belongs in this list. /claim was missing, and the
    // account-setup letter builds its link on the ORG's domain (commSend.ts ->
    // tournamentAbs), so sunshineeventsgroup.com/claim/<token> was rewritten to
    // /o/sunshine-events-group/claim/<token>, which does not exist: every club
    // director who followed that button got "Page not found". Being listed as a
    // public route further down does not help — the rewrite happens first and
    // returns. Verified Sep 15 2026 with a live token: 404 on the org domain,
    // renders correctly on whistleready.app.
    const passthrough =
      pathname.startsWith('/o/') || pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt' ||
      /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|map|mp4|webm)$/i.test(pathname) ||
      pathname.startsWith('/tournaments/') || pathname.startsWith('/login') || pathname === '/register' ||
      pathname.startsWith('/forgot') || pathname.startsWith('/reset') ||
      pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/profile') ||
      pathname.startsWith('/invite') || pathname.startsWith('/join') || pathname.startsWith('/housing') || pathname.startsWith('/confirm') || pathname.startsWith('/unauthorized') || pathname.startsWith('/switch-org') || pathname.startsWith('/staff') || pathname.startsWith('/pay') || pathname.startsWith('/pass') || pathname.startsWith('/coach') || pathname.startsWith('/vendor') || pathname.startsWith('/media') || pathname.startsWith('/claim') || pathname.startsWith('/share') ||
      isLegalPath(pathname)
    if (!passthrough) {
      if ((await archivedLists(req)).slugs.has(customSlug.toLowerCase())) return unavailable(req)
      const url = req.nextUrl.clone()
      url.pathname = `/o/${customSlug}${pathname === '/' ? '' : pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // --- Pretty event URLs: /tournaments/<slug>/... renders the real event ---
  // Only when the segment is not already a cuid, so every existing
  // /tournaments/<id>/... link is untouched and costs nothing. A miss falls
  // through to the normal route, which 404s exactly as it would have.
  const pretty = /^\/tournaments\/([^/]+)(\/.*)?$/.exec(pathname)
  if (pretty && !/^c[a-z0-9]{16,}$/i.test(pretty[1])) {
    try {
      const r = await fetch(new URL(`/api/event-slug?s=${encodeURIComponent(pretty[1].toLowerCase())}`, req.url))
      const id = r.ok ? (await r.json())?.id : null
      if (id) {
        // A bare /tournaments/<slug> means the event page -- that is the link
        // that goes on print and in emails, and it must not land on the staff
        // scheduling grid at /tournaments/<id>.
        const target = `/tournaments/${id}${pretty[2] || '/event'}`
        if (PUBLIC_TOURNAMENT_PATH.test(target)) {
          if ((await archivedLists(req)).tids.has(String(id))) return unavailable(req)
          const url = req.nextUrl.clone()
          url.pathname = target
          return NextResponse.rewrite(url)   // URL stays pretty
        }
        // Staff-only page: redirect to the canonical URL rather than rewriting,
        // so the auth checks below get to run on the way back in.
        return NextResponse.redirect(new URL(target + req.nextUrl.search, req.url))
      }
    } catch { /* resolver down -- fall through rather than blocking the request */ }
  }

  // An archived organization's public site (lib/orgArchive).
  const orgSite = /^\/o\/([^/]+)/.exec(pathname)
  if (orgSite && (await archivedLists(req)).slugs.has(orgSite[1].toLowerCase())) return unavailable(req)
  // Always allow public routes, auth API, and all other API routes (they handle own auth)
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()
  // A field director works only the events assigned to them (lib/fieldDirector; the
  // list rides in the login token). A call to any other event's API goes through
  // without the login, so they get what the public gets there and no staff data. One
  // check here instead of one in every /api/tournaments/<id> route. The same goes for
  // an event of another organization (lib/orgScope).
  const eventApi = /^\/api\/tournaments\/([^/]+)(?:\/|$)/.exec(pathname)
  if (eventApi && req.cookies.getAll().some(c => c.name.includes('next-auth.session-token'))) {
    const t = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const pv = previewOf(req, t?.role)
    const notTheirs = (t?.role === 'field_director' && !(Array.isArray(t.events) && t.events.includes(eventApi[1])))
      || (!!t && !!(await inOtherOrg(req, pv?.orgId ? pv : t, eventApi[1])))
    if (notTheirs) {
      const anonymous = new Headers(req.headers)
      anonymous.delete('cookie')
      return NextResponse.next({ request: { headers: anonymous } })
    }
  }
  if (pathname.startsWith('/api/')) return NextResponse.next()
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) return NextResponse.next()
  // SEO / crawler files — always public
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt') return NextResponse.next()
  // Static assets in /public (logos, images, fonts, etc.) — never require auth
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|map|mp4|webm)$/i.test(pathname)) return NextResponse.next()
  // Public tournament pages (divisions, schedule, standings, bracket, rules) and
  // public registration — no login required, since teams and players register
  // without an account. The list lives in PUBLIC_TOURNAMENT_PATH at the top.
  // 'individual-register' is the URL RegistrationTypesEditor tells organizers to
  // share with players. It's a 5-line redirect to /register/individual (which IS
  // public) -- but it was never listed here, so this gate fired BEFORE the redirect
  // could run and every player who clicked the advertised link landed on /login.
  if (PUBLIC_TOURNAMENT_PATH.test(pathname)) {
    const ev = /^\/tournaments\/([^/]+)\//.exec(pathname)
    if (ev && (await archivedLists(req)).tids.has(ev[1])) return unavailable(req)   // an archived organization's event
    return NextResponse.next()
  }
  // "Claim your team" — MUST be public: the coach following this link has no account
  // yet (creating one is the whole point). The token in the URL is the authorization.
  if (/^\/claim(\/|$)/.test(pathname)) return NextResponse.next()
  // Pay-by-link for team registrations — public: the emailed link IS the authorization.
  if (/^\/pay(\/|$)/.test(pathname)) return NextResponse.next()
  // Vendor approval (/vendor/<token>) — public for the same reason as /pass: the
  // unguessable token IS the authorization, and the applicant has no account.
  if (/^\/vendor(\/|$)/.test(pathname)) return NextResponse.next()
  // Media credential (/media/<token>) — public for the same reason as /vendor and
  // /pass: the photographer has no account, and the 128-bit token IS the
  // authorization. Gating it behind /login is what made the individual-registration
  // link bounce the exact people it was sent to.
  if (/^\/media(\/|$)/.test(pathname)) return NextResponse.next()
  // Coach credential (/coach/<token>) — public for the same reason as /pass. NOTE
  // this is not /dashboard/coach, which is the signed-in coach role's home.
  if (/^\/coach(\/|$)/.test(pathname)) return NextResponse.next()
  // Player pass (/pass/<token>) — public: the unguessable token in the URL is the authorization.
  if (/^\/pass(\/|$)/.test(pathname)) return NextResponse.next()

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // Not logged in
  if (!token) {
    // The main-domain root is the public marketing landing — let it render.
    if (pathname === '/') return NextResponse.next()
    // Everything else requires auth — redirect to login.
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }

  const rawRole = (token.role as string) ?? 'staff'
  // Backward compat: existing users with old role values
  const realRole = rawRole === 'ref' || rawRole === 'scorekeeper' ? 'staff'
                 : rawRole === 'viewer' ? 'staff'
                 : rawRole
  const previewOrgCookie = req.cookies.get('preview-org')?.value
  const preview = previewOf(req, realRole)
  const isAdminPreviewing = !!preview
  const role = preview ? preview.role : realRole
  // Inject preview-org into request headers so API routes can read it
  const requestHeaders = new Headers(req.headers)
  if (realRole === 'admin' && previewOrgCookie) {
    requestHeaders.set('x-preview-org', previewOrgCookie)
  }

  // All-role routes. /dashboard/ is there so every role reaches its own home, but
  // /dashboard/org is the org admin hub (users, website, forms, rules, assets), so it
  // falls through to the role check instead of opening for an assigner or scheduler.
  if (ALL_ROLES_ROUTES.some(r => pathname.startsWith(r)) && !pathname.startsWith('/dashboard/org')) return NextResponse.next({ request: { headers: requestHeaders } })

  // Admin always has access to /admin
  if (realRole === 'admin' && pathname.startsWith('/admin')) return NextResponse.next({ request: { headers: requestHeaders } })

  // Real admin (not previewing) — full access
  if (realRole === 'admin' && !isAdminPreviewing) return NextResponse.next({ request: { headers: requestHeaders } })

  // Redirect non-privileged roles from home
  if (pathname === '/' && role !== 'admin' && role !== 'director') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/dashboard/staff', req.url))
  }

  // A field director's staff pages are only for their own events (public event pages
  // returned above, as for anyone). Not when an admin previews the role.
  const eventPage = /^\/tournaments\/([^/]+)(?:\/|$)/.exec(pathname)
  if (realRole === 'field_director' && eventPage && !(Array.isArray(token.events) && token.events.includes(eventPage[1]))) {
    return NextResponse.redirect(new URL(ROLE_HOME.field_director, req.url))
  }

  // An event of another organization (lib/orgScope): switch to it when this login
  // works there too (an emailed link into Sunshine's event while working in your
  // own), else home. An admin viewing an organization is held to it the same way.
  const viewer = preview ? (preview.orgId ? preview : null) : token
  if (eventPage && viewer) {
    const org = await inOtherOrg(req, viewer, eventPage[1])
    if (org) {
      if (!preview && Array.isArray(token.orgs) && token.orgs.includes(org)) {
        const sw = new URL('/switch-org', req.url)
        sw.searchParams.set('to', org)
        sw.searchParams.set('next', pathname + req.nextUrl.search)
        return NextResponse.redirect(sw)
      }
      return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/', req.url))
    }
  }

  // Check permissions: the role's, and the organization's plan (lib/orgPlans; an
  // admin previewing a role is held to the plan of the organization being viewed,
  // and to none without one).
  const planOff = preview ? preview.planOff : Array.isArray(token.planOff) ? token.planOff.map(String) : null
  if (roleCanAccess(role, pathname, planOff)) return NextResponse.next({ request: { headers: requestHeaders } })

  // Blocked
  return NextResponse.redirect(new URL('/unauthorized', req.url))
}

export const config = {
  // favicon.ico is NOT excluded: on an org's custom domain it is rewritten to the org's icon.
  matcher: ['/((?!_next/static|_next/image|uploads).*)', ]
}
