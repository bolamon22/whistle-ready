import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { CredentialCard, CRED_W, CRED_H } from '@/lib/credentialCard'
import { loadCoachPass } from '@/lib/coachPass'
import { appBaseUrl, imageForSatori, loadPassFonts, qrDataUrl } from '@/lib/playerPass'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /coach/<token>/card.png — the coach credential as a PNG, CR80 proportions.
// Public: the unguessable token IS the authorization, same as /pass and /vendor.
//
// A PNG rather than printing the DOM card: the card is drawn at a fixed 720x1140
// and a browser asked to print a div that size scales it to the sheet, which is
// how you end up with a four-inch badge that will not go in a lanyard holder.
// An <img> plus the inch-pinned rules in cardPrint.ts comes out right.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const base = appBaseUrl(req)
  const pass = await loadCoachPass(params.token, base)
  if (!pass) return new NextResponse('Not found', { status: 404 })

  const [photoUrl, orgLogoUrl, qr, qr2, fonts] = await Promise.all([
    imageForSatori(pass.card.photoUrl, base),
    imageForSatori(pass.card.orgLogoUrl, base),
    qrDataUrl(pass.qrUrl),
    qrDataUrl(pass.qr2Url),
    loadPassFonts().catch(() => undefined),
  ])

  return new ImageResponse(
    <CredentialCard mode="satori" p={{ ...pass.card, photoUrl, orgLogoUrl, qrDataUrl: qr, qr2DataUrl: qr2 }} />,
    {
      width: CRED_W, height: CRED_H,
      ...(fonts ? { fonts } : {}),
      headers: {
        // Unguessable URL, so caching is safe; short so a new photo shows up.
        'Cache-Control': 'private, max-age=120',
        'Content-Disposition': `inline; filename="coach-credential-${pass.card.code.replace('-', '')}.png"`,
      },
    },
  )
}
