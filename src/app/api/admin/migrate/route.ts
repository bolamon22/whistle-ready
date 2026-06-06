import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IndividualRegistration" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tournamentId" TEXT NOT NULL,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "phone" TEXT NOT NULL DEFAULT '',
        "position" TEXT NOT NULL,
        "numberRequest" TEXT NOT NULL DEFAULT '',
        "jerseySize" TEXT NOT NULL,
        "shortsSize" TEXT NOT NULL,
        "usLacrosseNumber" TEXT NOT NULL DEFAULT '',
        "dateOfBirth" TEXT NOT NULL DEFAULT '',
        "guardianName" TEXT NOT NULL DEFAULT '',
        "guardianPhone" TEXT NOT NULL DEFAULT '',
        "guardianEmail" TEXT NOT NULL DEFAULT '',
        "emergencyContactName" TEXT NOT NULL DEFAULT '',
        "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
        "emergencyRelationship" TEXT NOT NULL DEFAULT '',
        "medicalNotes" TEXT NOT NULL DEFAULT '',
        "waiverSigned" INTEGER NOT NULL DEFAULT 0,
        "waiverSignature" TEXT NOT NULL DEFAULT '',
        "feeTierId" TEXT NOT NULL,
        "feeTierName" TEXT NOT NULL,
        "feeTierAmount" REAL NOT NULL,
        "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
        "stripePaymentIntent" TEXT,
        "stripeSessionId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IndividualRegistration_tournamentId_idx" ON "IndividualRegistration"("tournamentId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "IndividualRegistration_email_idx" ON "IndividualRegistration"("email")`)
    return NextResponse.json({ ok: true, message: 'IndividualRegistration table created (or already existed)' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
