import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { sendEmail, orgSender } from '@/lib/email'
import { inviteLetterFor, mergeLetter, letterBodyHtml, escapeHtml } from '@/lib/inviteLetter'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

// POST — email the RECRUIT letter (public /join link) straight from the Invite letter
// panel to addresses that aren't in the pool yet. Pool members go through
// /api/workers/onboard instead (personal claim links); the panel routes them there.
// Accepts subject/body overrides so what's on screen is exactly what sends.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { emails?: unknown; subject?: unknown; body?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const emails = (Array.isArray(body.emails) ? body.emails : [])
    .map(e => String(e).trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (!emails.length) return NextResponse.json({ error: 'No valid email addresses' }, { status: 400 })
  if (emails.length > 10) return NextResponse.json({ error: 'Max 10 addresses per send' }, { status: 400 })

  // The org's live join link — same minting rules as /api/workers/recruit-link, so
  // whichever route runs first creates the code and the other reuses it.
  const key = `joinCode:${orgId}`
  const existing = await prisma.appSetting.findUnique({ where: { key } })
  let code = existing?.value || ''
  if (!code || code.length > 16) {
    code = crypto.randomBytes(6).toString('base64url')
    await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } })
  }
  const mapKey = `joinCodeMap:${code}`
  await prisma.appSetting.upsert({ where: { key: mapKey }, update: { value: orgId }, create: { key: mapKey, value: orgId } })
  const joinUrl = `${APP_URL}/join/${code}`

  const org = await orgById(orgId)
  const orgLabel = org?.name || 'Whistle Ready'
  const saved = await inviteLetterFor(orgId, 'recruit')
  const subjectTpl = String(body.subject ?? '').trim().slice(0, 200) || saved.subject
  const bodyTpl = String(body.body ?? '').trim().slice(0, 4000) || saved.body

  const vals = { firstName: 'there', name: '', org: orgLabel, link: joinUrl }
  const subject = mergeLetter(subjectTpl, vals)
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">${escapeHtml(subject)}</h2>
      ${letterBodyHtml(mergeLetter(bodyTpl, vals))}
      <a href="${joinUrl}"
        style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
               font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
        Join the staff &rarr;
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
        Takes about two minutes — pick your role, check the events you can work, and you're in.
      </p>
    </div>
  `
  const results: { email: string; status: string }[] = []
  for (const to of emails) {
    await sendEmail({ ...orgSender(org), to, subject, html })
    results.push({ email: to, status: 'sent' })
  }
  return NextResponse.json({ ok: true, results })
}
