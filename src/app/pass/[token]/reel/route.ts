import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { appBaseUrl, loadPlayerPass } from '@/lib/playerPass'
import { firstName } from '@/lib/photoConsent'
import { startFacts } from '@/lib/socialPosts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /pass/<token>/reel — what the custom Reels (components/reelCustom) draw, piece by
// piece: first name, number, position, club, team, division, the event's facts, and
// same-origin links to the photo and logos (/pass/<token>/img/<kind>), so the canvas
// stays untainted and can be recorded. Public like card.png: the pass token is the
// authorization, and it hands out nothing the card doesn't show (first name only).
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const base = appBaseUrl(req)
  const pass = await loadPlayerPass(params.token, base)
  if (!pass) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const c = pass.card
  const tid = pass.submission.tournamentId
  const start = tid ? await prisma.$queryRawUnsafe<any[]>('SELECT startDate FROM "Tournament" WHERE id = ?', tid).then((r: any[]) => String(r?.[0]?.startDate || '')).catch(() => '') : ''
  const facts = startFacts(start)
  // days= sets the countdown number for a Reel scheduled ahead of time (the social
  // scheduler makes it for the day it will post, not for today), like post/<style>.png.
  const daysParam = new URL(req.url).searchParams.get('days')
  const daysOut = daysParam != null && /^\d{1,3}$/.test(daysParam) ? Number(daysParam) : facts.daysOut
  const img = (kind: string, url: string) => (url ? `/pass/${params.token}/img/${kind}` : '')
  return NextResponse.json({
    first: firstName(c.playerName),
    jersey: c.jersey, position: c.position, club: c.clubName, team: c.teamName, division: c.division,
    event: { name: c.tournamentName, dates: c.tournamentDates, location: c.location, startShort: facts.startShort, year: facts.year, daysOut },
    photo: img('photo', c.photoUrl), clubLogo: img('club', c.clubLogoUrl), eventLogo: img('event', c.tournamentLogoUrl),
  }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
