import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Self-serve punch clock for hourly staff (field ops, athletic trainers).
// The worker is derived from the signed-in user's email (never trusted from the
// client). Times are stored as "HH:MM" local strings + "YYYY-MM-DD" date, matching
// the director Time Entries page and payroll (which split clockIn/clockOut on ':').

const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)

async function getWorker(email?: string | null) {
  if (!email) return null
  return prisma.worker.findFirst({ where: { email } })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session || !isStaff(role)) return NextResponse.json({ worker: null }, { status: session ? 403 : 401 })
    const worker = await getWorker(session.user?.email)
    if (!worker) return NextResponse.json({ worker: null })
    const entries = await prisma.timeEntry.findMany({
      where: { workerId: worker.id, tournamentId: params.id },
      orderBy: [{ date: 'asc' }, { clockIn: 'asc' }],
    })
    const open = entries.find(e => e.clockIn && !e.clockOut && e.hoursManual == null) || null
    return NextResponse.json({
      worker: { id: worker.id, name: worker.name, defaultRole: worker.defaultRole, hourlyRate: worker.hourlyRate ?? null },
      open,
      entries,
    })
  } catch {
    return NextResponse.json({ worker: null })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(role)) return NextResponse.json({ error: 'Staff only' }, { status: 403 })
    const worker = await getWorker(session.user?.email)
    if (!worker) return NextResponse.json({ error: 'No staff record linked to your account' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const time = String(body.time || '').slice(0, 5)   // "HH:MM"
    const date = String(body.date || '').slice(0, 10)  // "YYYY-MM-DD"
    if (!/^\d{2}:\d{2}$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Bad time/date' }, { status: 400 })
    }

    const open = await prisma.timeEntry.findFirst({
      where: { workerId: worker.id, tournamentId: params.id, clockOut: null, hoursManual: null, NOT: { clockIn: null } },
    })

    if (action === 'in') {
      if (open) return NextResponse.json({ ok: true, entry: open })  // already clocked in
      const entry = await prisma.timeEntry.create({
        data: { workerId: worker.id, tournamentId: params.id, date, clockIn: time, clockOut: null, hoursManual: null, isManualEdit: false },
      })
      return NextResponse.json({ ok: true, entry })
    }
    if (action === 'out') {
      if (!open) return NextResponse.json({ error: 'Not clocked in' }, { status: 400 })
      const entry = await prisma.timeEntry.update({ where: { id: open.id }, data: { clockOut: time } })
      return NextResponse.json({ ok: true, entry })
    }
    return NextResponse.json({ error: 'Bad action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
