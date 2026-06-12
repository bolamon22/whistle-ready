import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Self-heal: ensure the registration-level club logo column exists. The column was
// added after some databases were created, and Prisma writes/reads it, so guard every
// access with an idempotent ALTER (errors when it already exists -> ignored).
async function ensureRegistrationColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "clubLogoUrl" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  await ensureRegistrationColumns()
  const registrations = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: null },
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(registrations)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    tournamentId, clubName, clubContact, contactEmail, contactPhone,
    clubBasedIn, clubWebsite, numTeams, needsHotel, paymentMethod, notes, teams,
    invoiceAmount, discountAmount, discountNote, clubLogoUrl,
  } = body

  if (!tournamentId || !clubContact || !contactEmail || !contactPhone) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await ensureRegistrationColumns()
  const registration = await prisma.teamRegistration.create({
    data: {
      tournamentId,
      clubName: clubName || '',
      clubContact,
      contactEmail,
      contactPhone,
      clubBasedIn: clubBasedIn || '',
      clubWebsite: clubWebsite || '',
      numTeams: Number(numTeams) || 1,
      needsHotel: needsHotel === true ? 'Yes' : needsHotel === false ? 'No' : (needsHotel || 'No'),
      paymentMethod: paymentMethod || 'check',
      notes: notes || '',
      invoiceAmount: Number(invoiceAmount) || 0,
      discountAmount: Number(discountAmount) || 0,
      discountNote: discountNote || '',
      clubLogoUrl: clubLogoUrl || '',
      teams: {
        create: (teams || []).map((t: any) => ({
          clubName: t.clubName || '',
          teamName: t.teamName || '',
          division: t.division || '',
          coachName: t.coachName || '',
          coachPhone: t.coachPhone || '',
          coachEmail: t.coachEmail || '',
          logoUrl: t.logoUrl || (clubLogoUrl || ''),
        })),
      },
    },
    include: { teams: true, payments: true },
  })

  return NextResponse.json(registration, { status: 201 })
}
