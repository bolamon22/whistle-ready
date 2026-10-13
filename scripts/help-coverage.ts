// Help coverage: which pages each role can open, and which of those have a
// help article that Chirp can answer from. Run before calling a manual step
// done, and give Bo the counts.
//
//   npx -y esbuild@0.21.5 scripts/help-coverage.ts --bundle --platform=node --outfile=/tmp/hc.js && node /tmp/hc.js [--list]
//
// Pages come from the app folder (every page.tsx), access from lib/routeAccess
// (the same rule middleware uses), coverage from ARTICLE_ROUTES.
import fs from 'fs'
import path from 'path'
import { roleCanAccess } from '../src/lib/routeAccess'
import { ARTICLE_ROUTES, PUBLIC_ARTICLE_ROUTES } from '../src/lib/helpArticles'

const APP = path.join(__dirname.includes('scripts') ? path.join(__dirname, '..') : process.cwd(), 'src/app')
const ROLES = ['admin', 'director', 'assigner', 'scheduler', 'field_director', 'staff', 'public']

// Kept in step with src/middleware.ts (PUBLIC_ROUTES, PUBLIC_TOURNAMENT_PATH and its
// passthrough list). Oct 12 2026: /share, /privacy, /terms and the event's hotels
// page had gone public there and were still counted here as staff pages.
const PUBLIC_ROUTES = ['/login', '/register', '/o/', '/forgot', '/reset', '/find', '/invite', '/join', '/verify', '/housing', '/confirm', '/share', '/privacy', '/terms', '/pay/', '/pass/', '/coach/', '/vendor/', '/media/', '/claim/', '/unauthorized']
const PUBLIC_TOURNAMENT_PATH = /^\/tournaments\/[^/]+\/(public|register|individual-register|player-register|player-waiver|coach-waiver|vendor-request|shoot|work|event|rules|hotel|hotels|p|today)(\/|$)/

// Pages with nothing to explain, left out of the count: the legal pages, the
// "no access" page, and two old division pages nothing links to any more (the
// Divisions page's own tabs replaced them).
const NOT_COUNTED = ['/privacy', '/terms', '/unauthorized', '/tournaments/[id]/divisions/[division]/assign-pools', '/tournaments/[id]/divisions/[division]/bracket']

function pages(dir = APP, base = ''): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === 'api' || e.name.startsWith('_')) continue
    const seg = e.name.startsWith('(') ? '' : '/' + e.name
    const sub = path.join(dir, e.name)
    if (fs.existsSync(path.join(sub, 'page.tsx'))) out.push(base + seg)
    out.push(...pages(sub, base + seg))
  }
  return out
}

const concrete = (r: string) => r.replace(/\[[^\]]+\]/g, 'x')
const isPublic = (r: string) => { const c = concrete(r); return PUBLIC_ROUTES.some(p => c.startsWith(p)) || PUBLIC_TOURNAMENT_PATH.test(c) }

// A route covers that one page ('*' = one segment), never the pages under it: the
// Tournaments list's '/tournaments' used to count every tournament page as covered.
const compile = (all: Record<string, string[]>) => Object.values(all).flat().map(r => {
  const re = r.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')
  return new RegExp('^' + re + '$')
})
const staffPatterns = compile(ARTICLE_ROUTES), publicPatterns = compile(PUBLIC_ARTICLE_ROUTES)
const coveredBy = (pats: RegExp[]) => (r: string) => pats.some(re => re.test(concrete(r)))

const all = pages().filter(r => !NOT_COUNTED.includes(r)).sort()
const list = process.argv.includes('--list')
console.log(`${all.length} pages in the app\n`)
for (const role of ROLES) {
  const mine = all.filter(r => (role === 'public' ? isPublic(r) : !isPublic(r) && roleCanAccess(role, concrete(r))))
  const covered = coveredBy(role === 'public' ? publicPatterns : staffPatterns)
  const yes = mine.filter(covered)
  const pct = mine.length ? Math.round((100 * yes.length) / mine.length) : 0
  console.log(`${role.padEnd(10)} ${String(yes.length).padStart(3)} of ${String(mine.length).padStart(3)} pages have a help article (${pct}%)`)
  if (list) for (const r of mine.filter(r => !covered(r))) console.log(`             missing: ${r}`)
}
