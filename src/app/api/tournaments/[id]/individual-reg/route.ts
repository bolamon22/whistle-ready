import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET — list all individual registrations for a tournament
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regs = await (prisma as any).individualRegistration.findMany({
      where: { tournamentId: params.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(regs)
  } catch {
    return NextResponse.json([])
  }
}

// POST — create a registration (payment handled separately)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg = await (prisma as any).individualRegistration.create({
      data: {
        tournamentId: params.id,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || '',
        position: body.position,
        numberRequest: body.numberRequest || '',
        jerseySize: body.jerseySize,
        shortsSize: body.shortsSize,
        usLacrosseNumber: body.usLacrosseNumber || '',
        dateOfBirth: body.dateOfBirth || '',
        guardianName: body.guardianName || '',
        guardianPhone: body.guardianPhone || '',
        guardianEmail: body.guardianEmail || '',
        emergencyContactName: body.emergencyContactName || '',
        emergencyContactPhone: body.emergencyContactPhone || '',
        emergencyRelationship: body.emergencyRelationship || '',
        medicalNotes: body.medicalNotes || '',
        waiverSigned: Boolean(body.waiverSigned),
        waiverSignature: body.waiverSignature || '',
        paymentStatus: body.paymentStatus || 'pending',
        feeTierId: body.feeTierId || '',
        feeTierName: body.feeTierName || '',
        feeTierAmount: body.feeTierAmount ? Number(body.feeTierAmount) : 0,
      },
    })
    return NextResponse.json(reg)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 })
  }
}
