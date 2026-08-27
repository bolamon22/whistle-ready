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

  // Stripe paid-marking from the public register page: anonymous but VERIFIED --
  // we confirm with Stripe (secret key) that this intent really succeeded for THIS
  // registration before recording a payment. Nothing else is writable on this path.
  if (body.stripeConfirm) {
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    const piId = String(body.stripeConfirm)
    if (!/^pi_[A-Za-z0-9]+$/.test(piId)) return NextResponse.json({ error: 'Bad payment intent id' }, { status: 400 })
    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}`, { headers: stripeHeaders })
    const pi = await piRes.json()
    if (!piRes.ok) return NextResponse.json({ error: pi?.error?.message || 'Stripe lookup failed' }, { status: 502 })
    if (pi.status !== 'succeeded' || pi.metadata?.registrationId !== params.id) {
      return NextResponse.json({ error: 'Payment not verified' }, { status: 400 })
    }
    const existing = await prisma.registrationPayment.findFirst({
      where: { registrationId: params.id, notes: { contains: piId } },
    })
    if (!existing) {
      // Record the BASE amount (what they owed) when the intent carries it; the
      // 3% card fee goes in the note so invoiced-vs-paid balances stay clean.
      const charged = (pi.amount_received ?? pi.amount ?? 0) / 100
      const base = parseFloat(pi.metadata?.baseAmount || '')
      const recordAmount = base > 0 && base <= charged ? base : charged
      await prisma.registrationPayment.create({
        data: {
          registrationId: params.id,
          amount: recordAmount,
          method: 'credit_card',
          checkNumber: '',
          receivedAt: new Date().toISOString().split('T')[0],
          notes: `Stripe · ${piId}${recordAmount < charged ? ` · incl. $${(charged - recordAmount).toFixed(2)} card fee (charged $${charged.toFixed(2)})` : ''}`,
        },
      })
    }
    return NextResponse.json({ ok: true })
  }

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
  // Full staff edit below (deletes + recreates the team list) -- never anonymous.
  const gate = await requireStaff(); if (!gate.ok) return gate.res

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
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.teamRegistration.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
