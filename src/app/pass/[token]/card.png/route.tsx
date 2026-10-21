import { NextRequest, NextResponse } from 'next/server'
import { appBaseUrl, loadPlayerPass } from '@/lib/playerPass'
import { passCardImage } from '@/lib/passCardImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /pass/<token>/card.png — the player pass as a PNG (720×1140, CR80 badge proportions).
// Public: the token is the authorization (see /pass/[token]/page.tsx).
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const base = appBaseUrl(req)
  const pass = await loadPlayerPass(params.token, base)
  if (!pass) return new NextResponse('Not found', { status: 404 })
  return passCardImage(pass, base, {
    // The URL is unguessable, so caching is fine; keep it short so edits (photo, team) show up.
    // Lowercase: replaces next/og's 1-year immutable default (a capitalized key didn't).
    'cache-control': 'private, max-age=120',
    'Content-Disposition': `inline; filename="player-pass-${pass.card.code.replace('-', '')}.png"`,
  })
}
