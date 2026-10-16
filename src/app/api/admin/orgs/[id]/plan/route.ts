import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readOrgPlan, writeOrgPlan } from '@/lib/orgPlanStore'
import { FEATURE_GROUPS, PLANS, isPlanKey, normalizePlan } from '@/lib/orgPlans'

// Admin only: an organization's plan and its feature switches (lib/orgPlans), on
// Admin → Organizations → the organization.
//
// GET -> { plan, features, by, at, plans, groups }
// PUT { plan, features? } -> the saved plan. Features left out take the plan's own
//     setting. People already signed in get the change within a minute (lib/auth).

async function isAdmin() {
  const s = await getServerSession(authOptions)
  return (s?.user as { role?: string } | undefined)?.role === 'admin' ? s : null
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ ...(await readOrgPlan(params.id)), plans: Object.values(PLANS), groups: FEATURE_GROUPS })
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const s = await isAdmin()
  if (!s) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  if (!isPlanKey(b.plan)) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 })
  const saved = await writeOrgPlan(params.id, normalizePlan({ plan: b.plan, features: b.features }), String(s.user?.email || ''))
  return NextResponse.json(saved)
}
