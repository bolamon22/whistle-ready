// Lightweight best-effort rate limiting for public write endpoints.
//
// This is an IN-MEMORY sliding window, scoped to ONE warm serverless
// instance -- it is NOT a distributed limiter (that would need Redis/Upstash,
// which this app doesn't have). Under Vercel's autoscaling a burst of
// traffic lands across many instances, each with its own counter, so this
// will not stop a determined/distributed attacker. What it DOES do cheaply,
// with zero new infra: cap the damage from a single misbehaving client
// (a stuck retry loop, a simple bot) hammering one endpoint from one place.
// Added in the Sep 2026 event-load-readiness pass -- see the project memory
// file `event-scale-readiness.md` for the full context.
//
// If real abuse shows up, the fix is Vercel's Firewall / WAF rate-limiting
// rules (dashboard-configured, no code) or an Upstash-backed limiter -- not
// scaling this one up.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Periodically forget old buckets so this Map doesn't grow forever on a
// long-lived warm instance.
const MAX_BUCKETS = 5000

export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * Returns true if the request should be ALLOWED, false if it should be
 * rejected as rate-limited. `key` should include both the route and the
 * caller (e.g. `join:${ip}`) so different endpoints don't share a budget.
 */
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear()
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (existing.count >= limit) return false
  existing.count += 1
  return true
}

/** Convenience: 429 JSON response with a Retry-After hint. */
export function rateLimitedResponse(windowMs: number) {
  return new Response(JSON.stringify({ error: 'Too many requests, please try again shortly.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.ceil(windowMs / 1000)),
    },
  })
}
