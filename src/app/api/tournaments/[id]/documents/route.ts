import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'

export const runtime = 'nodejs'

// Tournament document vault: grant applications, COIs, permits, venue
// contracts — the paperwork pile every tournament accumulates. Files live as
// DB blobs (same play as UploadedImage: Vercel has no disk) in a raw table,
// created on demand — no Prisma schema change, no migration to run.
function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

async function ensure(client: ReturnType<typeof db>) {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS "TournamentDocument" (
      "id" TEXT PRIMARY KEY,
      "tournamentId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'Other',
      "mime" TEXT NOT NULL,
      "size" INTEGER NOT NULL DEFAULT 0,
      "data" BLOB NOT NULL,
      "uploadedBy" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch { /* ignore */ }
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB — plenty for signed PDFs and scans

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = db(); await ensure(client)
  const res = await client.execute({
    sql: `SELECT "id","name","category","mime","size","uploadedBy","createdAt" FROM "TournamentDocument" WHERE "tournamentId" = ? ORDER BY "category","createdAt" DESC`,
    args: [params.id],
  })
  return NextResponse.json(res.rows)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const category = String(formData.get('category') || 'Other').slice(0, 40)
  const name = String(formData.get('name') || file.name || 'document').slice(0, 160)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: 'File too large (10 MB max)' }, { status: 413 })
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })

  const client = db(); await ensure(client)
  const id = crypto.randomUUID()
  const uploadedBy = (gate as any).session?.user?.name || (gate as any).session?.user?.email || null
  await client.execute({
    sql: `INSERT INTO "TournamentDocument" ("id","tournamentId","name","category","mime","size","data","uploadedBy") VALUES (?,?,?,?,?,?,?,?)`,
    args: [id, params.id, name, category, file.type || 'application/octet-stream', bytes.length, bytes, uploadedBy],
  })
  return NextResponse.json({ id, name, category, mime: file.type, size: bytes.length }, { status: 201 })
}
