import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { W9_MAX_BYTES, saveW9, sniffW9, w9Status, w9StorageReady, workerIdForEmail } from '@/lib/staffW9'

export const dynamic = 'force-dynamic'

// The signed-in staff member's own W-9 (lib/staffW9), for the W-9 card on their portal.
//   GET  -> { onFile, uploadedAt, name }. Never the file: only directors can open it.
//   POST multipart `file` -> store or replace it. PDF, JPG, PNG or WebP, up to 2 MB
//        (the card shrinks photos before they leave the phone).
// The staff record comes from the session's email, never from the request.

const NO_RECORD = 'Your login isn’t linked to a staff record yet. Contact your coordinator.'

export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const workerId = await workerIdForEmail(String(gate.session?.user?.email ?? ''))
  if (!workerId) return NextResponse.json({ error: NO_RECORD }, { status: 404 })
  const s = await w9Status(workerId)
  return NextResponse.json(
    { onFile: s.onFile, uploadedAt: s.meta?.at ?? null, name: s.meta?.name ?? null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const workerId = await workerIdForEmail(String(gate.session?.user?.email ?? ''))
  if (!workerId) return NextResponse.json({ error: NO_RECORD }, { status: 404 })
  if (!w9StorageReady()) return NextResponse.json({ error: 'W-9 uploads aren’t switched on yet. Please try again later.' }, { status: 503 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Pick a file to upload.' }, { status: 400 }) }
  const file = form.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Pick a file to upload.' }, { status: 400 })
  if (file.size > W9_MAX_BYTES) return NextResponse.json({ error: 'That file is over 2 MB. Upload a photo of the signed form instead.' }, { status: 413 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const type = sniffW9(bytes)
  if (!type) return NextResponse.json({ error: 'Upload the W-9 as a PDF or a photo (JPG or PNG).' }, { status: 415 })

  try {
    const meta = await saveW9(workerId, { bytes, type, name: (file as File).name || 'W-9' }, 'portal')
    return NextResponse.json({ onFile: true, uploadedAt: meta.at, name: meta.name })
  } catch (e) {
    console.error('w9 upload', e)
    return NextResponse.json({ error: 'That didn’t upload. Please try again.' }, { status: 500 })
  }
}
