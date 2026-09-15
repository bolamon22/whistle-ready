import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId, orgById } from '@/lib/org'
import { revalidatePath } from 'next/cache'
import {
  listGalleryMedia, countGalleryMedia, setGalleryStatus, deleteGalleryMedia,
  patchGalleryMedia, type GalleryStatus,
} from '@/lib/galleryStore'

export const dynamic = 'force-dynamic'

// Staff: what photographers sent in, and whether it goes on the website.
//
// Uploads land pending and stay there. A credential is permission to be on the
// field, not permission to publish to the front of somebody's website -- and these
// are photographs of other people's children, so a person looks at each one before
// the public can.

async function gate(id: string) {
  const g = await requireStaff()
  if (!g.ok) return { res: g.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) }
  if (g.role !== 'admin' && g.orgId && g.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization' }, { status: 403 }) }
  }
  return { gate: g, orgId }
}

/** Publishing changes what the public gallery renders, and that page is cached for
 *  30 seconds by design -- without this an organizer approves a photo and then
 *  stares at a gallery that hasn't changed, which reads as a bug. */
async function refreshGallery(orgId: string) {
  try {
    const org = await orgById(orgId)
    if (org?.slug) for (const p of [`/o/${org.slug}`, `/o/${org.slug}/gallery`]) {
      try { revalidatePath(p) } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('res' in g) return g.res
  const q = new URL(req.url).searchParams
  const statusParam = String(q.get('status') || 'pending')
  const status = (['pending', 'published', 'hidden', 'all'].includes(statusParam) ? statusParam : 'pending') as GalleryStatus | 'all'
  const offset = Math.max(0, Number(q.get('offset')) || 0)

  const [items, total, pending] = await Promise.all([
    listGalleryMedia({ orgId: g.orgId, tournamentId: params.id, status, limit: 120, offset }),
    countGalleryMedia({ orgId: g.orgId, tournamentId: params.id, status }),
    countGalleryMedia({ orgId: g.orgId, tournamentId: params.id, status: 'pending' }),
  ])
  return NextResponse.json({ items, total, pending, nextOffset: offset + items.length < total ? offset + items.length : null })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any
  const action = String(body.action || '')
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map((x: any) => String(x || '')).filter(Boolean) : []

  if (action === 'caption') {
    const ok = await patchGalleryMedia(g.orgId, String(body.id || ''), { caption: String(body.caption || '') })
    if (ok) await refreshGallery(g.orgId)
    return NextResponse.json({ ok })
  }

  if (!ids.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })

  if (action === 'publish' || action === 'hide' || action === 'unpublish') {
    const status: GalleryStatus = action === 'publish' ? 'published' : 'hidden'
    const n = await setGalleryStatus(g.orgId, ids, status)
    await refreshGallery(g.orgId)
    return NextResponse.json({ ok: true, changed: n })
  }

  if (action === 'delete') {
    // The row goes; the file itself stays in blob storage. Deleting the blob from a
    // request that might be one of a hundred is how you end up with a half-deleted
    // batch and a broken gallery -- sweeping orphans is a separate, safer job.
    const n = await deleteGalleryMedia(g.orgId, ids)
    await refreshGallery(g.orgId)
    return NextResponse.json({ ok: true, removed: n })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
