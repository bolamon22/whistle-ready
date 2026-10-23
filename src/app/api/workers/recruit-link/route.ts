import { NextResponse } from 'next/server'
import { joinCodeFor } from '@/lib/joinCode'
import { requireStaff } from '@/lib/apiAuth'
import { orgById } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL — prod's still points at old gameday-staff5.vercel.app (found Aug 28)

// POST /api/workers/recruit-link — get (or mint) this org's public recruiting link
// for /join. The link carries a secret code (AppSetting joinCode:{orgId}) so the open
// signup can't be botted; pass {regenerate:true} to rotate the code and kill every
// previously shared link.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res

  let body: { regenerate?: unknown; viewOrgId?: unknown; kind?: unknown } = {}
  try { body = await req.json() } catch { /* optional body */ }
  // A new code turns off every link already shared, so only a director or admin may
  // rotate it. Any staff could (found Oct 13 2026, adding field directors, who copy
  // this link from the Staff roster).
  if (body.regenerate === true && gate.role !== 'admin' && gate.role !== 'director') {
    return NextResponse.json({ error: 'Only a director can make a new signup link.' }, { status: 403 })
  }

  const orgId = gate.role === 'admin'
    ? String(body.viewOrgId || gate.orgId || '')
    : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  // kind 'unpaid': the volunteers and refs-in-training link (lib/joinCode, lib/staffType).
  const code = await joinCodeFor(orgId, body.kind === 'unpaid' ? 'unpaid' : 'staff', body.regenerate === true)

  // On the org's own domain when it has one. A ref being recruited has never
  // heard of Whistle Ready -- the link has to read as the tournament company's.
  // Falls back to the platform for an org without a custom domain.
  const org = await orgById(orgId)
  return NextResponse.json({ url: `${orgBaseUrl(org?.slug, APP_URL)}/join/${code}` })
}
