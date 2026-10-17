import { prisma } from '@/lib/db'
import { getPublicVisibility } from '@/lib/publicView'
import { readAwards } from '@/lib/awards'

// One champion's share page, /tournaments/[id]/champions/[gameId] (Bo, Oct 17 2026:
// when the bracket's Share is sent by text or posted, the link preview should show
// the champions' photo). Facebook and iMessage read the page's og:image, and the
// public bracket can't carry one per division: its layout's metadata never sees the
// ?division= of a link. So each champion gets a page of its own.
//
// Everything here is public, and only once it all holds: the final is decided, the
// schedule and brackets are public, and someone turned on Show on the public bracket
// in Awards. Anything else is null and the page is a 404 -- never a private photo.

export type ChampionShare = {
  tournamentId: string; tournamentName: string; orgSlug: string
  gameId: string; division: string; flight: string
  champion: string; runnerUp: string; hi: number; lo: number; seed: string
  date: string; when: string; field: string
  /** /api/img/<id>: the photo, or the video's cover frame. The link preview needs a picture. */
  imageUrl: string; videoUrl: string; logoUrl: string
}

type Row = { gameNumber: string; team1: string; team2: string; score1: number | null; score2: number | null }

// The public bracket's test for a name that is only a slot ("Seed 3", "W-B5", "Winner B5",
// "TBD"): components/BracketDiagram isPlaceholderTeam, copied because that file is a
// client component and the server can't call its functions.
const placeholder = (n: string) => /^(seed\s|w-b\d|l-b\d|bracket\b|winner\b|loser\b|tbd$)/i.test((n || '').trim())
const named = (n: string | null | undefined): n is string => !!n && !!n.trim() && !placeholder(n)

const decided = (g: { score1: number | null; score2: number | null }) => g.score1 != null && g.score2 != null && g.score1 !== g.score2

function t12(t: string) { const [h, m] = (t || '').split(':').map(Number); if (isNaN(h)) return t || ''; return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function dayShort(d: string) { return d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }) : '' }

/** The final's two teams and their seeds. A bracket game's row keeps "W-B3" until
 *  someone types a name, so this follows the bracket the way the public page does
 *  (components/BracketChart buildGames): a real name on the row wins, a seed slot is
 *  that seed's team, a winner/loser slot is that game's result. */
async function finalSides(tournamentId: string, division: string, gameNumber: string, stored: Row) {
  const out = { team1: stored.team1, team2: stored.team2, seed1: '', seed2: '', flight: '' }
  const brackets = await prisma.bracket.findMany({
    where: { tournamentId, division },
    select: { flight: true, numberOffset: true, seeds: true, games: { select: { gameNumber: true, team1Source: true, team2Source: true } } },
  }).catch(() => [] as any[])
  const num = Number(String(gameNumber).replace(/^B/i, ''))
  const br = brackets.find((b: any) => b.games.some((x: any) => x.gameNumber + (b.numberOffset ?? 0) === num))
  if (!br) return out
  const off = br.numberOffset ?? 0
  let seeds: Record<string, string> = {}
  try { const s = JSON.parse(br.seeds || '{}'); if (s && typeof s === 'object') seeds = s } catch { /* none */ }
  const seedOf = (name: string | null) => (name ? Object.keys(seeds).find(k => seeds[k] === name) || '' : '')
  const rows: Row[] = await prisma.game.findMany({
    where: { tournamentId, division, gameNumber: { startsWith: 'B' }, isCanceled: false },
    select: { gameNumber: true, team1: true, team2: true, score1: true, score2: true },
  }).catch(() => [])
  const byNum = new Map(rows.map(r => [r.gameNumber, r]))
  const bgByN = new Map<number, { team1Source: string; team2Source: string }>(br.games.map((x: any) => [x.gameNumber, x]))
  const memo = new Map<number, { a: string | null; b: string | null; winner: string | null; loser: string | null }>()
  const visiting = new Set<number>()
  const resolve = (n: number): { a: string | null; b: string | null; winner: string | null; loser: string | null } | null => {
    if (memo.has(n)) return memo.get(n)!
    const bg = bgByN.get(n)
    if (!bg || visiting.has(n)) return null
    visiting.add(n)
    const sg = byNum.get(`B${n + off}`)
    const side = (src: string, name: string): string | null => {
      if (named(name)) return name
      if (src.startsWith('seed:')) return seeds[src.slice(5)] || null
      const m = src.match(/^(winner|loser):(\d+)$/)
      if (m) { const r = resolve(parseInt(m[2])); return r ? (m[1] === 'winner' ? r.winner : r.loser) : null }
      return null
    }
    const a = side(bg.team1Source || '', sg?.team1 || ''), b = side(bg.team2Source || '', sg?.team2 || '')
    const done = !!sg && decided(sg)
    const r = { a, b, winner: done ? (sg!.score1! > sg!.score2! ? a : b) : null, loser: done ? (sg!.score1! > sg!.score2! ? b : a) : null }
    visiting.delete(n)
    memo.set(n, r)
    return r
  }
  const fin = resolve(num - off)
  if (fin?.a) out.team1 = fin.a
  if (fin?.b) out.team2 = fin.b
  out.seed1 = seedOf(out.team1); out.seed2 = seedOf(out.team2)
  if (brackets.length > 1) out.flight = `Flight ${br.flight || 'A'}`
  return out
}

