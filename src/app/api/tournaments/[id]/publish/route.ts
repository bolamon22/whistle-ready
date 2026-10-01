import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { setPublicVisibility } from '@/lib/publicView'
import { followerCounts, followerPhoneCounts, sendPushToFollowers } from '@/lib/follows'
import { affectedTeams, teamDigest, type DigestGame } from '@/lib/scheduleDigest'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

async function ensureColumns(client: ReturnType<typeof getClient>) {
  for (const col of [
    `ALTER TABLE "Tournament" ADD COLUMN "scheduleSnapshot" TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE "Tournament" ADD COLUMN "schedulePublishedAt" TEXT NOT NULL DEFAULT ''`,
  ]) {
    try { await client.execute(col) } catch { /* already exists */ }
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  // Staff only (the Scheduler's diff): the public reads the snapshot through the
  // games feed, which applies the Publish switches.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = getClient()
  await ensureColumns(client)
  const result = await client.execute({
    sql: 'SELECT scheduleSnapshot, schedulePublishedAt FROM "Tournament" WHERE id = ?',
    args: [params.id],
  })
  const row = result.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const snapshot = JSON.parse((row.scheduleSnapshot as string) || '{}')
  // Who a Publish would reach, per team (keyed by teamRefKey(division, team)):
  // follows, and phones with alerts on. The Scheduler's diff works out which
  // teams are affected; this gives it the numbers to put beside the "Tell
  // followers" toggle. Best-effort.
  let followers: Record<string, { follows: number; phones: number }> = {}
  try {
    const [f, ph] = await Promise.all([followerCounts(params.id), followerPhoneCounts(params.id)])
    for (const t of new Set([...Object.keys(f), ...Object.keys(ph)])) followers[t] = { follows: f[t] || 0, phones: ph[t] || 0 }
  } catch { followers = {} }
  return NextResponse.json({
    snapshot,
    publishedAt: row.schedulePublishedAt as string || null,
    followers,
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = getClient()
  await ensureColumns(client)

  // { notify: boolean } -- Bo's "Tell followers" toggle. Nothing is sent unless
  // it is true; a Publish with no body at all is a quiet one.
  let notify = false
  try { const b = await req.json(); notify = b?.notify === true } catch { /* no body: quiet publish */ }

  // What the public saw until now, BEFORE it is overwritten below: the diff that
  // decides which teams changed has to be taken against the old snapshot.
  const prevRow = (await client.execute({
    sql: 'SELECT name, scheduleSnapshot, schedulePublishedAt FROM "Tournament" WHERE id = ?', args: [params.id],
  })).rows[0]
  const tournamentName = String(prevRow?.name || 'The tournament')
  const firstPublish = !prevRow?.schedulePublishedAt
  let before: Record<string, { date: string; startTime: string; location: string }> | null = null
  if (!firstPublish) {
    try {
      const snap = JSON.parse((prevRow?.scheduleSnapshot as string) || '{}')
      before = {}
      for (const g of (snap.games || []) as any[]) before[g.id] = { date: g.date || '', startTime: g.startTime || '', location: g.location || '' }
    } catch { before = {} }
  }

  const games = await prisma.game.findMany({
    where: { tournamentId: params.id },
    select: { id: true, gameNumber: true, date: true, startTime: true, location: true, division: true, team1: true, team2: true, isCanceled: true },
  })

  const publishedAt = new Date().toISOString()
  const snapshot = JSON.stringify({ publishedAt, games })

  await client.execute({
    sql: 'UPDATE "Tournament" SET scheduleSnapshot = ?, schedulePublishedAt = ? WHERE id = ?',
    args: [snapshot, publishedAt, params.id],
  })
  // Publishing is what puts the schedule in front of the public: the public page now
  // shows this snapshot's times and fields until the next Publish.
  await setPublicVisibility(params.id, { schedule: 'live', pools: 'live' })

  // Followers hear AFTER the snapshot is saved, so anyone who taps the alert
  // lands on the schedule it describes. One message per affected team carrying
  // that team's schedule as it now stands (lib/scheduleDigest) -- never one per
  // moved game. Best-effort: a push failure must not fail the Publish.
  let notified = { teams: 0, sent: 0, failed: 0 }
  if (notify) {
    try {
      const teams = affectedTeams(before, games as DigestGame[])
      for (const team of teams) {
        const d = teamDigest(team, games as DigestGame[], { tournamentId: params.id, tournamentName, firstPublish })
        if (!d) continue
        const r = await sendPushToFollowers(params.id, [team], { title: d.title, body: d.body, url: `/tournaments/${params.id}/public`, tag: d.tag })
        notified.teams++; notified.sent += r.sent; notified.failed += r.failed
      }
    } catch (e) { console.error('[publish] follower alerts failed (non-blocking):', e) }
  }

  return NextResponse.json({ ok: true, publishedAt, gamesCount: games.length, notified })
}
