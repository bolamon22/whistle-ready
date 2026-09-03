import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { PassCard, PASS_W, PASS_H } from '@/lib/playerPassCard'
import { appBaseUrl, imageForSatori, loadPlayerPass, loadPassFonts, qrDataUrl } from '@/lib/playerPass'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /pass/<token>/card.png — the player pass as a PNG (720×1140, CR80 badge proportions).
// Public: the token is the authorization (see /pass/[token]/page.tsx).
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const base = appBaseUrl(req)
  const pass = await loadPlayerPass(params.token, base)
  if (!pass) return new NextResponse('Not found', { status: 404 })

  const [photoUrl, clubLogoUrl, tournamentLogoUrl, orgLogoUrl, qr, qr2, fonts] = await Promise.all([
    imageForSatori(pass.card.photoUrl, base),
    imageForSatori(pass.card.clubLogoUrl, base),
    imageForSatori(pass.card.tournamentLogoUrl, base),
    imageForSatori(pass.card.orgLogoUrl, base),
    qrDataUrl(pass.qrUrl),
    qrDataUrl(pass.qr2Url),
    loadPassFonts().catch(() => undefined),
  ])
  const p = { ...pass.card, photoUrl, clubLogoUrl, tournamentLogoUrl, orgLogoUrl, qrDataUrl: qr, qr2DataUrl: qr2 }
  return new ImageResponse(<PassCard p={p} />, {
    width: PASS_W, height: PASS_H,
    ...(fonts ? { fonts } : {}),
    headers: {
      // The URL is unguessable, so caching is fine; keep it short so edits (photo, team) show up.
      'Cache-Control': 'private, max-age=120',
      'Content-Disposition': `inline; filename="player-pass-${pass.card.code.replace('-', '')}.png"`,
    },
  })
}
