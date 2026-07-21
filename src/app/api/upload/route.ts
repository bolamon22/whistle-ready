import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

export const runtime = 'nodejs'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

async function ensure(client: ReturnType<typeof db>) {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS "UploadedImage" ("id" TEXT PRIMARY KEY, "mime" TEXT NOT NULL, "data" BLOB NOT NULL, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')))`)
  } catch { /* ignore */ }
}

// Images above this size are never inlined. A small logo embedded in a JSON record is
// harmless; a large one is not — see the note on the fallback below.
const MAX_INLINE_BYTES = 32 * 1024

// Stores the uploaded image as a DB blob and returns a short URL (/api/img/<id>).
// Keeping image bytes out of the site/event JSON lets galleries hold many photos
// without blowing the request/row size limits.
//
// This used to silently fall back to an inline data URL whenever the DB write failed.
// That looked harmless but is how an org's site record reached 1.7 MB and a single
// tournament logo reached 1.5 MB: the bytes ended up inside a JSON column and shipped
// in the HTML of every page load (2.7 MB pages, ~14s). The failure was invisible
// because the upload still reported success.
//
// Now: retry once, then inline only if the image is genuinely small, otherwise fail
// loudly so it surfaces at upload time instead of becoming hidden weight.
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'

  const client = db()
  await ensure(client)

  let lastErr: any = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const id = (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)))
      await client.execute({ sql: 'INSERT INTO "UploadedImage" ("id","mime","data") VALUES (?,?,?)', args: [id, mimeType, bytes] })
      return NextResponse.json({ url: `/api/img/${id}` })
    } catch (e: any) {
      lastErr = e
      console.error(`[upload] DB write failed (attempt ${attempt}/2), ${bytes.length} bytes:`, e?.message || e)
    }
  }

  if (bytes.length <= MAX_INLINE_BYTES) {
    // Small enough that inlining won't meaningfully bloat whatever record holds it.
    console.warn(`[upload] inline data-URL fallback used for a small image (${bytes.length} bytes)`)
    const base64 = Buffer.from(bytes).toString('base64')
    return NextResponse.json({ url: `data:${mimeType};base64,${base64}`, inlineFallback: true })
  }

  console.error(`[upload] REJECTED: image storage unavailable and ${bytes.length} bytes is too large to inline`)
  return NextResponse.json({
    error: 'Could not store the image. Please try again.',
    detail: lastErr?.message || 'image storage unavailable',
  }, { status: 500 })
}
