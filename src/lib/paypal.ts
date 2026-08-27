// PayPal REST (Orders v2) helper. Live by default; set PAYPAL_ENV=sandbox for testing.
// Credentials come from a PayPal Business app (developer.paypal.com → Apps & Credentials).
// PayPal terms cap any handling fee at what non-PayPal methods are charged, so the
// pass-through fee matches the 3% card fee (never higher).

export const PAYPAL_BASE =
  process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

let cached: { token: string; exp: number } | null = null

export async function paypalAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.exp) return cached.token
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(data?.error_description || 'PayPal authentication failed — check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET')
  }
  cached = { token: data.access_token, exp: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 }
  return data.access_token
}
