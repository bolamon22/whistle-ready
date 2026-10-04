import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { readHint, overLimit } from '@/lib/loginHint'

export const dynamic = 'force-dynamic'

// POST { hint, password }: "Yes, sign in with j•••@g•••.com" on the registration
// form (lib/loginHint). With that login's password it answers the full email, which
// the form needs to sign them in and to put on the registration; without it, nothing.
// Eight tries per login per 15 minutes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const userId = readHint(String(body.hint || ''))
  const password = String(body.password || '')
  if (!userId || !password) return NextResponse.json({ ok: false }, { status: 400 })
  if (await overLimit(`loginhint:try:${userId}`, 8, 15 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: 'Too many tries. Wait a few minutes, or reset the password.' }, { status: 429 })
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, password: true } }).catch(() => null)
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true, email: String(user.email || '').toLowerCase() })
}
