import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// Create many games at once, WITH their scores.
//
// WHY this exists: every other write path assumes games are created empty and
// scored later by a scorekeeper. That is right for a live event and useless for
// a finished one -- the xlsx importer drops scores on the floor, and the per-game
// PATCH only takes date/time/location/number. So a tournament that was actually
// run somewhere else could be given a schedule but never a result, and its public
// page said "No games scheduled yet" forever.
//
// Lives at /import-results rather than under /games because a static `bulk`
// segment there would sit on top of the `[gameId]` dynamic route -- it resolves,
// but it shadows, and a GET to it answers 405 from the OTHER route, which makes
// "is this deployed yet" unanswerable.
//
// Archival import is the first use (Sunshine Summer Kick Off 26, run in
// TourneyMachine before the app existed), but nothing here is specific to that:
// it is the generic "here are finished games" endpoint.

type In = {
  gameNumber?: unknown; date?: unknown; startTime?: unknown; division?: unknown
  pool?: unknown; location?: unknown; team1?: unknown; team2?: unknown
  score1?: unknown; score2?: unknown; isChampionship?: unknown; refCount?: unknown
}

const str = (v: unknown, d = '') => (v === null || v === undefined ? d : String(v))
/** Scores are optional: null means "not played / not recorded", which is NOT the same as 0. */
const score = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json() as { games?: In[]; replace?: boolean }
    const input = Array.isArray(body.games) ? body.games : []
    if (!input.length) return NextResponse.json({ error: 'games required' }, { status: 400 })
    if (input.length > 2000) return NextResponse.json({ error: 'Max 2000 games per call' }, { status: 400 })

    const t = await prisma.tournament.findUnique({ where: { id: params.id } })
    if (!t) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

    // Same ref-count rule the xlsx importer uses, so an imported event staffs like any other.
    let divRules: Record<string, number> = {}
    try { divRules = JSON.parse(t.divisionRules || '{}') } catch { /* default 2 below */ }
    const refsFor = (division: string) => {
      for (const [kw, n] of Object.entries(divRules)) {
        if (division.toLowerCase().includes(kw.toLowerCase())) return Number(n) || 2
      }
      return 2
    }

    const rows = input.map(g => {
      const division = str(g.division)
      return {
        tournamentId: params.id,
        gameNumber: str(g.gameNumber),
        date: str(g.date),
        startTime: str(g.startTime),
        division,
        pool: g.pool === null || g.pool === undefined || g.pool === '' ? null : str(g.pool),
        location: str(g.location),
        team1: str(g.team1, 'TBD'),
        team2: str(g.team2, 'TBD'),
        score1: score(g.score1),
        score2: score(g.score2),
        refCount: g.refCount === undefined ? refsFor(division) : Number(g.refCount) || 2,
        isChampionship: Boolean(g.isChampionship),
      }
    })

    const bad = rows.findIndex(r => !r.date || !r.startTime)
    if (bad >= 0) return NextResponse.json({ error: `Row ${bad + 1} (${rows[bad].gameNumber}) is missing date or start time` }, { status: 400 })

    // replace is opt-in: re-running an import should not silently wipe a live
    // schedule someone has already staffed.
    if (body.replace) await prisma.game.deleteMany({ where: { tournamentId: params.id } })
    await prisma.game.createMany({ data: rows })

    // The schedule UI reads the tournament's day list, so keep it in step with the games.
    const dates = [...new Set(rows.map(r => r.date))].sort()
    const existing: string[] = (() => { try { const d = JSON.parse(t.dates || '[]'); return Array.isArray(d) ? d : [] } catch { return [] } })()
    const merged = [...new Set(body.replace ? dates : [...existing, ...dates])].sort()
    await prisma.tournament.update({ where: { id: params.id }, data: { dates: JSON.stringify(merged) } })

    return NextResponse.json({
      imported: rows.length,
      scored: rows.filter(r => r.score1 !== null && r.score2 !== null).length,
      divisions: [...new Set(rows.map(r => r.division))].length,
      dates: merged,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
