import { NextRequest, NextResponse } from 'next/server'
import { loadMediaApproval } from '@/lib/mediaApproval'
import { addGalleryMedia, listGalleryMedia, type NewMedia } from '@/lib/galleryStore'
import { ensureProfileFromApplication } from '@/lib/photographers'
import { LIMITS } from '@/lib/mediaUpload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Records what a photographer just uploaded, and lists it back to them.
//
// Split from the blob handshake because the bytes go straight to storage from the
// browser; this is the part that says a file exists, who shot it, and which weekend
// it belongs to. Everything is taken from the credential rather than the request
// body -- the credit, the org and the event are not the uploader's to assert.

async function gate(token: string) {
  const a = await loadMediaApproval(token)
  if (!a || !a.approved) return null
  return a
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const a = await gate(params.token)
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const items = await listGalleryMedia({ orgId: a.orgId, submissionId: a.submission.id, status: 'all', limit: 300 })
  return NextResponse.json({
    items,
    counts: {
      pending: items.filter(i => i.status === 'pending').length,
      published: items.filter(i => i.status === 'published').length,
      hidden: items.filter(i => i.status === 'hidden').length,
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const a = await gate(params.token)
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as any
  const raw: any[] = Array.isArray(body.items) ? body.items : []
  if (!raw.length) return NextResponse.json({ error: 'Nothing to record' }, { status: 400 })
  if (raw.length > LIMITS.maxFiles) return NextResponse.json({ error: 'Too many files in one go' }, { status: 400 })

  const d = a.submission.data || {}
  // The credit is the whole point of contributing, so it is written from the
  // credential and not from the request: it has to be the exact string the gallery
  // matches back to their booking page (see creditLinks in lib/photographers.ts).
  const credit = String(d.company || d.name || '').trim()
  let slug = ''
  try { slug = await ensureProfileFromApplication(a.orgId, d) } catch { /* credit still stands without a page */ }

  const items: NewMedia[] = raw
    .filter(r => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url))
    .map(r => ({
      url: String(r.url),
      kind: r.kind === 'video' ? 'video' : 'photo',
      tournamentId: a.tournamentId || '',
      caption: String(r.caption || ''),
      credit,
      photographerSlug: slug,
      submissionId: a.submission.id,
      bytes: Number(r.bytes) || 0,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      durationMs: Number(r.durationMs) || 0,
      // Everything lands pending. A credential is permission to be on the field,
      // not permission to publish to the front page of somebody's website.
      status: 'pending',
    }))

  if (!items.length) return NextResponse.json({ error: 'Nothing usable to record' }, { status: 400 })
  const ids = await addGalleryMedia(a.orgId, items)
  return NextResponse.json({ ok: true, recorded: ids.length, credit, profileSlug: slug })
}
