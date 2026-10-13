import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyGameMoment, pastHalftime } from '@/lib/finalAlerts'

// Live in-progress scores so parents can follow on the public page (no login).
// Each game's live state is stored in AppSetting under key `liveScore:<gameId>`:
//   { score1, score2, period, periodLabel, live, updatedAt }
// GET is public (returns a map keyed by gameId). POST requires a staffer (the scorekeeper).

// Guarded so the CREATE TABLE statement runs once per warm serverless
// instance, not on every poll. GET here is hit every 20-30s by every open
// spectator tab during a live event -- re-issuing a DDL statement on each
// of those was pure waste (Sep 2026 load-readiness pass).
let appSettingTableEnsured = false
async function ensureTable() {
  if (appSettingTableEnsured) return
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
    appSettingTableEnsured = true
  } catch { /* ignore, will retry next request */ }
}

const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']
const isStaff = (role?: string) => !!role && !EXTERNAL_ROLES.includes(role)

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT "key","value" FROM "AppSetting" WHERE "key" LIKE 'liveScore:%'`)
    const scores: Record<string, any> = {}
    for (const r of rows || []) {
      const gameId = String(r.key).slice('liveScore:'.length)
      try {
        const v = JSON.parse(r.value || '{}')
        // A scorer who never taps Final (a test run, a closed phone) would leave the
        // game "LIVE" on the public ticker forever (Bo, Oct 12 2026: test games from
        // the night before still showed LIVE - HALF 1). A real game pushes on every
        // goal, period and clock stop, so 4 hours of silence means it isn't live.
        const age = Date.now() - Date.parse(v.updatedAt || '')
        if (v.live && !(age < 4 * 60 * 60 * 1000)) v.live = false
        scores[gameId] = v
      } catch { /* skip */ }
    }
    // Short shared cache: collapses many concurrent spectator polls into a
    // handful of DB hits (event-weekend load-readiness pass, Sep 2026) while
    // staying well under the 20-30s client poll interval.
    return NextResponse.json({ scores }, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=20' },
    })
  } catch {
    return NextResponse.json({ scores: {} })
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
    const gameId = String(body.gameId || '').trim()
    if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

    const k = `liveScore:${gameId}`
    // What followers have already been told about this game (start/halftime),
    // carried from the previous update so each alert goes out once.
    let prevAlerts: { start?: boolean; half?: boolean } = {}
    try {
      const prev = await prisma.appSetting.findUnique({ where: { key: k } })
      if (prev) prevAlerts = (JSON.parse(prev.value || '{}').alerts) || {}
    } catch { /* first update */ }
    const entry = {
      score1: Number(body.score1) || 0,
      score2: Number(body.score2) || 0,
      period: Number(body.period) || 1,
      periodLabel: String(body.periodLabel || ''),
      live: !!body.live,
      updatedAt: new Date().toISOString(),
      alerts: { ...prevAlerts },
    }
    // Start: the first live update (clock started or first goal). Halftime: the
    // scorer's clock ran out at the end of the half, or they moved into the
    // second half. Finals go out from the game save (lib/finalAlerts notifyFinal).
    const wantStart = entry.live && !prevAlerts.start
    const wantHalf = entry.live && !prevAlerts.half && (body.event === 'halftime' || pastHalftime(entry.periodLabel, entry.period))
    if (wantStart || wantHalf) {
      const g = await prisma.game.findUnique({ where: { id: gameId } }).catch(() => null)
      if (g && g.tournamentId === params.id) {
        const base = { ...g, score1: entry.score1, score2: entry.score2, url: `/tournaments/${params.id}/public/games/${g.id}` }
        // Marked as sent only when it actually went out (null = held back: not
        // event day, too early, placeholder teams), so a scorer testing the
        // clock an hour early doesn't use up the real start alert.
        if (wantHalf) {
          if (await notifyGameMoment('halftime', base)) { entry.alerts.half = true; entry.alerts.start = true }
        } else if (await notifyGameMoment('start', base)) {
          entry.alerts.start = true
        }
      }
    }
    await prisma.appSetting.upsert({
      where: { key: k },
      update: { value: JSON.stringify(entry) },
      create: { key: k, value: JSON.stringify(entry) },
    })
    return NextResponse.json({ ok: true, ...entry })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save' }, { status: 500 })
  }
}
