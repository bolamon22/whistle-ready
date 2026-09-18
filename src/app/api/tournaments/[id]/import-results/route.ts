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
//
// It also takes the surrounding structure -- divisions, pools and brackets --
// because a schedule on its own is not what the public page shows. Standings need
// to know which pool a team was in, the bracket tree is its own table, and a
// division the tournament has never heard of does not get a tile. Every part is
// optional, so this is still just "games" when that is all you have.
//
// What it deliberately does NOT create is TeamRegistration/RegisteredTeam rows.
// Those are the registration and money record -- they feed the club database and
// the financials -- and inventing them for an event that was run elsewhere would
// book revenue that never happened. The cost is that imported teams have no crest,
// since logos hang off RegisteredTeam. Names render fine without one.

type PoolIn = { division?: unknown; name?: unknown; teamNames?: unknown }
type BracketGameIn = {
  gameNumber?: unknown; round?: unknown; section?: unknown
  team1Source?: unknown; team2Source?: unknown; label?: unknown
  field?: unknown; startTime?: unknown; gameDate?: unknown
}
type BracketIn = {
  division?: unknown; format?: unknown; teamCount?: unknown
  seeds?: unknown; games?: BracketGameIn[]
}

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

// Bracket/BracketGame ids have no default in the schema, same as the generator's.
const genId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json() as {
      games?: In[]; replace?: boolean; divisions?: unknown
      pools?: PoolIn[]; brackets?: BracketIn[]
    }
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

    // Divisions: without these the tournament has no tiles to group results under.
    let divisionsSaved = 0
    if (Array.isArray(body.divisions) && body.divisions.length) {
      const names = [...new Set((body.divisions as unknown[]).map(d => str(d).trim()).filter(Boolean))]
      if (names.length) { await prisma.tournament.update({ where: { id: params.id }, data: { registrationDivisions: JSON.stringify(names) } }); divisionsSaved = names.length }
    }

    // Pools: the standings table groups by these, so without them every division
    // renders as one undivided list no matter how it was actually played.
    let poolsSaved = 0
    if (Array.isArray(body.pools) && body.pools.length) {
      const poolRows = body.pools.map(p => ({
        tournamentId: params.id,
        division: str(p.division),
        name: str(p.name),
        teamNames: JSON.stringify(Array.isArray(p.teamNames) ? p.teamNames.map(t => str(t)) : []),
      })).filter(p => p.division && p.name)
      if (poolRows.length) {
        if (body.replace) await prisma.pool.deleteMany({ where: { tournamentId: params.id } })
        await prisma.pool.createMany({ data: poolRows })
        poolsSaved = poolRows.length
      }
    }

    // Brackets: the tree is its own table. Note the bracket games carry no scores --
    // the public renderer reads those from the schedule game numbered B<gameNumber>,
    // so the two stay in step by construction rather than by copying.
    let bracketsSaved = 0, bracketGamesSaved = 0
    if (Array.isArray(body.brackets) && body.brackets.length) {
      if (body.replace) {
        const old = await prisma.bracket.findMany({ where: { tournamentId: params.id }, select: { id: true } })
        if (old.length) {
          await prisma.bracketGame.deleteMany({ where: { bracketId: { in: old.map(b => b.id) } } })
          await prisma.bracket.deleteMany({ where: { tournamentId: params.id } })
        }
      }
      for (const b of body.brackets) {
        const division = str(b.division); if (!division) continue
        const bracketId = genId()
        await prisma.bracket.create({ data: {
          id: bracketId, tournamentId: params.id, division,
          format: str(b.format, 'single'),
          teamCount: Number(b.teamCount) || 0,
          seeds: JSON.stringify(b.seeds && typeof b.seeds === 'object' ? b.seeds : {}),
        } })
        const bgs = (Array.isArray(b.games) ? b.games : []).map(g => ({
          id: genId(), bracketId,
          gameNumber: Number(g.gameNumber) || 0,
          round: Number(g.round) || 1,
          section: str(g.section, 'winners'),
          team1Source: str(g.team1Source),
          team2Source: str(g.team2Source),
          label: str(g.label),
          field: str(g.field),
          startTime: str(g.startTime),
          gameDate: str(g.gameDate),
        })).filter(g => g.gameNumber > 0)
        if (bgs.length) { await prisma.bracketGame.createMany({ data: bgs }); bracketGamesSaved += bgs.length }
        bracketsSaved++
      }
    }

    return NextResponse.json({
      imported: rows.length,
      divisionsSaved, poolsSaved, bracketsSaved, bracketGamesSaved,
      scored: rows.filter(r => r.score1 !== null && r.score2 !== null).length,
      divisions: [...new Set(rows.map(r => r.division))].length,
      dates: merged,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
