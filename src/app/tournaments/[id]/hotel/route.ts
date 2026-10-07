import { NextRequest, NextResponse } from 'next/server'
import { orgForTournament } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { eventHotelInfo, hotelDestination } from '@/lib/hotelTarget'

// One short, readable hotel link per event: /tournaments/<slug>/hotel bounces to
// the event's own hotel list (/hotels) when it has one, else the event's housing
// link (Builder › Hotels), else the org's booking link at Staff › Housing
// (lib/hotelTarget). It used to be the org's link for every event, and that was
// Monster Mash's, so the Fall Classic's hotel link opened the Wellington hotels.
//
// Why it exists (Bo, Oct 5 2026): a real housing-company booking link carries
// the venue's coordinates, a property list and tracking params — Monster Mash
// 2026's is 292 characters. A club director who sends their families through
// the Gmail or Outlook button cannot get a worded link, because a compose deep
// link carries plain text and nothing else, so the families were being shown a
// wrapped wall of URL that reads like something broke. The fix is not in the
// email, it is in the address: make the address short.
//
// It also means the day the housing company changes its link, every message
// already sitting in a parent's inbox still works — one setting, not a reissued
// email.
//
// Public on purpose: this is the link clubs forward to families who have no
// account. It is listed in PUBLIC_TOURNAMENT_PATH in middleware.ts.

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const org = await orgForTournament(params.id)
  const info = await eventHotelInfo(params.id, org?.id)

  // Only ever bounce to a real http(s) address (lib/eventHotels safeUrl). With
  // nothing set, or a typo in the setting, families get the event page, which
  // carries the travel info, rather than somewhere unexpected.
  const dest = hotelDestination(info, params.id, path => tournamentAbs(org?.slug, path))
    || tournamentAbs(org?.slug, `/tournaments/${params.id}/event`)

  // 302, not 308: the booking URL changes between events and seasons, and a
  // permanent redirect would be cached in parents' browsers past that.
  return NextResponse.redirect(dest, 302)
}
