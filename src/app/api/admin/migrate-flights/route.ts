import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Idempotent migration: add flight + numberOffset to Bracket so a division can
// hold more than one bracket (Stage 2 flighting). Every existing bracket becomes
// Flight A with offset 0, so nothing currently live changes.
async function addCol(sql: string, label: string, log: string[]) {
  try {
    await prisma.$executeRawUnsafe(sql)
    log.push(`added ${label}`)
  } catch (e: any) {
    const m = String(e?.message || '')
    if (m.includes('duplicate column') || m.includes('already exists')) log.push(`${label} already present`)
    else throw e
  }
}

export async function POST() {
  const log: string[] = []
  try {
    await addCol(`ALTER TABLE "Bracket" ADD COLUMN "flight" TEXT NOT NULL DEFAULT 'A'`, 'Bracket.flight', log)
    await addCol(`ALTER TABLE "Bracket" ADD COLUMN "numberOffset" INTEGER NOT NULL DEFAULT 0`, 'Bracket.numberOffset', log)
    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err), log }, { status: 500 })
  }
}
