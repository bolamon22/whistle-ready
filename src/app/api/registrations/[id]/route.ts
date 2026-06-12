import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function ensureRegistrationColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "clubLogoUrl" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const body = await req.json()
  const {
    clubName, clubContact, contactEmail, contactPhone,
    clubBasedIn, clubWebsite, needsHotel, paymentMethod, notes, teams,
    invoiceAmount, discountAmount, discountNote, clubLogoUrl,
  } = body

  await ensureRegistrationColumns()
  await prisma.registeredTeam.deleteMany({ where: { registrationId: params.id } })

  const registration = await prisma.teamRegistration.update({
    where: { id: params.id },
    data: {
      clubName: clubName || '',
      clubContact,
      contactEmail,
      contactPhone,
      clubBasedIn: clubBasedIn || '',
      clubWebsite: clubWebsite || '',
      numTeams: (teams || []).length,
      needsHotel: needsHotel || 'No',
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
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
  })

  return NextResponse.json(registration)
  } catch (e: any) {
    console.error('Registration PATCH failed:', e)
    return NextResponse.json({ error: e?.message || 'Failed to save registration' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.teamRegistration.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
