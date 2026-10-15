import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hasAcceptedCurrent, recordTermsAcceptance, requestMeta } from '@/lib/terms'
import { TERMS_VERSION } from '@/lib/termsVersion'

export const dynamic = 'force-dynamic'

// GET: does the signed-in person still need to agree to the current Terms of Use?
// POST: they ticked the box in the sign-in prompt (components/TermsGate).
// Signed out: nothing to ask; the forms record their own agreement.

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; email?: string } | undefined
  if (!user?.id) return NextResponse.json({ required: false, version: TERMS_VERSION })
  const ok = await hasAcceptedCurrent(user.id, user.email)
  return NextResponse.json({ required: !ok, version: TERMS_VERSION })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; email?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { agree?: boolean; version?: string }
  if (body.agree !== true) return NextResponse.json({ error: 'Tick the box to agree' }, { status: 400 })
  if (body.version && body.version !== TERMS_VERSION) {
    return NextResponse.json({ error: 'The terms changed. Reload the page and agree to the new version.' }, { status: 409 })
  }
  const saved = await recordTermsAcceptance({ userId: user.id, email: user.email, context: 'sign-in', ...requestMeta(req) })
  if (!saved) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, version: TERMS_VERSION })
}
