import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { sendEmail, OFFICE_CC } from '@/lib/email'
import { normalizeUs, sendSms } from '@/lib/sms'
import { setSmsConsent } from '@/lib/smsConsentDb'

export const dynamic = 'force-dynamic'

// Where replies land. Twilio POSTs here for every inbound message on our number.
//
// Three jobs, in order of how much trouble each saves:
//
// 1. STOP. Twilio blocks the number at its end automatically, but OUR records
//    would still say the person agreed, so every later audit and every "who can
//    we text" count would be wrong. We clear consent on our side too.
// 2. HELP. Carriers require a useful answer. Ours names the business and points
//    at the public /sms page.
// 3. Everything else is a human replying to a staff message, which is the whole
//    point of two-way (Bo, Oct 13 2026: "wondering if people are ever going to
//    be able to reply to the text message and we actually get them"). Those get
//    emailed to the office so they reach somebody instead of vanishing the way
//    Lacrossewear's inbound messages have been.
//
// HELP replies go out through sendSms() directly rather than the consent-gated
// fan-out: the person just texted us, and a carrier requires us to answer.

const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout'])
const HELP_WORDS = new Set(['help', 'info'])

/** Empty TwiML — we have already replied (or chosen not to) via the REST API. */
const noReply = () =>
  new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200, headers: { 'Content-Type': 'text/xml' },
  })

/**
 * Twilio signs every webhook. Without this check anyone who learns the URL can
 * post a fake STOP and silently unsubscribe a staff member, or forge a reply
 * into the office inbox.
 *
 * The signature covers the exact public URL Twilio called plus the POST params
 * sorted by key, so the URL has to be rebuilt from the forwarded headers —
 * req.url is the internal one behind Vercel's proxy.
 */
function signatureValid(req: NextRequest, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  const given = req.headers.get('x-twilio-signature') || ''
  if (!token || !given) return false

  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const u = new URL(req.url)
  const url = `${proto}://${host}${u.pathname}${u.search}`

  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)
  const mine = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(given))
  } catch { return false }  // different lengths — not a match
}

/** The staff member this number belongs to. Phone formats in Worker are all
 *  over the place ((954) 555-1212, 9545551212, +19545551212), so compare on the
 *  normalized form rather than trying to out-clever it in SQL. */
async function workerByPhone(e164: string): Promise<{ id: string; name: string } | null> {
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, name, phone FROM "Worker" WHERE phone IS NOT NULL AND phone != ''`)
    for (const r of rows || []) {
      if (normalizeUs(String(r.phone || '')) === e164) {
        return { id: String(r.id), name: String(r.name || 'Staff') }
      }
    }
  } catch { /* table unreachable — fall through to the office email */ }
  return null
}

export async function POST(req: NextRequest) {
  let params: Record<string, string> = {}
  try {
    const form = await req.formData()
    form.forEach((v, k) => { params[k] = typeof v === 'string' ? v : '' })
  } catch {
    return noReply()
  }

  if (!signatureValid(req, params)) {
    console.warn('[sms inbound] bad or missing Twilio signature — ignoring')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const from = normalizeUs(params.From || '')
  const body = String(params.Body || '').trim()
  const word = body.toLowerCase().replace(/[^a-z]/g, '')
  if (!from) return noReply()

  const who = await workerByPhone(from)

  // 1. STOP — clear our own record so we stop counting them as reachable.
  if (STOP_WORDS.has(word)) {
    if (who) await setSmsConsent(who.id, false, 'profile')
    console.log('[sms inbound] STOP from', from, who ? `(${who.name})` : '(unknown number)')
    return noReply()  // Twilio sends the standard opt-out confirmation itself
  }

  // 2. HELP — name the business and point somewhere real.
  if (HELP_WORDS.has(word)) {
    await sendSms({
      to: from,
      // Kept inside GSM-7 and under 160 chars so HELP is ONE segment: an em
      // dash alone forces the whole reply to UCS-2, which bills three.
      body: 'Sunshine Events Group game-day alerts for staff and coaches. Details: https://sunshineeventsgroup.com/sms or call (954) 608-5886. Reply STOP to opt out.',
    })
    return noReply()
  }

  // 3. A real reply. Get it in front of a person.
  const label = who ? `${who.name} (${from})` : from
  await sendEmail({
    to: OFFICE_CC,
    subject: `Text reply from ${label}`,
    html: `<p style="font-size:15px"><strong>${label}</strong> replied by text:</p>`
      + `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #0f766e;background:#f8fafc;font-size:15px;white-space:pre-wrap">`
      + `${body.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))}</blockquote>`
      + `<p style="font-size:13px;color:#64748b">Reply from your phone to answer them directly.</p>`,
    text: `${label} replied by text:\n\n${body}\n\nReply from your phone to answer them directly.`,
  })

  return noReply()
}
