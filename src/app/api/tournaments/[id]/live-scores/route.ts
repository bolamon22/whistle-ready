import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { notifyGameMoment, pastHalftime } from '@/lib/finalAlerts'
import { ownClubRefusal } from '@/lib/ownClub'

// Live in-progress scores so parents can follow on the public page (no login).
// Each game's live state is stored in AppSetting under key `liveScore:<gameId>`:
//   { score1, score2, period, periodLabel, live, clockMs, clockRunning, penalties, updatedAt }
// clockMs is the time left on the scorer's clock at updatedAt; while clockRunning,
// viewers count it down from there (LiveTicker liveClockText). penalties are the
// players in the box: [{ team: 1|2, num, secs left at updatedAt, paused }].
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

// A database call that stalls (Turso hiccup, dropped connection) has no timeout of its
// own: on Oct 23 one poll sat for the full 300 s. Every spectator phone hits this route,
// so give up after 8 s and let the next poll (or the CDN's stale copy) answer instead.
const DB_GIVE_UP_MS = 8000
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('live-scores: database call timed out')), DB_GIVE_UP_MS)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await withTimeout(ensureTable())
    const rows: any[] = await withTimeout(prisma.$queryRawUnsafe(`SELECT "key","value" FROM "AppSetting" WHERE "key" LIKE 'liveScore:%'`)) as any[]
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
    // no-store: an empty answer from a failure must not be cached as if nothing is live
    return NextResponse.json({ scores: {} }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireStaff(); if (!gate.ok) return gate.res

    await ensureTable()
    const body = await req.json().catch(() => ({}))
    const gameId = String(body.gameId || '').trim()
    if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
    // The game has to be at this event: a field director's login reaches only their
    // own events' URLs (middleware), and the game id rides in the body. And someone
    // else keeps score when the scorer's own club is playing (lib/ownClub).
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { tournamentId: true, team1: true, team2: true } }).catch(() => null)
    if (game) {
      if (game.tournamentId !== params.id) return NextResponse.json({ error: 'That game is not at this event.' }, { status: 400 })
      const refused = await ownClubRefusal(gate, game.tournamentId, [game.team1, game.team2]); if (refused) return refused
    }

    const k = `liveScore:${gameId}`
    // What followers have already been told about this game (start/halftime),
    // carried from the previous update so each alert goes out once.
    let prevAlerts: { start?: boolean; half?: boolean } = {}
    let prevBy = '', prevActedAt = ''
    let pv: any = null
    try {
      const prev = await prisma.appSetting.findUnique({ where: { key: k } })
      if (prev) { pv = JSON.parse(prev.value || '{}'); prevAlerts = pv.alerts || {}; prevBy = pv.by || ''; prevActedAt = pv.actedAt || '' }
    } catch { /* first update */ }
    // A 30s refresh from a screen that isn't leading is dropped: it would put back
    // its own, older copy of the game over the screen that just acted.
    if (body.action === false && prevBy && body.by && body.by !== prevBy && pv?.live) {
      return NextResponse.json({ ok: true, ignored: true, ...pv })
    }
    const nowMs = Date.now()
    const cleanPens = (list: any) => Array.isArray(list) ? list.slice(0, 12).map((p: any) => ({
      team: Number(p?.team) === 2 ? 2 : 1,
      num: String(p?.num ?? '').slice(0, 4),
      secs: Math.max(0, Math.min(3600, Math.round(Number(p?.secs) || 0))),
      paused: !!p?.paused,
    })).filter((p: any) => p.secs > 0) : []
    const entry = {
      score1: Number(body.score1) || 0,
      score2: Number(body.score2) || 0,
      period: Number(body.period) || 1,
      periodLabel: String(body.periodLabel || ''),
      live: !!body.live,
      clockMs: body.clockMs == null || isNaN(Number(body.clockMs)) ? null : Math.max(0, Math.round(Number(body.clockMs))),
      clockRunning: !!body.clockRunning,
      // Which scorekeeper screen sent this, and when someone last DID something
      // (goal, clock, penalty, half) as opposed to a 30s refresh. Every open
      // scorekeeper on the game follows the screen that acted last (Bo, Oct 12
      // 2026: a second tab kept overwriting a penalty entered on the first).
      by: body.action === false ? prevBy || String(body.by || '').slice(0, 40) : String(body.by || '').slice(0, 40),
      actedAt: body.action === false && prevActedAt ? prevActedAt : new Date().toISOString(),
      penalties: cleanPens(body.penalties),
      updatedAt: new Date(nowMs).toISOString(),
      alerts: { ...prevAlerts },
    }
    // An action names what it changed (`fields`: score, period, clock, penalties);
    // everything else is kept from the stored game, run forward to now. Two
    // screens on one game no longer erase each other: a penalty added on one
    // doesn't undo the goal just scored on the other.
    if (Array.isArray(body.fields) && pv && pv.live && entry.live) {
      const f = new Set(body.fields.map(String))
      const sent = Date.parse(pv.updatedAt || '')
      const ran = pv.clockRunning && !isNaN(sent) ? Math.max(0, nowMs - sent) : 0
      if (!f.has('score')) { entry.score1 = Number(pv.score1) || 0; entry.score2 = Number(pv.score2) || 0 }
      if (!f.has('period')) { entry.period = Number(pv.period) || 1; entry.periodLabel = String(pv.periodLabel || '') }
      if (!f.has('clock')) {
        entry.clockMs = pv.clockMs == null ? null : Math.max(0, Number(pv.clockMs) - ran)
        entry.clockRunning = !!pv.clockRunning && (entry.clockMs ?? 0) > 0
      }
      if (!f.has('penalties')) {
        const ranSecs = Math.floor(Math.min(ran, Number(pv.clockMs) || 0) / 1000)
        entry.penalties = cleanPens((pv.penalties || []).map((p: any) => ({ ...p, secs: p.paused ? p.secs : p.secs - ranSecs })))
      }
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
