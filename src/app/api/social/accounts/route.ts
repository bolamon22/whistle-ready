import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { socialEnabled } from '@/lib/social'

// Connected Instagram/Facebook accounts for the org — what the scheduler page
// lists in its "accounts" panel and offers in the compose picker. Tokens are
// never returned here; only the shape the UI needs.
export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ configured: socialEnabled(), accounts: [] })

  const accounts = await prisma.socialAccount.findMany({
    where: { orgId: gate.orgId, status: { not: 'disconnected' } },
    orderBy: [{ platform: 'asc' }, { label: 'asc' }],
    select: { id: true, platform: true, label: true, status: true, lastError: true, tokenExpiresAt: true, createdAt: true },
  })
  return NextResponse.json({ configured: socialEnabled(), accounts })
}

// Disconnect = soft. The row stays so the account's published posts keep their
// history and insights; it just stops appearing in pickers and the cron skips
// it. Reconnecting through Meta re-activates the same row (matched on
// externalId in completeConnect), so nothing is duplicated.
export async function DELETE(req: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const acct = await prisma.socialAccount.findFirst({ where: { id, orgId: gate.orgId } })
  if (!acct) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.socialAccount.update({ where: { id }, data: { status: 'disconnected' } })
  // Anything still waiting to go out on that account can't publish now — park it
  // back in draft so it shows up in "needs approval" instead of silently failing.
  await prisma.scheduledPost.updateMany({ where: { socialAccountId: id, status: 'scheduled' }, data: { status: 'draft' } })
  return NextResponse.json({ ok: true })
}
