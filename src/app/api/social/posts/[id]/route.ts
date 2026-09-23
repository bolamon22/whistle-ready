import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

const TERMINAL = ['published', 'publishing']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const post = await prisma.scheduledPost.findFirst({ where: { id: params.id, orgId: gate.orgId } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as any
  const action = body.action as string | undefined

  if (action === 'approve') {
    // Publishing is the sensitive step — only a director/admin can move a post
    // out of draft, mirroring Bo's standing "I review everything before it goes
    // out" rule directly in the API, not just in a UI that could be skipped.
    const dGate = await requireDirector()
    if (!dGate.ok) return dGate.res
    if (post.status !== 'draft') return NextResponse.json({ error: `Cannot approve a post that is already ${post.status}` }, { status: 400 })
    const updated = await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'scheduled', approvedByUserId: dGate.userId, approvedAt: new Date() },
    })
    return NextResponse.json({ ok: true, post: updated })
  }

  if (action === 'cancel') {
    if (TERMINAL.includes(post.status) || post.status === 'published') {
      return NextResponse.json({ error: 'Cannot cancel a post that already published' }, { status: 400 })
    }
    const updated = await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'canceled' } })
    return NextResponse.json({ ok: true, post: updated })
  }

  // Plain field edit (caption / mediaUrls / scheduledFor) — only while the post
  // hasn't started publishing. Editing a 'scheduled' post is fine (the cron
  // hasn't picked it up yet); it does NOT re-require approval, since nothing
  // about who approved it changed — only the content.
  if (TERMINAL.includes(post.status) || post.status === 'published') {
    return NextResponse.json({ error: `Cannot edit a post that is already ${post.status}` }, { status: 400 })
  }
  const data: any = {}
  if (typeof body.caption === 'string') data.caption = body.caption
  if (Array.isArray(body.mediaUrls)) data.mediaUrls = JSON.stringify(body.mediaUrls)
  if (body.scheduledFor) data.scheduledFor = new Date(body.scheduledFor)
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const updated = await prisma.scheduledPost.update({ where: { id: post.id }, data })
  return NextResponse.json({ ok: true, post: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const post = await prisma.scheduledPost.findFirst({ where: { id: params.id, orgId: gate.orgId } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.status === 'published' || post.status === 'publishing') {
    return NextResponse.json({ error: 'Cannot delete a post that already published — cancel isn\'t available after the fact on Instagram/Facebook either' }, { status: 400 })
  }
  await prisma.scheduledPost.delete({ where: { id: post.id } })
  return NextResponse.json({ ok: true })
}
