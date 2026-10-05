import { NextRequest, NextResponse } from 'next/server'
import { orgsWithQboSync, syncPending } from '@/lib/qboSync'

// Vercel cron (vercel.json, every 15 minutes): for each org with the QuickBooks
// sync turned on, send new registrations, changed invoices and payments that
// QuickBooks hasn't had (lib/qboSync). Set CRON_SECRET in Vercel and the route
// requires it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  const out: { orgId: string; ran: number; problem?: string; errors: number }[] = []
  for (const orgId of await orgsWithQboSync()) {
    const left = 50_000 - (Date.now() - started)
    if (left < 5_000) break
    try {
      const r = await syncPending(orgId, { budgetMs: Math.min(40_000, left - 5_000) })
      out.push({ orgId, ran: r.ran, problem: r.problem, errors: r.results.filter(x => x.status === 'error').length })
    } catch (e) {
      out.push({ orgId, ran: 0, problem: e instanceof Error ? e.message : String(e), errors: 0 })
    }
  }
  return NextResponse.json({ ok: true, orgs: out })
}
