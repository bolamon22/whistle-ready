import crypto from 'crypto'

// The QuickBooks login's OAuth `state`: who started it, signed, good for 30 minutes.
//
// It used to be plain base64 JSON with a userId in it, so anyone could make one:
// a callback carrying a made-up state and their own QuickBooks code would have
// stored their company as someone else's QuickBooks connection (OAuth CSRF), and
// the sync would then have looked up that company. Signing it with the app's
// secret means only a login Whistle Ready started can finish, for the person who
// started it (the callback also checks it's the same signed-in user).
//
// Server only.

const secret = () => process.env.NEXTAUTH_SECRET || ''
const TTL_MS = 30 * 60_000

const mac = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url')

export function signState(userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, t: now, n: crypto.randomBytes(9).toString('base64url') })).toString('base64url')
  return `${body}.${mac(body)}`
}

/** The userId a state was signed for, or null if it's forged, altered or stale. */
export function readState(state: string | null | undefined, now = Date.now()): string | null {
  if (!secret()) return null
  const [body, sig, extra] = String(state || '').split('.')
  if (!body || !sig || extra !== undefined) return null
  const a = Buffer.from(sig), b = Buffer.from(mac(body))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const j = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const t = Number(j?.t)
    if (!j?.u || !Number.isFinite(t) || now - t > TTL_MS || t - now > 60_000) return null
    return String(j.u)
  } catch { return null }
}
