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

    // Ensure status column exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredTeam" ADD COLUMN "status" TEXT DEFAULT 'confirmed'`)
    } catch { /* already exists */ }

    const result = await Promise.all(teams.map(async t => {
      const paid = t.registration.payments.reduce((s, p) => s + p.amount, 0)
      const owed = t.registration.invoiceAmount
      // Read status via raw query since it may not be in Prisma schema yet
      const statusRow = await prisma.$queryRawUnsafe<{status: string}[]>(
        'SELECT status FROM "RegisteredTeam" WHERE id = ?', t.id
      ).catch(() => [{ status: 'confirmed' }])
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
        status: statusRow[0]?.status ?? 'confirmed',
      }
    }))

    const parsedPools = pools.map(p => ({ ...p, teamNames: JSON.parse(p.teamNames || '[]') }))
    return NextResponse.json({ teams: result, pools: parsedPools })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load teams' }, { status: 500 })
  }
}

// PATCH: move a team to a different division
export async function PATCH(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const { teamId, newDivision } = await req.json()
    if (!teamId || !newDivision?.trim()) return NextResponse.json({ error: 'teamId and newDivision required' }, { status: 400 })

    const division = decodeURIComponent(params.division)

    // Update the RegisteredTeam record
    await prisma.registeredTeam.update({
      where: { id: teamId },
      data: { division: newDivision.trim() },
    })

    // Remove team from any pool in old division
    const oldPools = await prisma.pool.findMany({
      where: { tournamentId: params.id, division },
    }).catch(() => [] as { id: string; teamNames: string }[])

    const team = await prisma.registeredTeam.findUnique({ where: { id: teamId }, select: { teamName: true } })
    if (team) {
      for (const pool of oldPools) {
        const names: string[] = JSON.parse(pool.teamNames || '[]')
        if (names.includes(team.teamName)) {
          await prisma.pool.update({
            where: { id: pool.id },
            data: { teamNames: JSON.stringify(names.filter(n => n !== team.teamName)) },
          }).catch(() => {})
        }
      }
    }

    // Ensure the new division exists in registrationDivisions
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id }, select: { registrationDivisions: true },
    })
    const regDivs: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    if (!regDivs.includes(newDivision.trim())) {
      await prisma.tournament.update({
        where: { id: params.id },
        data: { registrationDivisions: JSON.stringify([...regDivs, newDivision.trim()].sort()) },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to move team' }, { status: 500 })
  }
}

// POST: add a placeholder team directly (no full registration required)
export async function POST(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const division = decodeURIComponent(params.division)
    const body = await req.json()
    const { teamName, clubName, coachName, coachEmail, coachPhone } = body
    if (!teamName?.trim()) return NextResponse.json({ error: 'Team name required' }, { status: 400 })

    // Ensure status column exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredTeam" ADD COLUMN "status" TEXT DEFAULT 'confirmed'`)
    } catch { /* already exists */ }

    // Create a stub TeamRegistration for this direct-add team
    const reg = await prisma.teamRegistration.create({
      data: {
        tournamentId: params.id,
        clubName: (clubName?.trim() || teamName.trim()),
        clubContact: coachName?.trim() || '',
        contactEmail: coachEmail?.trim() || '',
        contactPhone: coachPhone?.trim() || '',
        numTeams: 1,
        invoiceAmount: 0,
      },
    })

    const team = await (prisma.registeredTeam as any).create({
      data: {
        registrationId: reg.id,
        clubName: clubName?.trim() || teamName.trim(),
        teamName: teamName.trim(),
        division,
        coachName: coachName?.trim() || '',
        coachEmail: coachEmail?.trim() || '',
        coachPhone: coachPhone?.trim() || '',
        status: 'placeholder',
      },
    })

    return NextResponse.json({ ...team, pool: null, paid: 0, owed: 0, paymentStatus: 'unpaid', status: 'placeholder' })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to add team' }, { status: 500 })
  }
}

// PUT: update team details (and optionally confirm)
export async function PUT(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const { teamId, teamName, clubName, coachName, coachEmail, coachPhone, confirm } = await req.json()
    if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

    // Ensure status column exists
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredTeam" ADD COLUMN "status" TEXT DEFAULT 'confirmed'`)
    } catch { /* already exists */ }

    const data: Record<string, string> = {}
    if (teamName?.trim()) data.teamName = teamName.trim()
    if (clubName !== undefined) data.clubName = clubName.trim()
    if (coachName !== undefined) data.coachName = coachName.trim()
    if (coachEmail !== undefined) data.coachEmail = coachEmail.trim()
    if (coachPhone !== undefined) data.coachPhone = coachPhone.trim()
    if (confirm) data.status = 'confirmed'

    await (prisma.registeredTeam as any).update({ where: { id: teamId }, data })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
  }
}
