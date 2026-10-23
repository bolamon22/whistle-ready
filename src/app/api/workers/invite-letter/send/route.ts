import { NextResponse } from 'next/server'
import { joinCodeFor } from '@/lib/joinCode'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'
import { sendEmail, orgSender, officeCcFor } from '@/lib/email'
import { inviteLetterFor, mergeLetter, letterBodyHtml, escapeHtml, type InviteAudience } from '@/lib/inviteLetter'
import { canSeeContacts } from '@/lib/roleScope'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

// POST — email the RECRUIT letter (public /join link) straight from the Invite letter
// panel to addresses that aren't in the pool yet. Pool members go through
// /api/workers/onboard instead (personal claim links); the panel routes them there.
// Accepts subject/body overrides so what's on screen is exactly what sends.
//
// test: true (Bo, Oct 22 2026, for James Vacco before his first invite run) emails the
// on-screen letter to the signed-in person only, with no office copy. A staff-letter
// test carries a sample button link: it creates no login and uses up no invite.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  // Sends as the org: the people who run its staff only, not a ref with a login.
  if (gate.role !== 'admin' && !canSeeContacts(gate.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  let body: { emails?: unknown; subject?: unknown; body?: unknown; audience?: unknown; viewOrgId?: unknown; test?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const test = body.test === true
  const me = String(gate.session?.user?.email || '').trim().toLowerCase()
  if (test && !me.includes('@')) return NextResponse.json({ error: 'Your login has no email address' }, { status: 400 })

  const orgId = gate.role === 'admin' ? String(body.viewOrgId || gate.orgId || '') : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const emails = test ? [me] : (Array.isArray(body.emails) ? body.emails : [])
    .map(e => String(e).trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (!emails.length) return NextResponse.json({ error: 'No valid email addresses' }, { status: 400 })
  if (emails.length > 10) return NextResponse.json({ error: 'Max 10 addresses per send' }, { status: 400 })

  // The org's live join link (lib/joinCode): its unpaid one for the volunteers and
  // refs-in-training letter, else the recruiting one.
  const code = await joinCodeFor(orgId, body.audience === 'unpaid' ? 'unpaid' : 'staff')
  // The org is looked up before the link, not after: {link} in the letter has to
  // point at the org's domain, same rule as /api/workers/recruit-link.
  const org = await orgById(orgId)
  const joinUrl = `${orgBaseUrl(org?.slug, APP_URL)}/join/${code}`
  const orgLabel = org?.name || 'Whistle Ready'
  // The fallback letter has to match the one on screen. This was pinned to 'recruit',
  // which was harmless while recruit was the only copy-and-send audience -- with the
  // assigner letter added, a send whose subject or body arrived empty would have gone
  // out as the wrong letter entirely (Sep 29 2026).
  const audience: InviteAudience =
    body.audience === 'assigner' ? 'assigner' : body.audience === 'staff' ? 'staff' : body.audience === 'unpaid' ? 'unpaid' : 'recruit'
  const saved = await inviteLetterFor(orgId, audience)
  const subjectTpl = String(body.subject ?? '').trim().slice(0, 200) || saved.subject
  const bodyTpl = String(body.body ?? '').trim().slice(0, 4000) || saved.body

  // A staff-letter test: the letter as /api/workers/onboard sends it, addressed to you.
  const staffTest = test && audience === 'staff'
  const myName = String(gate.session?.user?.name || '').trim()
  const sampleUrl = `${orgBaseUrl(org?.slug, APP_URL)}/invite/sample`
  const vals = staffTest
    ? { firstName: myName.split(/\s+/)[0] || 'there', name: myName, org: orgLabel, link: sampleUrl }
    : { firstName: 'there', name: '', org: orgLabel, link: joinUrl }
  const subject = (test ? '[Test] ' : '') + mergeLetter(subjectTpl, vals)
  const testNote = test
    ? `<p style="background: #f1f5f9; color: #475569; font-size: 13px; padding: 10px 12px; border-radius: 8px; margin: 0 0 16px;">Test copy, sent only to you. ${staffTest ? 'In each real invite this button opens that person’s own page to set a password; here it goes nowhere.' : 'The button is your live signup link.'}</p>`
    : ''
  const html = staffTest ? `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      ${testNote}
      <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">${escapeHtml(subject)}</h2>
      ${letterBodyHtml(mergeLetter(bodyTpl, vals))}
      <a href="${sampleUrl}"
        style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
               font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
        Create my login &rarr;
      </a>
    </div>
  ` : `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      ${testNote}
      <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">${escapeHtml(subject)}</h2>
      ${letterBodyHtml(mergeLetter(bodyTpl, vals))}
      <a href="${joinUrl}"
        style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
               font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
        Join the staff &rarr;
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
        Takes about two minutes${audience === 'unpaid' ? ', with no payment details to fill in' : ' — pick your role, check the events you can work, and you\'re in'}.
      </p>
    </div>
  `
  const results: { email: string; status: string }[] = []
  for (const to of emails) {
    await sendEmail({ ...orgSender(org), to, ...(test ? {} : { cc: officeCcFor(org) }), subject, html }) // the org's own office copy
    results.push({ email: to, status: 'sent' })
  }
  return NextResponse.json({ ok: true, results, ...(test ? { to: me } : {}) })
}
