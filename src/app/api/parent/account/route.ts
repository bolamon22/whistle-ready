import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getSubmission } from '@/lib/formSubmissions'
import { readAccountToken, linkWaiver, loginOnEmail } from '@/lib/parentWaivers'
import { overLimit } from '@/lib/loginHint'
import { allowRequest, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// POST /api/parent/account { token, password }
// The end of the player waiver: "Save your info for next time". The token is the
// one the submit response handed the browser that filed the waiver
// (lib/parentWaivers); the email comes from it, never from the request.
//   - no login on that email: one is made (role parent) with this password;
//   - a login already on it: only with that login's password, never overwritten;
//   - signed in as that email already: no password needed.
// Then the waiver goes into the account. Eight tries per waiver per 15 minutes,
// so the box can't be used to guess an existing login's password.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const t = readAccountToken(String(body.token || ''))
  if (!t) return NextResponse.json({ error: 'This page has been open too long. Sign in or make an account from the sign-in page instead.' }, { status: 400 })
  if (!allowRequest(`parentacct:${clientIp(req)}`, 30, 15 * 60 * 1000) || await overLimit(`parentacct:try:${t.s}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many tries. Wait a few minutes, or reset the password from the sign-in page.' }, { status: 429 })
  }
  const sub = await getSubmission(t.o, t.s).catch(() => null)
  if (!sub || sub.formType !== 'player') return NextResponse.json({ error: 'We couldn’t find that waiver.' }, { status: 404 })
  const email = t.m

  const session = await getServerSession(authOptions)
  if (session?.user?.id && String(session.user.email || '').trim().toLowerCase() === email) {
    if (!(await linkWaiver(String(session.user.id), sub.id, t.o, 'signed in after filing'))) return NextResponse.json({ error: 'That didn’t save. Try again.' }, { status: 500 })
    return NextResponse.json({ ok: true, created: false, signedIn: true, email })
  }

  const password = String(body.password || '')
  if (!password) return NextResponse.json({ error: 'Enter a password.' }, { status: 400 })
  const login = await loginOnEmail(email)
  let userId = login?.id || ''
  let created = false
  if (login) {
    if (!login.password || !(await bcrypt.compare(password, login.password))) {
      return NextResponse.json({ existing: true, error: `${email} already has an account. Enter that account’s password to add this player to it.` }, { status: 409 })
    }
  } else {
    if (password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 })
    try {
      const user = await prisma.user.create({
        data: {
          name: String(sub.data?.parentName || '').trim().slice(0, 120) || email,
          email,
          password: await bcrypt.hash(password, 12),
          role: 'parent',
        },
      })
      userId = user.id
      created = true
    } catch {
      // Made a moment ago in another tab: that login's own password decides.
      return NextResponse.json({ existing: true, error: `${email} already has an account. Enter that account’s password to add this player to it.` }, { status: 409 })
    }
  }
  if (!(await linkWaiver(userId, sub.id, t.o, created ? 'after filing (new login)' : 'after filing (existing login)'))) {
    return NextResponse.json({ error: 'That didn’t save. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, created, email })
}
