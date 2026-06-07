import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

async function ensureTable(client: ReturnType<typeof getClient>) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "RoadmapItem" (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'todo',
      createdAt   TEXT NOT NULL
    )
  `)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const client = getClient()
  await ensureTable(client)
  const result = await client.execute('SELECT * FROM "RoadmapItem" ORDER BY createdAt DESC')
  return NextResponse.json(result.rows)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { title, description } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  const client = getClient()
  await ensureTable(client)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  await client.execute({
    sql: 'INSERT INTO "RoadmapItem" (id, title, description, status, createdAt) VALUES (?, ?, ?, ?, ?)',
    args: [id, title.trim(), (description ?? '').trim(), 'todo', createdAt],
  })
  return NextResponse.json({ id, title: title.trim(), description: (description ?? '').trim(), status: 'todo', createdAt }, { status: 201 })
}
