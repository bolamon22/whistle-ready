import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

// Queue + calendar data for the social scheduler. A post always starts as a
// 'draft' here — only PATCH .../posts/[id] with action:'approve' (director/
// admin only) moves it to 'scheduled', which is what the publish cron acts on.
// That two-step is deliberate: Bo reviews everything before it can go out.
export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ posts: [] })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const where: any = { orgId: gate.orgId }
  if (status) where.status = status
  if (from || to) where.scheduledFor = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }

  const posts = await prisma.scheduledPost.findMany({
    where, orderBy: { scheduledFor: 'asc' },
    include: { socialAccount: { select: { id: true, platform: true, label: true, status: true } } },
  })
  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as any
  const { socialAccountId, caption, mediaUrls, scheduledFor } = body
  if (!socialAccountId || !scheduledFor) {
    return NextResponse.json({ error: 'socialAccountId and scheduledFor are required' }, { status: 400 })
  }
  const account = await prisma.socialAccount.findFirst({ where: { id: socialAccountId, orgId: gate.orgId } })
  if (!account) return NextResponse.json({ error: 'Unknown social account' }, { status: 404 })

  const post = await prisma.scheduledPost.create({
    data: {
      orgId: gate.orgId, socialAccountId, caption: caption || '',
      mediaUrls: JSON.stringify(Array.isArray(mediaUrls) ? mediaUrls : []),
      scheduledFor: new Date(scheduledFor), status: 'draft', createdByUserId: gate.userId,
    },
  })
  return NextResponse.json({ ok: true, post })
}
