import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@libsql/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkInsFor } from '@/lib/staffCheckIn'
import { releaseFilter } from '@/lib/staffReleaseStore'

// The signed-in staff member's games, for the staff home page (dashboard/ref).
// The Worker is matched by email ignoring case, the same way /api/staff-portal does,
// so "My events" and "My games" can't disagree when the Staff Pool email was typed
// with capitals (Oct 2026). Each game carries its crew -- the other officials and the
// scorekeeper, with phone -- so a ref can see who they're working with and call them.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = String(session.user.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json([])
  const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const r = await client.execute({ sql: `SELECT id FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, args: [email] })
  const workerId = r.rows[0]?.id as string | undefined
  if (!workerId) return NextResponse.json([])

  const assignments = await prisma.assignment.findMany({
    where: { workerId },
    include: { game: { include: { assignments: { select: { role: true, workerId: true, worker: { select: { name: true, phone: true } } } } } } },
    orderBy: [{ game: { date: 'asc' } }, { game: { startTime: 'asc' } }],
  })

  // Only games the assigner has shown to staff (lib/staffRelease), and only crew
  // members whose own games are shown: a scorekeeper must not learn the boys refs
  // before the boys assigner is ready.
  const visible = await releaseFilter((session.user as { role?: string }).role, assignments.map(a => a.game.tournamentId))
  const shown = assignments.filter(a => visible(a.game.tournamentId, a.role, a.game.division))
  const checks = await checkInsFor(shown.map(a => a.id))
  return NextResponse.json(shown.map(a => {
    const { assignments: crew, ...game } = a.game
    return {
      id: a.id, role: a.role, payRate: a.payRate, game, checkedInAt: checks.get(a.id) || null,
      crew: crew.filter(c => c.workerId !== workerId && visible(a.game.tournamentId, c.role, a.game.division)).map(c => ({ role: c.role, name: c.worker.name, phone: c.worker.phone || '' })),
    }
  }), { headers: { 'Cache-Control': 'private, no-store' } })
}
