// Single place every outbound text goes through — the SMS twin of lib/email.ts.
//
// Routes must NEVER call Twilio directly; they call sendSms(). One seam keeps
// the provider swappable, keeps credentials in one file, and — the part that
// actually matters — makes it impossible to text somebody who never agreed,
// because the consent check lives in here rather than in each caller.
//
// Env (all absent = no-op, logged, never throws):
//   TWILIO_ACCOUNT_SID          — the account or SUBACCOUNT sid the number lives on
//   TWILIO_AUTH_TOKEN           — that account's auth token
//   TWILIO_MESSAGING_SERVICE_SID — preferred sender (a Messaging Service)
//   TWILIO_FROM                 — fallback sender, E.164, when there's no service sid
//
// Deliberately uses fetch against Twilio's REST API rather than the `twilio`
// npm package: no new dependency to install, and nothing to keep in step at
// build time. The request shape here is stable and tiny.
//
// Numbers live on the SEG subaccount, so TWILIO_ACCOUNT_SID is that subaccount's
// sid, not the parent's. A subaccount authenticates with its own token.

import { smsConsentFor } from '@/lib/smsConsentDb'

const API = 'https://api.twilio.com/2010-04-01'

export type SendSmsArgs = {
  /** E.164 (+15551234567) or anything normalizeUs() can repair. */
  to: string
  body: string
}

export type SendSmsResult = { ok: boolean; sid?: string; error?: string }

/** True when SMS is configured. Use to gate optional sends. */
export function smsEnabled(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM))
}

/**
 * US 10-digit or 11-digit numbers to E.164. Anything already starting with +
 * is left alone. Returns '' when it cannot be made into a plausible number,
 * and callers treat '' as "don't send" rather than guessing.
 */
export function normalizeUs(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : ''
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return ''
}

/**
 * Send one text. Never throws — a failed text must not fail the request that
 * triggered it, exactly like sendEmail.
 *
 * This does NOT check consent; it is the raw send. Use sendSmsToWorkers() for
 * anything aimed at staff, which is almost everything.
 */
export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    console.warn('[sms] TWILIO_ACCOUNT_SID/AUTH_TOKEN not set — skipping send')
    return { ok: false, error: 'sms not configured' }
  }
  const to = normalizeUs(args.to)
  if (!to) return { ok: false, error: 'unusable phone number' }
  const body = String(args.body || '').trim()
  if (!body) return { ok: false, error: 'empty message' }

  const form = new URLSearchParams({ To: to, Body: body })
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (service) form.set('MessagingServiceSid', service)
  else form.set('From', String(process.env.TWILIO_FROM || ''))

  try {
    const res = await fetch(`${API}/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: form.toString(),
    })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) {
      // Twilio's own message is far more useful than the status code — a
      // verification or carrier block comes back here with a code like 30032.
      const msg = String((data as { message?: string }).message || `HTTP ${res.status}`)
      console.warn('[sms] send failed:', msg)
      return { ok: false, error: msg }
    }
    return { ok: true, sid: String((data as { sid?: string }).sid || '') }
  } catch (e) {
    console.warn('[sms] send threw:', e)
    return { ok: false, error: 'send failed' }
  }
}

export type WorkerTarget = { id: string; name?: string; phone?: string | null }

export type FanOutResult = {
  sent: number
  /** Everyone skipped, and why — surfaced so a caller can fall back to email. */
  skipped: { id: string; name: string; reason: 'no consent' | 'no phone' | 'bad number' | 'send failed' }[]
}

/**
 * Text a set of staff. THE consent gate: anyone without a recorded yes is
 * skipped, and absence of a record counts as no. There is no override — a
 * caller that wants to reach everyone should fall back to email for the
 * skipped list, which is why they come back named rather than counted.
 */
export async function sendSmsToWorkers(workers: WorkerTarget[], body: string): Promise<FanOutResult> {
  const out: FanOutResult = { sent: 0, skipped: [] }
  const list = (workers || []).filter(w => w && w.id)
  if (!list.length) return out

  const consent = await smsConsentFor(list.map(w => w.id))

  for (const w of list) {
    const name = w.name || w.id
    if (!consent.get(w.id)) { out.skipped.push({ id: w.id, name, reason: 'no consent' }); continue }
    const raw = String(w.phone || '').trim()
    if (!raw) { out.skipped.push({ id: w.id, name, reason: 'no phone' }); continue }
    if (!normalizeUs(raw)) { out.skipped.push({ id: w.id, name, reason: 'bad number' }); continue }
    const r = await sendSms({ to: raw, body: withStopLine(body) })
    if (r.ok) out.sent += 1
    else out.skipped.push({ id: w.id, name, reason: 'send failed' })
  }
  return out
}

/** Every message we send has to say how to stop. Append once, never twice.
 *  sendSmsToWorkers() applies this for you — callers cannot forget it. */
export function withStopLine(body: string): string {
  const t = String(body || '').trim()
  return /reply stop/i.test(t) ? t : `${t}\n\nReply STOP to opt out.`
}
