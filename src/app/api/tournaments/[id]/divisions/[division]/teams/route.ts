import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const division = decodeURIComponent(params.division)

    const teams = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId: params.id }, division },
      include: { registration: { select: { invoiceAmount: true, payments: { select: { amount: true } } } } },
      orderBy: { teamName: 'asc' },
    })

    let pools: { id: string; name: string; teamNames: string }[] = []
    try {
      pools = await prisma.pool.findMany({
        where: { tournamentId: params.id, division },
        orderBy: { name: 'asc' },
      })
    } catch { /* Pool table not migrated yet */ }

    const teamPool = new Map<string, string>()
    for (const pool of pools) {
      const names: string[] = JSON.parse(pool.teamNames || '[]')
      for (const n of names) teamPool.set(n, pool.name)
    }

    const result = teams.map(t => {
      const paid = t.registration.payments.reduce((s, p) => s + p.amount, 0)
      const owed = t.registration.invoiceAmount
      return {
        id: t.id,
        teamName: t.teamName,
        clubName: t.clubName,
        division: t.division,
        coachName: t.coachName,
        coachPhone: t.coachPhone,
        coachEmail: t.coachEmail,
        pool: teamPool.get(t.teamName) ?? null,
        paid, owed,
        paymentStatus: paid >= owed && owed > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      }
    })

    const parsedPools = pools.map(p => ({ ...p, teamNames: JSON.parse(p.teamNames || '[]') }))
    return NextResponse.json({ teams: result, pools: parsedPools })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }
}
