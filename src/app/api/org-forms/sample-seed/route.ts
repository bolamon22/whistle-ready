import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { appBaseUrl, loadPlayerPass } from '@/lib/playerPass'

export const dynamic = 'force-dynamic'

// GET /api/org-forms/sample-seed?token=<pass token or /pass/ URL>
//
// Reads a finished player card and hands back the fields that make up the
// EXAMPLE card on the registration form — the one-click "fill from a real card"
// in Forms → Player card.
//
// SEEDING, NOT POINTING. The settings page copies these values in once and from
// then on they are the org's own editable fields (see PlayerCardSample). That is
// why this is a read of the card rather than the form rendering it live: the
// example must not stop working because somebody archived a waiver.
//
// Director-gated and scoped to the caller's own org: this returns a real
// registrant's name and photo, which is not something a coach or parent account
// has any business pulling by guessing tokens.
export async function GET(req: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res

  const raw = String(new URL(req.url).searchParams.get('token') || '')
  const token = (raw.match(/[a-f0-9]{32}/i) || [''])[0]
  if (!token) return NextResponse.json({ error: 'Paste the link to a finished player card' }, { status: 400 })

  const pass = await loadPlayerPass(token, appBaseUrl(req))
  if (!pass) return NextResponse.json({ error: 'No card found for that link' }, { status: 404 })

  // Never across orgs, even for a director.
  if (gate.orgId && pass.submission?.orgId && String(pass.submission.orgId) !== String(gate.orgId)) {
    return NextResponse.json({ error: 'That card belongs to another organization' }, { status: 403 })
  }

  const c = pass.card
  return NextResponse.json({
    ok: true,
    sample: {
      playerName: c.playerName || '',
      clubName: c.clubName || '',
      teamName: c.teamName || '',
      division: c.division || '',
      jersey: c.jersey || '',
      position: c.position || '',
      photoUrl: c.photoUrl || '',
      clubLogoUrl: c.clubLogoUrl || '',
      // The card's own first-QR target comes across so the example is faithful,
      // but the settings page shows it in an editable field — pointing every
      // parent at a real person's Instagram should be a decision, not a default.
      qrLink: pass.qrUrl || '',
      qrLabel: c.qrLabel || '',
      qr2Link: pass.qr2Url || '',
      qr2Label: c.qr2Label || '',
      code: c.code || '',
    },
  })
}
