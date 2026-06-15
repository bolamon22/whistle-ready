import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Tournament scoring config: the playing-rules reference text shown in the
// scorekeeper's 📖 Rules panel, plus the "no ties" flag. Stored as JSON in the
// hand-migrated AppSetting table under key `scoringConfig:<id>`.
// GET is open (staff scorekeepers read it); POST requires a logged-in staffer.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `scoringConfig:${id}`
const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)
const PERIOD_FORMATS = ['halves', 'quarters', 'periods', 'running']
const DEFAULT_CONFIG = { rules: '', noTies: false, periodFormat: 'halves', periodBreakMin: 10, officialTimeOnField: true }

async function readConfig(id: string) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(id) } })
    if (!row) return { ...DEFAULT_CONFIG }
    const v = JSON.parse(row.value || '{}')
    return {
      rules: typeof v.rules === 'string' ? v.rules : '',
      noTies: !!v.noTies,
      periodFormat: PERIOD_FORMATS.includes(v.periodFormat) ? v.periodFormat : 'halves',
      periodBreakMin: Number.isFinite(v.periodBreakMin) ? Math.max(0, Math.min(60, Math.round(v.periodBreakMin))) : 10,
      officialTimeOnField: v.officialTimeOnField === undefined ? true : !!v.officialTimeOnField,
    }
  } catch { return { ...DEFAULT_CONFIG } }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    return NextResponse.json(await readConfig(params.id))
  } catch {
    return NextResponse.json({ ...DEFAULT_CONFIG })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(role)) return NextResponse.json({ error: 'Staff only' }, { status: 403 })

    await ensureTable()
    const body = await req.json().catch(() => ({}))
    const current = await readConfig(params.id)
    const next = {
      rules: typeof body.rules === 'string' ? body.rules : current.rules,
      noTies: typeof body.noTies === 'boolean' ? body.noTies : current.noTies,
      periodFormat: PERIOD_FORMATS.includes(body.periodFormat) ? body.periodFormat : current.periodFormat,
      periodBreakMin: Number.isFinite(body.periodBreakMin) ? Math.max(0, Math.min(60, Math.round(body.periodBreakMin))) : current.periodBreakMin,
      officialTimeOnField: typeof body.officialTimeOnField === 'boolean' ? body.officialTimeOnField : current.officialTimeOnField,
    }
    await prisma.appSetting.upsert({
      where: { key: key(params.id) },
      update: { value: JSON.stringify(next) },
      create: { key: key(params.id), value: JSON.stringify(next) },
    })
    return NextResponse.json({ ok: true, ...next })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
