import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { decrypt } from '@/lib/encrypt'
import { completeConnect, socialEnabled } from '@/lib/social'

const STATE_MAX_AGE_MS = 10 * 60 * 1000

// Meta redirects back here with ?code=... after the org admin approves the
// OAuth dialog. Exchanges the code, pulls in every Page (+ linked Instagram
// account) that admin manages, and connects them all.
export async function GET(req: NextRequest) {
  if (!socialEnabled()) return NextResponse.json({ error: 'Social scheduler is not configured' }, { status: 501 })
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error_description') || url.searchParams.get('error')
  if (err) return NextResponse.redirect(new URL(`/dashboard/org/social?error=${encodeURIComponent(err)}`, req.url))
  if (!code || !state) return NextResponse.json({ error: 'Missing code/state from Meta' }, { status: 400 })

  const [stateOrgId, stateTs] = decrypt(state).split(':')
  if (stateOrgId !== gate.orgId || Date.now() - Number(stateTs || 0) > STATE_MAX_AGE_MS) {
    return NextResponse.json({ error: 'This connect link expired or belongs to a different session — try connecting again' }, { status: 400 })
  }

  const redirectUri = new URL('/api/social/callback', req.url).toString()
  const result = await completeConnect(gate.orgId, gate.userId, code, redirectUri)
  if (!result.ok) return NextResponse.redirect(new URL(`/dashboard/org/social?error=${encodeURIComponent(result.error)}`, req.url))
  return NextResponse.redirect(new URL(`/dashboard/org/social?connected=${result.data.connected}`, req.url))
}
