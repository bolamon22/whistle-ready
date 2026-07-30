import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

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
  const client = getClient()
  await ensureColumns(client)
  const result = await client.execute({
    sql: 'SELECT scheduleSnapshot, schedulePublishedAt FROM "Tournament" WHERE id = ?',
    args: [params.id],
  })
  const row = result.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const snapshot = JSON.parse((row.scheduleSnapshot as string) || '{}')
  return NextResponse.json({
    snapshot,
    publishedAt: row.schedulePublishedAt as string || null,
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = getClient()
  await ensureColumns(client)

  const games = await prisma.game.findMany({
    where: { tournamentId: params.id },
    select: { id: true, gameNumber: true, date: true, startTime: true, location: true, division: true, team1: true, team2: true },
  })

  const publishedAt = new Date().toISOString()
  const snapshot = JSON.stringify({ publishedAt, games })

  await client.execute({
    sql: 'UPDATE "Tournament" SET scheduleSnapshot = ?, schedulePublishedAt = ? WHERE id = ?',
    args: [snapshot, publishedAt, params.id],
  })

  return NextResponse.json({ ok: true, publishedAt, gamesCount: games.length })
}
