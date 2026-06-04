import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const reg = await prisma.playerRegistration.create({
      data: {
        tournamentId:          data.tournamentId,
        playerName:            data.playerName,
        playerEmail:           data.playerEmail || '',
        usLacrosseNumber:      data.usLacrosseNumber,
        gender:                data.gender,
        dob:                   data.dob || '',
        grade:                 data.grade,
        teamClubName:          data.teamClubName,
        jerseyNumber:          data.jerseyNumber || '',
        parentName:            data.parentName,
        parentEmail:           data.parentEmail,
        parentPhone:           data.parentPhone,
        parent2Name:           data.parent2Name || '',
        parent2Email:          data.parent2Email || '',
        parent2Phone:          data.parent2Phone || '',
        emergencyContactName:  data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        waiverSignature:       data.waiverSignature,
        needsHotel:            data.needsHotel || '',
        wantsUpdates:          data.wantsUpdates || false,
      },
    })
    return NextResponse.json(reg, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to save registration' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
  const regs = await prisma.playerRegistration.findMany({
    where: { tournamentId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(regs)
}
