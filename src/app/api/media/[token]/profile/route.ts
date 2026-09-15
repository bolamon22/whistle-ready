import { NextRequest, NextResponse } from 'next/server'
import { loadMediaApproval } from '@/lib/mediaApproval'
import { profileBySlug, savePhotographerSelf, ensureProfileFromApplication } from '@/lib/photographers'

// PUBLIC by token: a credentialed photographer editing their OWN booking page.
//
// The 128-bit credential token is the authorization, exactly as it is for the page
// it sits on. Two things keep that honest:
//   - only an APPROVED credential can write, so a pending applicant can't publish
//   - the token resolves to one org and one profile, so nobody can name a different
//     slug in the body and edit someone else's page
// Fields the photographer may not change (the URL, whether they're listed at all)
// are filtered in savePhotographerSelf, not here.
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function resolve(token: string) {
  const a = await loadMediaApproval(token)
  if (!a || !a.approved) return null
  const wantsBookings = (Array.isArray(a.submission.data?.levels) ? a.submission.data.levels : []).includes('book')
  if (!wantsBookings) return null
  // Approved before this existed, or the create failed at approval time: make it now
  // rather than showing them an editor with nothing behind it.
  let slug = ''
  try { slug = await ensureProfileFromApplication(a.orgId, a.submission.data) } catch { /* fall through */ }
  if (!slug) return null
  const profile = await profileBySlug(a.orgId, slug)
  return profile ? { orgId: a.orgId, slug, profile } : null
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await resolve(params.token)
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ slug: r.slug, profile: r.profile })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await resolve(params.token)
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const patch = await req.json().catch(() => ({}))
    const ok = await savePhotographerSelf(r.orgId, r.slug, patch)
    if (!ok) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    return NextResponse.json({ ok: true, slug: r.slug })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
