import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { setNoBracket } from '@/lib/divisionPlan'

export const dynamic = 'force-dynamic'

// PUT { on: boolean } -- the "No bracket: pool play only" checkbox on a division's
// Bracket tab (lib/divisionPlan). Turning it on is refused while the division still
// has a bracket: those games would stay on the schedule under a division that says
// it has none. Reset the bracket on the same tab first.
export async function PUT(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const division = decodeURIComponent(params.division || '').trim()
  if (!division) return NextResponse.json({ error: 'Division required' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { on?: unknown }
  const on = body.on === true
  if (on) {
    const [brackets, bracketGames] = await Promise.all([
      prisma.bracket.count({ where: { tournamentId: params.id, division } }),
      prisma.game.findMany({ where: { tournamentId: params.id, division, gameNumber: { startsWith: 'B' } }, select: { gameNumber: true } }),
    ])
    if (brackets > 0) {
      return NextResponse.json({ error: 'This division already has a bracket. Reset it on its Bracket tab first, then tick pool play only.' }, { status: 409 })
    }
    // B# games with no bracket behind them (added by hand or imported): name them.
    if (bracketGames.length) {
      const n = bracketGames.length
      const nums = bracketGames.map(g => g.gameNumber).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      const shown = nums.slice(0, 6).join(', ') + (n > 6 ? ', …' : '')
      return NextResponse.json({ error: `This division still has ${n} bracket game${n === 1 ? '' : 's'} on the schedule (${shown}). Delete ${n === 1 ? 'it' : 'them'} first, then tick pool play only.` }, { status: 409 })
    }
  }
  await setNoBracket(params.id, division, on, gate.userId)
  return NextResponse.json({ ok: true, noBracket: on })
}
