import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { allowRequest, clientIp, rateLimitedResponse } from '@/lib/rateLimit'

// Public "want to run your tournaments on Whistle Ready?" inquiry.
// No account is created — this captures a sales lead and notifies us.
//
// Reliability: the lead is SAVED first (source of truth) and the email is
// best-effort on top, because our SendGrid wrapper fails silently. Set the
// INQUIRY_TO env var (in Vercel) to the address that should get notified;
// with it unset, leads still save but no email goes out.

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
function esc(s: string) {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

export async function POST(req: NextRequest) {
  // Best-effort per-instance rate limit (see src/lib/rateLimit.ts) -- this is a
  // fully public, no-account lead form.
  const RL_WINDOW_MS = 60_000
  if (!allowRequest(`inquiry:${clientIp(req)}`, 5, RL_WINDOW_MS)) return rateLimitedResponse(RL_WINDOW_MS)
  try {
    const body = await req.json().catch(() => ({}))
    const { hp_extra } = body

    // Honeypot tripped — pretend success, do nothing (matches the register flow).
    if (hp_extra) return NextResponse.json({ ok: true }, { status: 200 })

    const name = clip(body.name, 200)
    const org = clip(body.org, 200)
    const email = clip(body.email, 200)
    const phone = clip(body.phone, 60)
    const sport = clip(body.sport, 80)
    const size = clip(body.size, 120)
    const message = clip(body.message, 4000)

    if (!name || !org || !email) {
      return NextResponse.json({ error: 'Please add your name, organization, and email.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    // Save first — self-healing table so no migration is needed (mirrors the
    // app's guarded-DDL convention). Never let a save error fail the request.
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "Inquiry" (
           id TEXT PRIMARY KEY, name TEXT, org TEXT, email TEXT, phone TEXT,
           sport TEXT, size TEXT, message TEXT, createdAt TEXT
         )`
      )
      const id = (globalThis.crypto?.randomUUID?.() ?? `inq_${Date.now()}`)
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Inquiry" (id,name,org,email,phone,sport,size,message,createdAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        id, name, org, email, phone, sport, size, message, new Date().toISOString()
      )
    } catch (e) {
      console.error('[inquiry] save failed', e)
    }

    // Notify — best-effort. Only attempt if a real recipient is configured, so
    // we never leak a personal address into the public repo.
    const to = process.env.INQUIRY_TO
    if (to) {
      const html =
        `<h2 style="margin:0 0 12px">New tournament-hosting inquiry</h2>
         <table cellpadding="4" style="font-size:14px">
           <tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>
           <tr><td><strong>Organization</strong></td><td>${esc(org)}</td></tr>
           <tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr>
           <tr><td><strong>Phone</strong></td><td>${esc(phone) || '—'}</td></tr>
           <tr><td><strong>Sport</strong></td><td>${esc(sport) || '—'}</td></tr>
           <tr><td><strong>Size</strong></td><td>${esc(size) || '—'}</td></tr>
         </table>
         <p style="font-size:14px"><strong>Message:</strong><br>${esc(message).replace(/\n/g, '<br>') || '—'}</p>`
      await sendEmail({
        to,
        subject: `Tournament inquiry — ${org}`,
        html,
        replyTo: email,
      })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    console.error('[inquiry]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
