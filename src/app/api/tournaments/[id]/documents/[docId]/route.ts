import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'

export const runtime = 'nodejs'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// Download a stored tournament document (staff only — COIs and grant filings
// aren't public). Served inline for PDFs so the browser previews them.
export async function GET(_: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = db()
  try {
    const res = await client.execute({
      sql: `SELECT "name","mime","data" FROM "TournamentDocument" WHERE "id" = ? AND "tournamentId" = ?`,
      args: [params.docId, params.id],
    })
    if (!res.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const row: any = res.rows[0]
    const data = row.data as ArrayBuffer
    const mime = String(row.mime || 'application/octet-stream')
    const name = String(row.name || 'document').replace(/[^\w.\- ]+/g, '_')
    const disposition = mime === 'application/pdf' || mime.startsWith('image/') ? 'inline' : 'attachment'
    return new NextResponse(Buffer.from(new Uint8Array(data as any)), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `${disposition}; filename="${name}"`,
        'Cache-Control': 'private, max-age=0',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const client = db()
  await client.execute({
    sql: `DELETE FROM "TournamentDocument" WHERE "id" = ? AND "tournamentId" = ?`,
    args: [params.docId, params.id],
  })
  return NextResponse.json({ ok: true })
}
