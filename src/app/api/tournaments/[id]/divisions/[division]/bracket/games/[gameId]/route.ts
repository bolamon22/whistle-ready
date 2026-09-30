import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { notifyFinal } from '@/lib/finalAlerts'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; division: string; gameId: string } }
) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json()
  const { score1, score2, field, startTime, gameDate, team1, team2, clearScore } = body

  try {
    const game = await prisma.bracketGame.findUnique({ where: { id: params.gameId } })
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

    const newScore1 = score1 !== undefined ? (score1 === '' || score1 === null ? null : Number(score1)) : game.score1
    const newScore2 = score2 !== undefined ? (score2 === '' || score2 === null ? null : Number(score2)) : game.score2
    const newTeam1  = team1 !== undefined ? team1 : game.team1
    const newTeam2  = team2 !== undefined ? team2 : game.team2

    let winner = game.winner
    let loser  = game.loser

    if (clearScore) {
      winner = ''
      loser  = ''
    } else if (newScore1 !== null && newScore2 !== null && newScore1 !== newScore2) {
      winner = newScore1 > newScore2 ? newTeam1 : newTeam2
      loser  = newScore1 > newScore2 ? newTeam2 : newTeam1
    }

    const updated = await prisma.bracketGame.update({
      where: { id: params.gameId },
      data: {
        score1: clearScore ? null : newScore1,
        score2: clearScore ? null : newScore2,
        ...(field      !== undefined && { field }),
        ...(startTime  !== undefined && { startTime }),
        ...(gameDate   !== undefined && { gameDate }),
        ...(team1      !== undefined && { team1: newTeam1 }),
        ...(team2      !== undefined && { team2: newTeam2 }),
        winner,
        loser,
      },
    })

    // A final entered here reaches the followers of both teams. The tag uses
    // the scheduler's numbering (B + offset + game number), the same one the
    // mirrored Game row carries, so scoring the game in both places shows one
    // alert on the phone, not two. Tap lands on that mirror's public page.
    if (!clearScore) {
      const division = decodeURIComponent(params.division)
      const bracket = await prisma.bracket.findUnique({ where: { id: game.bracketId }, select: { numberOffset: true } }).catch(() => null)
      const gameNumber = 'B' + ((bracket?.numberOffset ?? 0) + game.gameNumber)
      const mirror = await prisma.game.findFirst({ where: { tournamentId: params.id, division, gameNumber }, select: { id: true, date: true } }).catch(() => null)
      await notifyFinal(
        { score1: game.score1, score2: game.score2 },
        {
          tournamentId: params.id, division, gameNumber,
          team1: newTeam1, team2: newTeam2, score1: newScore1, score2: newScore2,
          date: mirror?.date || updated.gameDate,
          url: mirror ? `/tournaments/${params.id}/public/games/${mirror.id}` : `/tournaments/${params.id}/public`,
        },
      )
    }

    return NextResponse.json(updated)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
  }
}
