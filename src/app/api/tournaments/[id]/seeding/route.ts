import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, orgGate } from '@/lib/apiAuth'
import { seesSeeding } from '@/lib/seedingRoles'

// Which divisions are ready to seed (Bo, Oct 23 2026: "some sort of indication of when
// divisions need to be seeded. If the games are over, sometimes with so many going on,
// it's hard to tell when they're ready"). Read-only: one row per division that has a
// bracket, with how many pool games are final, the next ones still to finish, its first
// bracket game, and whether each flight's seeds are saved. components/SeedingCard shows it.
//
// A pool game is final when both scores are in and the scorer isn't still live on it:
// the scorekeeper page saves the running score to the game mid-game (provisional), so a
// score alone doesn't mean it's over. Bracket games are the B-numbered ones.

const isBracket = (n: string) => /^B/i.test(String(n || '').trim())

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!seesSeeding(gate.role)) return NextResponse.json({ error: 'Not available for this role' }, { status: 403 })
  const away = await orgGate(gate, params.id); if (away) return away
  try {
    const [games, brackets] = await Promise.all([
      prisma.game.findMany({
        where: { tournamentId: params.id, isCanceled: false },
        select: { id: true, division: true, gameNumber: true, date: true, startTime: true, location: true, score1: true, score2: true },
      }),
      prisma.bracket.findMany({ where: { tournamentId: params.id }, select: { division: true, flight: true, teamCount: true, seeds: true } }),
    ])
    // Games the scorer is still live on (AppSetting liveScore:<gameId>, live: true).
    const live = new Set<string>()
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`SELECT "key","value" FROM "AppSetting" WHERE "key" LIKE 'liveScore:%'`)
      const ids = new Set(games.map(g => g.id))
      for (const r of rows) {
        const id = String(r.key).slice('liveScore:'.length)
        if (!ids.has(id)) continue
        try { if (JSON.parse(String(r.value || '{}')).live) live.add(id) } catch {}
      }
    } catch { /* no live table yet: nobody is live */ }

    const when = (g: { date: string; startTime: string }) => `${g.date || '9999'} ${g.startTime || '99:99'}`
    const spot = (g: typeof games[number]) => ({ num: g.gameNumber, date: g.date, time: g.startTime, field: (g.location || '').split(' - ').pop() || '' })
    // A bracket left behind by a renamed or merged division (Monster Mash had a "Girls Middle
    // School A" bracket with no games) is not a division to seed.
    const live2 = new Set(games.map(g => g.division))
    const divisions = Array.from(new Set(brackets.map(b => b.division))).filter(d => live2.has(d)).map(division => {
      const pool = games.filter(g => g.division === division && !isBracket(g.gameNumber))
      const final = (g: typeof games[number]) => g.score1 !== null && g.score2 !== null && !live.has(g.id)
      const left = pool.filter(g => !final(g)).sort((a, b) => when(a).localeCompare(when(b)))
      const first = games.filter(g => g.division === division && isBracket(g.gameNumber) && g.date && g.startTime).sort((a, b) => when(a).localeCompare(when(b)))[0]
      const flights = brackets.filter(b => b.division === division).sort((a, b) => a.flight.localeCompare(b.flight)).map(b => {
        let seeds: Record<string, string> = {}
        try { seeds = JSON.parse(b.seeds || '{}') || {} } catch {}
        const count = Object.values(seeds).filter(v => String(v || '').trim()).length
        return { flight: b.flight, count, need: b.teamCount, seeded: b.teamCount > 0 && count >= b.teamCount }
      })
      return {
        division,
        poolTotal: pool.length,
        poolFinal: pool.length - left.length,
        left: left.slice(0, 3).map(spot),
        firstBracket: first ? spot(first) : null,
        flights,
        seeded: flights.length > 0 && flights.every(f => f.seeded),
      }
    })
    return NextResponse.json({ divisions })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not read the seeding status' }, { status: 500 })
  }
}
