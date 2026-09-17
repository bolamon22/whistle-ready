import { NextRequest, NextResponse } from 'next/server'
import { buildApplePass, walletEnabled, pngFromDataUrl, WALLET_MIME } from '@/lib/wallet'
import { loadCoachPass, waiverVersionOf } from '@/lib/coachPass'
import { appBaseUrl } from '@/lib/playerPass'

export const dynamic = 'force-dynamic'

// GET /api/wallet/coach/<token> — the coach credential as an Apple Wallet pass.
//
// Token-authorized like the credential page itself, not session-gated: a coach
// signs the waiver without ever making an account, so there is no session to
// check. The token is the same 128-bit secret that already gates /coach/<token>.
//
// Themed crimson automatically — buildApplePass reads the shared ROLES palette,
// where Bo added `coach`, so the pass and the printed badge match without this
// route knowing a single color.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  if (!walletEnabled()) {
    return NextResponse.json({ error: 'Apple Wallet is not set up for this site yet' }, { status: 503 })
  }

  const base = appBaseUrl(req)
  const pass = await loadCoachPass(params.token, base)
  if (!pass) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { card } = pass
  const teamLines = pass.teams.map(t => [t.club, t.team, t.division].filter(Boolean).join(' — '))

  const result = await buildApplePass({
    role: 'coach',
    // Keyed on the submission's token so re-downloading replaces the pass rather
    // than leaving a second copy in Wallet.
    serialNumber: `coach-${params.token}`,
    description: `${card.orgName} coach credential`,
    orgName: card.orgName || 'Coach credential',
    logoText: card.orgName,
    headerFields: card.eventDates ? [{ key: 'dates', label: 'DATES', value: card.eventDates }] : [],
    primaryFields: [{ key: 'name', value: card.name }],
    secondaryFields: [
      ...(card.business ? [{ key: 'club', label: 'CLUB', value: card.business }] : []),
      { key: 'role', label: 'ROLE', value: String(pass.data?.coachingRole || 'Coach') },
    ],
    auxiliaryFields: [
      ...(card.eventNames ? [{ key: 'event', label: 'EVENT', value: card.eventNames }] : []),
      ...(teamLines.length ? [{ key: 'teams', label: teamLines.length === 1 ? 'TEAM' : 'TEAMS', value: String(teamLines.length) }] : []),
    ],
    backFields: [
      ...(teamLines.length ? [{ key: 'list', label: 'Teams you cover', value: teamLines.join('\n') }] : []),
      { key: 'card', label: 'Printable credential', value: `${base}/coach/${params.token}` },
      { key: 'waiver', label: 'Waiver on file', value: `Signed ${pass.signedOn} (v${waiverVersionOf(pass.data)})` },
      // The same reassurance as the web page: this is a convenience, not a ticket.
      { key: 'note', label: 'Note', value: 'You are not required to show this to get on the sideline. Your signed waiver is what counts — this just speeds up check-in.' },
    ],
    barcodeMessage: pass.qrUrl,
    logoPng: pngFromDataUrl(card.orgLogoUrl),
    thumbnailPng: pngFromDataUrl(card.photoUrl),
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 })

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': WALLET_MIME,
      'Content-Disposition': `attachment; filename="${card.code}.pkpass"`,
      'Cache-Control': 'no-store, private',
    },
  })
}
