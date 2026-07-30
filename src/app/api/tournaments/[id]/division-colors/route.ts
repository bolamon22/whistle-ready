import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

async function ensureTable(client: ReturnType<typeof getClient>) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "DivisionColor" (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL,
      division TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1'
    )
  `)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const client = getClient()
  await ensureTable(client)
  const rows = await client.execute({
    sql: 'SELECT division, color FROM "DivisionColor" WHERE tournamentId = ?',
    args: [params.id],
  })
  const map: Record<string, string> = {}
  for (const row of rows.rows) map[row.division as string] = row.color as string
  return NextResponse.json(map)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { division, color } = await req.json()
  if (!division || !color) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const client = getClient()
  await ensureTable(client)
  const id = `${params.id}-${division}`
  await client.execute({
    sql: `INSERT INTO "DivisionColor" (id, tournamentId, division, color) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET color = excluded.color`,
    args: [id, params.id, division, color],
  })
  return NextResponse.json({ ok: true })
}
