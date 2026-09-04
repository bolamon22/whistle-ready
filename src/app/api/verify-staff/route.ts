import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

// PUBLIC staff-credential check — the target of the QR code on printed staff ID
// cards. Deliberately exposes only what a gate volunteer needs to see: name, roles,
// org, and that the record exists. Never contact info, pay, or cert details.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  if (!id || id.length > 64) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const res = await client.execute({ sql: `SELECT id, name, defaultRole, roles, orgId, createdAt FROM "Worker" WHERE id = ?`, args: [id] })
  const w = res.rows[0] as Record<string, unknown> | undefined
  if (!w) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let roles: string[]
  try {
    const r = JSON.parse(String(w.roles ?? '[]'))
    roles = Array.isArray(r) && r.length ? r.map(String) : [String(w.defaultRole ?? 'ref')]
  } catch { roles = [String(w.defaultRole ?? 'ref')] }

  let orgName: string | null = null
  if (w.orgId) {
    try {
      const o = await client.execute({ sql: `SELECT name FROM "Organization" WHERE id = ?`, args: [String(w.orgId)] })
      orgName = (o.rows[0]?.name as string) ?? null
    } catch { /* org table is raw */ }
  }

  return NextResponse.json({ id: String(w.id), name: String(w.name ?? ''), roles, orgName, active: true })
}
