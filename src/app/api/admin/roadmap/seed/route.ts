import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function getClient() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const NEW_ITEMS = [
  {
    title: 'Organization model — multi-tenant foundation',
    description: 'Add Organization entity to the data model. Each org has a name, logo, contact info, and owns multiple tournaments. Link existing users and tournaments to an org. This is the foundation for all multi-tenant features.',
    estimate: '4–6 hrs',
  },
  {
    title: 'Org settings page — payment instructions + branding',
    description: 'Settings page where an org admin configures: ACH bank details (routing/account), PayPal email, Zelle handle, check mailing address, org logo, and contact info. Registration forms pull from these settings to show inline payment instructions.',
    estimate: '3–4 hrs',
  },
  {
    title: 'Subscription tiers — Starter / Pro / Enterprise',
    description: 'Define subscription tiers with feature sets. Starter: 1 active tournament, manual payments only. Pro: unlimited tournaments, all payment integrations, email tools, AI assistant. Enterprise: white-label, multi-user orgs, API access. Store tier on Organization model.',
    estimate: '2–3 hrs',
  },
  {
    title: 'Feature gate system',
    description: 'Build a hasFeature(org, feature) utility that checks the org\'s subscription tier before allowing access to gated features. Gate: payment integrations (Pro+), AI assistant (Pro+), copy tournament (Pro+), email automation (Pro+). Show upgrade prompts for locked features.',
    estimate: '3–4 hrs',
  },
  {
    title: 'Stripe Connect — platform payment infrastructure',
    description: 'Set up GameDay Staff as a Stripe Connect platform. Orgs connect their Stripe accounts through the platform. All payments flow through the platform account, enabling automatic platform fee collection on every transaction.',
    estimate: '6–8 hrs',
  },
  {
    title: 'Subscription billing — orgs pay GameDay Staff',
    description: 'Use Stripe Billing to charge orgs for their subscription tier (monthly or annual). Build subscription management UI: upgrade, downgrade, cancel, view invoices. Handle webhook events for payment failures and cancellations.',
    estimate: '6–8 hrs',
  },
  {
    title: 'Transaction fee collection',
    description: 'Automatically collect a platform fee (e.g. 0.5–1%) on every payment processed through the platform via Stripe Connect application fees. Track fee revenue per org. Show transaction volume and fee revenue on platform owner dashboard.',
    estimate: '4–5 hrs',
  },
  {
    title: 'Multi-user orgs with roles',
    description: 'Allow orgs to invite multiple users with roles: Owner, Admin, Staff. Owners manage billing and org settings. Admins manage tournaments. Staff have limited access. Build invite flow, role management UI, and permission checks throughout the app.',
    estimate: '6–8 hrs',
  },
  {
    title: 'Org onboarding flow',
    description: 'Guided signup flow for new organizations: create account → pick subscription plan → enter org details → connect payment provider → create first tournament. Streamlines the path from signup to first tournament live.',
    estimate: '4–5 hrs',
  },
  {
    title: 'Platform owner dashboard',
    description: 'Super-admin dashboard visible only to GameDay Staff team. Shows: total orgs, MRR, transaction volume, fee revenue, recent signups, churn. Helps monitor platform health and growth.',
    estimate: '4–5 hrs',
  },
]

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const client = getClient()
  const maxRes = await client.execute('SELECT MAX(num) as maxNum FROM "RoadmapItem"')
  let num = ((maxRes.rows[0]?.maxNum as number) ?? 0)

  const inserted = []
  for (const item of NEW_ITEMS) {
    num++
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    await client.execute({
      sql: 'INSERT INTO "RoadmapItem" (id, num, title, description, status, notes, estimate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, num, item.title, item.description, 'todo', '', item.estimate, createdAt],
    })
    inserted.push({ num, title: item.title })
    // small delay to keep createdAt ordering correct
    await new Promise(r => setTimeout(r, 10))
  }

  return NextResponse.json({ ok: true, inserted })
}