export async function loadChampionShare(tournamentId: string, gameId: string): Promise<ChampionShare | null> {
  const g = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, tournamentId: true, division: true, gameNumber: true, team1: true, team2: true, score1: true, score2: true, isChampionship: true, isCanceled: true, date: true, startTime: true, location: true },
  }).catch(() => null)
  if (!g || g.tournamentId !== tournamentId || !g.isChampionship || g.isCanceled || !decided(g)) return null
  const vis = await getPublicVisibility(tournamentId).catch(() => null)
  if (!vis || vis.schedule !== 'live') return null
  const mark = (await readAwards(tournamentId))[g.id]
  if (!mark || mark.public !== true) return null
  const imageUrl = [mark.photoUrl, mark.posterUrl].find(u => typeof u === 'string' && u.startsWith('/api/img/')) || ''
  if (!imageUrl) return null
  const videoUrl = typeof mark.videoUrl === 'string' && mark.videoUrl.startsWith('https://') ? mark.videoUrl : ''

  const s = await finalSides(tournamentId, g.division, g.gameNumber, g as Row)
  const firstWon = g.score1! > g.score2!
  const champion = firstWon ? s.team1 : s.team2
  if (!named(champion)) return null
  const runnerUp = firstWon ? s.team2 : s.team1

  // Raw SQL: Tournament.orgId and Organization are not in the Prisma client (lib/org).
  let tournamentName = 'the tournament', orgSlug = ''
  try {
    const t: any[] = await prisma.$queryRawUnsafe(`SELECT t.name AS name, o.slug AS slug FROM "Tournament" t LEFT JOIN "Organization" o ON o.id = t.orgId WHERE t.id = ?`, tournamentId)
    if (t.length) { tournamentName = String(t[0].name || tournamentName); orgSlug = String(t[0].slug || '') }
  } catch { /* names only */ }
  let logoUrl = ''
  try {
    const team = await prisma.registeredTeam.findFirst({ where: { teamName: champion, logoUrl: { not: '' }, registration: { tournamentId, deletedAt: null } }, select: { logoUrl: true } })
    logoUrl = team?.logoUrl || ''
  } catch { /* initials instead */ }

  return {
    tournamentId, tournamentName, orgSlug, gameId: g.id, division: g.division, flight: s.flight,
    champion, runnerUp: named(runnerUp) ? runnerUp : 'their opponent',
    hi: Math.max(g.score1!, g.score2!), lo: Math.min(g.score1!, g.score2!),
    seed: firstWon ? s.seed1 : s.seed2,
    date: String(g.date || ''), when: g.date ? `${dayShort(String(g.date))} ${t12(g.startTime || '')}`.trim() : t12(g.startTime || ''),
    field: ((g.location || '').split(' - ').pop() || g.location || '').trim(),
    imageUrl, videoUrl, logoUrl,
  }
}
