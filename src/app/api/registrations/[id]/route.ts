import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const {
    clubName, clubContact, contactEmail, contactPhone,
    clubBasedIn, clubWebsite, needsHotel, paymentMethod, notes, teams,
    invoiceAmount, discountAmount, discountNote,
  } = body

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
      teams: {
        create: (teams || []).map((t: any) => ({
          clubName: t.clubName || '',
          teamName: t.teamName || '',
          division: t.division || '',
          coachName: t.coachName || '',
          coachPhone: t.coachPhone || '',
          coachEmail: t.coachEmail || '',
        })),
      },
    },
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
  })

  return NextResponse.json(registration)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.teamRegistration.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
