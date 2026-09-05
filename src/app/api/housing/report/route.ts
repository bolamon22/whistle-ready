import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { housingSettings, sendHousingReport } from '@/lib/housing'

// POST = Send report now (org side). GET = the Vercel cron (vercel.json fires it
// Mon + Thu 12:00 UTC ≈ 8am ET): every org with a housing contact gets its report
// per its cadence — weekly orgs only on Monday, 'manual' never. Set CRON_SECRET in
// Vercel and the route requires it; without the env var it still runs but is
// callable by anyone who finds the path (worst case: the org's own contact gets
// an extra report).
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* optional */ }
  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })
  const res = await sendHousingReport(orgId)
  return NextResponse.json(res, { status: res.ok ? 200 : 400 })
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const day = new Date().getUTCDay() // cron fires Mon(1) + Thu(4)
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'housing:' } } })
  const results: { orgId: string; sent: boolean; reason?: string }[] = []
  for (const row of rows) {
    const orgId = row.key.slice('housing:'.length)
    if (!orgId || orgId.includes(':')) continue
    const s = await housingSettings(orgId)
    if (!s.contactEmail) { results.push({ orgId, sent: false, reason: 'no contact' }); continue }
    if (s.cadence === 'manual') { results.push({ orgId, sent: false, reason: 'manual' }); continue }
    if (s.cadence === 'weekly' && day !== 1) { results.push({ orgId, sent: false, reason: 'weekly, not Monday' }); continue }
    // Idempotency: a rerun inside 20h doesn't double-send
    if (s.lastSentAt && Date.now() - new Date(s.lastSentAt).getTime() < 20 * 3600 * 1000) {
      results.push({ orgId, sent: false, reason: 'sent recently' }); continue
    }
    const r = await sendHousingReport(orgId)
    results.push({ orgId, sent: r.ok, reason: r.error })
  }
  return NextResponse.json({ ok: true, day, results })
}
