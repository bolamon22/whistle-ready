// Apple push (APNs) for the Whistle Ready iOS app. Same contract as web push in
// lib/push.ts: never throws, reports which tokens Apple says are dead so the
// caller can prune them.
//
// Inside the app a phone's "subscription" is stored like a browser's, with the
// endpoint set to `apns:<device token>` (see APNS_PREFIX). sendToSubscriptions()
// in lib/push.ts splits those out and hands them here, so every alert that
// already reaches a browser (follows, coach alerts, staff alerts, org alerts)
// reaches the app with no change at the call sites.
//
// Credentials come from Vercel env vars: APNS_KEY (the .p8 text), APNS_KEY_ID,
// APNS_TEAM_ID, APNS_BUNDLE_ID. Missing any of them = every APNs send fails
// quietly and is logged; browsers are unaffected.
import http2 from 'node:http2'
import { createPrivateKey, sign, type KeyObject } from 'node:crypto'

export const APNS_PREFIX = 'apns:'
export const isApnsEndpoint = (endpoint: string) => typeof endpoint === 'string' && endpoint.startsWith(APNS_PREFIX)
/** An APNs device token: hex, 64 chars on today's devices; allow some slack. */
export const isApnsToken = (t: string) => /^[0-9a-fA-F]{32,200}$/.test(t)

// TestFlight and App Store builds talk to production APNs.
const HOST = 'https://api.push.apple.com'

type Creds = { key: KeyObject; keyId: string; teamId: string; topic: string }
let credsCache: Creds | null | undefined
let warned = false

/** The .p8 pasted into a single-line Vercel field can lose its line breaks or
 *  carry literal "\n"s. Rebuild a clean PEM from the base64 body either way. */
function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '')
  const lines = body.match(/.{1,64}/g) || []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}

function creds(): Creds | null {
  if (credsCache !== undefined) return credsCache
  const raw = process.env.APNS_KEY || ''
  const keyId = (process.env.APNS_KEY_ID || '').trim()
  const teamId = (process.env.APNS_TEAM_ID || '').trim()
  const topic = (process.env.APNS_BUNDLE_ID || '').trim()
  if (!raw || !keyId || !teamId || !topic) {
    if (!warned) { warned = true; console.error('[apns] APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID not all set; app pushes are off') }
    credsCache = null
    return null
  }
  try {
    credsCache = { key: createPrivateKey(normalizePem(raw)), keyId, teamId, topic }
  } catch (e) {
    console.error('[apns] APNS_KEY could not be read as a private key:', (e as Error)?.message)
    credsCache = null
  }
  return credsCache
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

// Apple wants the provider token refreshed at most every 20 minutes and no
// older than an hour; reuse one for 40 minutes.
let jwtCache: { token: string; at: number } | null = null
function providerToken(c: Creds): string {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache && now - jwtCache.at < 40 * 60) return jwtCache.token
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }))
  const claims = b64url(JSON.stringify({ iss: c.teamId, iat: now }))
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key: c.key, dsaEncoding: 'ieee-p1363' })
  const token = `${head}.${claims}.${b64url(sig)}`
  jwtCache = { token, at: now }
  return token
}

export type ApnsPayload = { title: string; body: string; url?: string; tag?: string }

/** Apple's answers that mean the token will never work again. */
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken'])

/**
 * Send one alert to each token. `endpoints` are the stored `apns:<token>`
 * strings; `gone` comes back in the same form so callers prune exactly what
 * they stored.
 */
export async function sendApns(endpoints: string[], payload: ApnsPayload): Promise<{ sent: number; failed: number; gone: string[] }> {
  const out = { sent: 0, failed: 0, gone: [] as string[] }
  const list = endpoints.filter(isApnsEndpoint)
  if (!list.length) return out
  const c = creds()
  if (!c) { out.failed = list.length; return out }

  let session: http2.ClientHttp2Session | null = null
  try {
    const bearer = providerToken(c)
    session = http2.connect(HOST)
    session.on('error', (e) => console.error('[apns] session error:', e?.message))
    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        ...(payload.tag ? { 'thread-id': payload.tag.slice(0, 64) } : {}),
      },
      url: payload.url || '/',
    })
    await Promise.all(list.map((endpoint) => new Promise<void>((resolve) => {
      const token = endpoint.slice(APNS_PREFIX.length)
      if (!isApnsToken(token)) { out.failed++; out.gone.push(endpoint); return resolve() }
      let status = 0, data = '', done = false
      const finish = () => { if (!done) { done = true; resolve() } }
      const headers: http2.OutgoingHttpHeaders = {
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${bearer}`,
        'apns-topic': c.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      }
      // A newer alert with the same tag replaces the older one on the phone,
      // like the web-push tag does in public/sw.js.
      if (payload.tag) headers['apns-collapse-id'] = payload.tag.slice(0, 64)
      const req = session!.request(headers)
      req.setTimeout(10_000, () => req.close())
      req.on('response', (h) => { status = Number(h[':status']) || 0 })
      req.setEncoding('utf8')
      req.on('data', (chunk) => { data += chunk })
      req.on('error', () => { if (!done) out.failed++; finish() })
      req.on('close', () => {
        if (done) return
        if (status === 200) out.sent++
        else {
          out.failed++
          let reason = ''
          try { reason = JSON.parse(data || '{}').reason || '' } catch {}
          if (status === 410 || DEAD_REASONS.has(reason)) out.gone.push(endpoint)
          else console.error('[apns] send failed', status || 'no response', reason)
        }
        finish()
      })
      req.end(body)
    })))
  } catch (e) {
    console.error('[apns] sendApns failed (non-blocking):', (e as Error)?.message)
  } finally {
    try { session?.close() } catch {}
  }
  return out
}
