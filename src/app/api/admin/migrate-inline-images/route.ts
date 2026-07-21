import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

// Converts base64 `data:image/...` strings embedded in an AppSetting record into
// UploadedImage rows referenced by /api/img/<id>.
//
// Why: images used to be inlined (the /api/upload route still falls back to a data
// URL when its DB write fails), so a single org's site record grew to ~1.7 MB and was
// shipped inside the HTML of every page load. Moving the bytes out lets the browser
// cache them and cuts page weight by an order of magnitude.
//
// Safe by default: runs as a DRY RUN unless ?apply=1, and always writes a timestamped
// backup of the original value before changing anything.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

async function ensureImageTable(client: ReturnType<typeof db>) {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS "UploadedImage" ("id" TEXT PRIMARY KEY, "mime" TEXT NOT NULL, "data" BLOB NOT NULL, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')))`)
  } catch { /* already exists */ }
}

const DATA_URI = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/

type Found = { path: string; mime: string; bytes: number }

/**
 * Walks any JSON structure and replaces base64 image strings with /api/img/<id>.
 * Generic on purpose — the record holds images under several keys (logo, hero,
 * gallery, galleryCovers, sponsors), and this way none get missed.
 */
async function convert(
  node: any,
  path: string,
  client: ReturnType<typeof db>,
  apply: boolean,
  found: Found[],
): Promise<any> {
  if (typeof node === 'string') {
    const m = node.match(DATA_URI)
    if (!m) return node
    const [, mime, b64] = m
    let bytes: Buffer
    try { bytes = Buffer.from(b64, 'base64') } catch { return node }
    found.push({ path, mime, bytes: bytes.length })
    if (!apply) return node
    const id = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))
    await client.execute({
      sql: 'INSERT INTO "UploadedImage" ("id","mime","data") VALUES (?,?,?)',
      args: [id, mime, new Uint8Array(bytes)],
    })
    return `/api/img/${id}`
  }
  if (Array.isArray(node)) {
    const out = []
    for (let i = 0; i < node.length; i++) out.push(await convert(node[i], `${path}[${i}]`, client, apply, found))
    return out
  }
  if (node && typeof node === 'object') {
    const out: any = {}
    for (const k of Object.keys(node)) out[k] = await convert(node[k], path ? `${path}.${k}` : k, client, apply, found)
    return out
  }
  return node
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Params come from the JSON body (query strings are blocked by some browser
  // tooling); query params still work as a fallback for manual curl-style use.
  let body: any = {}
  try { body = await req.json() } catch { /* no body sent */ }
  const key = body.key || req.nextUrl.searchParams.get('key')
  const apply = body.apply === true || req.nextUrl.searchParams.get('apply') === '1'
  if (!key) return NextResponse.json({ error: 'POST {"key":"orgSite:<orgId>"} — add "apply":true to write' }, { status: 400 })

  const client = db()
  await ensureImageTable(client)

  const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [key] })
  if (!r.rows.length) return NextResponse.json({ error: `No AppSetting row for ${key}` }, { status: 404 })

  const original = String((r.rows[0] as any).value || '')
  let parsed: any
  try { parsed = JSON.parse(original || '{}') } catch (e: any) {
    return NextResponse.json({ error: 'Stored value is not valid JSON', detail: e?.message }, { status: 500 })
  }

  const found: Found[] = []
  const converted = await convert(parsed, '', client, apply, found)
  const nextValue = JSON.stringify(converted)

  const result: any = {
    key,
    mode: apply ? 'APPLIED' : 'DRY RUN (add &apply=1 to write)',
    imagesFound: found.length,
    inlineBytesTotal: found.reduce((s, f) => s + f.bytes, 0),
    sizeBefore: original.length,
    sizeAfter: nextValue.length,
    reductionPct: original.length ? Math.round((1 - nextValue.length / original.length) * 100) : 0,
    images: found.map(f => ({ path: f.path, mime: f.mime, kb: Math.round(f.bytes / 1024) })),
  }

  if (!apply) return NextResponse.json(result)

  // Guard: never write something that isn't valid JSON or that lost content.
  try { JSON.parse(nextValue) } catch {
    return NextResponse.json({ ...result, error: 'ABORTED — rewritten value was not valid JSON' }, { status: 500 })
  }
  if (Object.keys(converted || {}).length !== Object.keys(parsed || {}).length) {
    return NextResponse.json({ ...result, error: 'ABORTED — top-level keys changed' }, { status: 500 })
  }

  const backupKey = `${key}:backup:${Date.now()}`
  await client.execute({
    sql: 'INSERT INTO "AppSetting" ("key","value") VALUES (?,?)',
    args: [backupKey, original],
  })
  await client.execute({ sql: 'UPDATE "AppSetting" SET value = ? WHERE key = ?', args: [nextValue, key] })

  return NextResponse.json({ ...result, backupKey, note: 'Original saved to backupKey; restore by copying it back if needed.' })
}
