import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const client = getClient()
    const result = await client.execute({
      sql: 'SELECT venues FROM "Tournament" WHERE id = ?',
      args: [params.id],
    })
    const row = result.rows[0]
    const raw = row ? JSON.parse((row.venues as string) || '{}') : {}
    // Support both old array format and new object format
    if (Array.isArray(raw)) return NextResponse.json({ venues: raw, defaultAvailability: [] })
    return NextResponse.json({ venues: raw.venues || [], defaultAvailability: raw.defaultAvailability || [] })
  } catch {
    return NextResponse.json({ venues: [], defaultAvailability: [] })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { venues, defaultAvailability } = await req.json()
    const client = getClient()
    try {
      await client.execute(`ALTER TABLE "Tournament" ADD COLUMN "venues" TEXT NOT NULL DEFAULT '[]'`)
    } catch { /* already exists */ }
    await client.execute({
      sql: 'UPDATE "Tournament" SET venues = ? WHERE id = ?',
      args: [JSON.stringify({ venues, defaultAvailability }), params.id],
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
