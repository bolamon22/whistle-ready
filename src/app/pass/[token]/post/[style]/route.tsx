import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'
import { appBaseUrl, imageForSatori, loadPlayerPass } from '@/lib/playerPass'
import { passCardDataUrl } from '@/lib/passCardImage'
import { firstName } from '@/lib/photoConsent'
import { PostArt, POST_W, POST_H, isPostStyle, usesPhoto, loadPostFonts, startFacts, imageSize } from '@/lib/socialPosts'
import { siblingCard } from '@/lib/siblings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /pass/<token>/post/<style>.png[?w=540][&days=N] — an Instagram post (4:5) built
// around the player's card (lib/socialPosts). Public like card.png: the pass token is
// the authorization, and the post shows nothing the card doesn't (first name only).
// The photo-permission email shows these at w=540 so families see what we'd post;
// staff download the full 1080×1350 once a family says yes. days= overrides the
// countdown number (Countdown) when posting ahead of time.
export async function GET(req: NextRequest, { params }: { params: { token: string; style: string } }) {
  const style = String(params.style || '').replace(/\.png$/i, '')
  if (!isPostStyle(style)) return new NextResponse('Not found', { status: 404 })
  const base = appBaseUrl(req)
  const pass = await loadPlayerPass(params.token, base)
  if (!pass) return new NextResponse('Not found', { status: 404 })

  const q = new URL(req.url).searchParams
  const width = Math.min(POST_W, Math.max(360, Math.round(Number(q.get('w')) || POST_W)))
  const tid = pass.submission.tournamentId
  // The photo looks draw the family's own photo; without one they fall back to the card.
  let photoSrc = usesPhoto(style) ? await imageForSatori(pass.card.photoUrl, base) : ''
  // The photo's size, so the looks can crop from the top (Satori only center-crops, which
  // cut heads off). A remote photo is fetched once and passed in as data.
  let photoW = 0, photoH = 0
  if (photoSrc) {
    try {
      let bytes: Uint8Array
      if (photoSrc.startsWith('data:')) bytes = Buffer.from(photoSrc.slice(photoSrc.indexOf(',') + 1, photoSrc.indexOf(',') + 1 + 200_000), 'base64')
      else {
        const r = await fetch(photoSrc)
        const buf = Buffer.from(await r.arrayBuffer())
        if (r.ok && buf.length) { bytes = buf; photoSrc = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}` } else bytes = new Uint8Array()
      }
      const sz = imageSize(bytes)
      if (sz && sz.w > 0 && sz.h > 0) { photoW = sz.w; photoH = sz.h }
    } catch {}
  }
  const sibs = style === 'siblings' && pass.submission.orgId ? await siblingCard(pass.submission.orgId, pass.submission.id).catch(() => null) : null
  const [cardSrc, logoSrc, clubLogoSrc, fonts, start] = await Promise.all([
    photoSrc ? Promise.resolve('') : passCardDataUrl(pass, base),
    imageForSatori(pass.card.tournamentLogoUrl, base),
    imageForSatori(pass.card.clubLogoUrl, base),
    loadPostFonts().catch(() => undefined),
    tid ? prisma.$queryRawUnsafe<any[]>('SELECT startDate FROM "Tournament" WHERE id = ?', tid).then((r: any[]) => String(r?.[0]?.startDate || '')).catch(() => '') : Promise.resolve(''),
  ])
  const facts = startFacts(start)
  const daysParam = q.get('days')
  const daysOut = daysParam != null && /^\d{1,3}$/.test(daysParam) ? Number(daysParam) : facts.daysOut
  const c = pass.card
  const d = {
    cardSrc, logoSrc, photoSrc, clubLogoSrc, ...(photoW ? { photoW, photoH } : {}), ...(sibs ? { sibs } : {}),
    first: firstName(c.playerName),
    club: c.clubName, team: c.teamName, division: c.division, jersey: c.jersey, position: c.position,
    tournamentName: c.tournamentName, dates: c.tournamentDates, location: c.location, orgName: c.orgName,
    startShort: facts.startShort, year: facts.year, daysOut,
  }
  const name = `${firstName(c.playerName) || 'player'}-${style}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return new ImageResponse(<PostArt style={style} d={d} width={width} />, {
    width, height: Math.round(width * POST_H / POST_W),
    ...(fonts ? { fonts } : {}),
    headers: {
      'Cache-Control': 'private, max-age=120',
      'Content-Disposition': `${q.get('dl') ? 'attachment' : 'inline'}; filename="${name}.png"`,
    },
  })
}
