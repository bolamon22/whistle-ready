import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { orgLogoUrl } from '@/lib/org'
import { membershipsOf } from '@/lib/orgMembers'
import { orgPlans } from '@/lib/orgPlanStore'
import { PLANS } from '@/lib/orgPlans'

export const dynamic = 'force-dynamic'

// The organizations the signed-in login works in, for the switcher in the top bar
// (lib/orgMembers). Switching itself is useSession().update({ activeOrgId }), which
// lib/auth checks against these same memberships.
//
// GET -> { active, orgs: [{ orgId, name, logoUrl, role, home, plan, planKey }] }
//        orgId null = a club or family login's own portal (no organization).
//        plan = the plan's short name ('Assigner'), planKey its key ('assigner').
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; orgId?: string | null } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (user.role === 'admin') return NextResponse.json({ active: user.orgId ?? null, orgs: [] })
  const ms = await membershipsOf(user.id)
  const ids = ms.map(m => m.orgId).filter((o): o is string => !!o)
  const rows = ids.length
    ? await prisma.$queryRawUnsafe<{ id: string; name: string | null; logoUrl: string | null }[]>(
      `SELECT id, name, logoUrl FROM "Organization" WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids).catch(() => [])
    : []
  const org = new Map(rows.map(r => [String(r.id), r]))
  const [plans, logos] = await Promise.all([
    orgPlans(ids),
    Promise.all(ids.map(id => orgLogoUrl(id, org.get(id)?.logoUrl).catch(() => ''))),
  ])
  const logo = new Map(ids.map((id, i) => [id, logos[i]]))
  return NextResponse.json({
    active: user.orgId ?? null,
    orgs: ms.map(m => ({
      orgId: m.orgId, role: m.role, home: m.home,
      name: m.orgId ? String(org.get(m.orgId)?.name || 'Organization') : '',
      logoUrl: m.orgId ? logo.get(m.orgId) || '' : '',
      plan: m.orgId ? PLANS[plans[m.orgId]?.plan || 'tournament'].short : '',
      planKey: m.orgId ? plans[m.orgId]?.plan || 'tournament' : '',
    })),
  })
}
