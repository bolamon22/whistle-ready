import { NextRequest, NextResponse } from 'next/server'
import { allowRequest, clientIp, rateLimitedResponse } from '@/lib/rateLimit'

// Receives best-effort client-side error reports from ClientErrorReporter and
// logs them so they land in Vercel's Runtime Logs alongside server errors --
// the app previously had zero visibility into front-end crashes. Sep 2026
// event-load-readiness pass. Deliberately does NOT persist to the database:
// this is meant to be cheap and disposable, not a full error tracker.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Generous per-instance limit -- this exists to catch a real problem
  // during the event, not to be a target itself.
  const RL_WINDOW_MS = 60_000
  if (!allowRequest(`client-error:${clientIp(req)}`, 60, RL_WINDOW_MS)) return rateLimitedResponse(RL_WINDOW_MS)

  try {
    const body = await req.json().catch(() => ({}))
    const { kind, message, stack, source, line, url } = body || {}
    console.error(
      `[client-error] ${String(kind || 'error')}: ${String(message || '').slice(0, 500)}`,
      { url: String(url || '').slice(0, 300), source, line, stack: String(stack || '').slice(0, 1000) }
    )
  } catch { /* never fail on a bad payload */ }

  return NextResponse.json({ ok: true })
}
