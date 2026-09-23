import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { encrypt } from '@/lib/encrypt'
import { getConnectUrl, socialEnabled } from '@/lib/social'

// Starts the connect flow: redirect the org's Facebook admin to Meta's OAuth
// dialog to authorize their OWN Page + Instagram Business account. Director/
// admin only — this is what grants publish rights, same trust level as other
// requireDirector-gated actions.
export async function GET(req: NextRequest) {
  if (!socialEnabled()) return NextResponse.json({ error: 'Social scheduler is not configured (missing META_APP_ID/META_APP_SECRET)' }, { status: 501 })
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const redirectUri = new URL('/api/social/callback', req.url).toString()
  // Opaque, tamper-evident state: which org started this + when, so the callback
  // can confirm it matches the signed-in session and isn't a stale/replayed link.
  const state = encrypt(`${gate.orgId}:${Date.now()}`)
  return NextResponse.redirect(getConnectUrl(redirectUri, state))
}
