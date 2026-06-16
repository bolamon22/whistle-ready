import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// The AppSetting table is hand-migrated and may not exist yet on some databases.
async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

// Global default Smart Defaults plan. New/unconfigured tournaments inherit this
// when no per-tournament plan is saved.
export async function GET() {
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: 'defaultSmartDefaults' } })
    return NextResponse.json(row ? JSON.parse(row.value || '{}') : {})
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable()
    const body = await req.json()
    const value = JSON.stringify({ table: body.table || {}, guarantee: body.guarantee ?? 4 })
    await prisma.appSetting.upsert({
      where: { key: 'defaultSmartDefaults' },
      update: { value },
      create: { key: 'defaultSmartDefaults', value },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save default' }, { status: 500 })
  }
}
