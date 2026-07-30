import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; regId: string } }
) {
  try {
    const body = await req.json()
    // Auth (Jul 2026 sweep): the PUBLIC individual-registration flow PATCHes
    // this route (self-service fields + a redundant post-Stripe status echo —
    // the webhook is what authoritatively marks 'paid'), so it can't be
    // staff-only. Instead, anonymous callers lose the money fields: without
    // this, anyone could set paymentStatus='paid' and skip paying.
    const gate = await requireStaff()
    if (!gate.ok) { delete body.paymentStatus; delete body.feeTierId; delete body.feeTierName; delete body.feeTierAmount }
    // Nothing left after stripping (e.g. the post-Stripe {paymentStatus} echo)?
    // Answer OK without an empty Prisma update — the webhook already did the work.
    if (Object.keys(body).length === 0) {
      const current = await prisma.individualRegistration.findUnique({ where: { id: params.regId } })
      return NextResponse.json(current ?? { ok: true })
    }
    const reg = await prisma.individualRegistration.update({
      where: { id: params.regId },
      data: {
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.numberRequest !== undefined && { numberRequest: body.numberRequest }),
        ...(body.jerseySize !== undefined && { jerseySize: body.jerseySize }),
        ...(body.shortsSize !== undefined && { shortsSize: body.shortsSize }),
        ...(body.usLacrosseNumber !== undefined && { usLacrosseNumber: body.usLacrosseNumber }),
        ...(body.dateOfBirth !== undefined && { dateOfBirth: body.dateOfBirth }),
        ...(body.guardianName !== undefined && { guardianName: body.guardianName }),
        ...(body.guardianPhone !== undefined && { guardianPhone: body.guardianPhone }),
        ...(body.guardianEmail !== undefined && { guardianEmail: body.guardianEmail }),
        ...(body.emergencyContactName !== undefined && { emergencyContactName: body.emergencyContactName }),
        ...(body.emergencyContactPhone !== undefined && { emergencyContactPhone: body.emergencyContactPhone }),
        ...(body.emergencyRelationship !== undefined && { emergencyRelationship: body.emergencyRelationship }),
        ...(body.medicalNotes !== undefined && { medicalNotes: body.medicalNotes }),
        ...(body.waiverSigned !== undefined && { waiverSigned: Boolean(body.waiverSigned) }),
        ...(body.waiverSignature !== undefined && { waiverSignature: body.waiverSignature }),
        ...(body.feeTierId !== undefined && { feeTierId: body.feeTierId }),
        ...(body.feeTierName !== undefined && { feeTierName: body.feeTierName }),
        ...(body.feeTierAmount !== undefined && { feeTierAmount: Number(body.feeTierAmount) }),
        ...(body.paymentStatus !== undefined && { paymentStatus: body.paymentStatus }),
      },
    })
    return NextResponse.json(reg)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; regId: string } }
) {
  // Deleting a registrant — staff only. Was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    await prisma.individualRegistration.delete({ where: { id: params.regId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete registration' }, { status: 500 })
  }
}
