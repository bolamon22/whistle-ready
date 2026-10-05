import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { orgForTournament } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { housingSettings } from '@/lib/housing'
import { buildFamilyMessages } from '@/lib/familyMessages'

// Ready-made messages a club director sends to their OWN families — the public
// half of /share/[regId]. The regId in the link is the key, the same trust model
// as /confirm/[regId] and /pay/[regId].
//
// Club-safe fields only: club name, contact name, event, and public links. No
// contact list, no waiver data, no money. We never learn a club's parent
// addresses and never mail them ourselves; the director sends from their own
// account.

const fmtDates = (a?: string | null, b?: string | null) => {
  const f = (d?: string | null) => { if (!d) return ''; const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e || ''
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const reg = await prisma.teamRegistration.findUnique({ where: { id: params.id } })
  if (!reg || reg.deletedAt) return NextResponse.json({ error: 'This link is no longer valid' }, { status: 404 })

  const t = await prisma.tournament.findUnique({
    where: { id: reg.tournamentId },
    select: { name: true, startDate: true, endDate: true, location: true },
  })
  // The event's slug makes a link a family can read. Middleware rewrites
   // /tournaments/<slug>/player-waiver to the real id, and the cuid path keeps
   // working, so a missing slug just falls back to what we had.
  let seg = reg.tournamentId
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      'SELECT slug FROM "Tournament" WHERE id = ?', reg.tournamentId)
    seg = String(rows?.[0]?.slug || '') || reg.tournamentId
  } catch { /* column not migrated — cuid path is still correct */ }

  const org = await orgForTournament(reg.tournamentId)
  const housing = org?.id ? await housingSettings(org.id) : null
  const eventHome = tournamentAbs(org?.slug, `/tournaments/${seg}/event`)

  const messages = buildFamilyMessages({
    clubName: reg.clubName || 'our club',
    contactName: reg.clubContact || '',
    eventName: t?.name || 'the tournament',
    dates: fmtDates(t?.startDate, t?.endDate),
    location: String(t?.location || ''),
    waiverUrl: tournamentAbs(org?.slug, `/tournaments/${seg}/player-waiver`),
    coachUrl: tournamentAbs(org?.slug, `/tournaments/${seg}/coach-waiver`),
    // Falls back to the event page, which carries the travel info, when the org
    // has not set a booking URL yet.
    hotelUrl: housing?.bookingUrl || eventHome,
    hasHousingContact: !!housing?.contactEmail,
  })

  return NextResponse.json({
    clubName: reg.clubName || '',
    eventName: t?.name || 'the tournament',
    dates: fmtDates(t?.startDate, t?.endDate),
    messages,
  })
}
