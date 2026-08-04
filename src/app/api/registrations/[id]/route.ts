import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

async function ensureRegistrationColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "clubLogoUrl" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelName" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelRooms" INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "hotelNights" INTEGER NOT NULL DEFAULT 0`) } catch { /* already exists */ }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const body = await req.json()

  // Travel-only update (from the Travel & hotels report page): touches ONLY the
  // hotel columns. Deliberately separate from the full PATCH below, which
  // deletes + recreates the team list -- a travel edit must never do that.
  if (body.travel) {
    const gate = await requireStaff(); if (!gate.ok) return gate.res
    await ensureRegistrationColumns()
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "TeamRegistration" SET "needsHotel" = ?, "hotelName" = ?, "hotelRooms" = ?, "hotelNights" = ? WHERE id = ?`,
        String(body.needsHotel || 'No'), String(body.hotelName || '').slice(0, 120),
        Number(body.hotelRooms) || 0, Number(body.hotelNights) || 0, params.id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error(e)
      return NextResponse.json({ error: 'Failed to update travel info' }, { status: 500 })
    }
  }
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
