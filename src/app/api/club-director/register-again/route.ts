// REGISTER THESE TEAMS FOR ANOTHER EVENT, from the club portal.
//
// A club already in one event was signing up for the next through the public
// form and typing every team again (Bo, Oct 3 2026). Here they tick the teams
// that are coming, pick each one's division at the new event, and register.
//
// The registration itself is made by the same POST the public form uses
// (api/registrations), so pricing, the waiting list, the confirmation letter
// with its payment link, and the organizer's heads-up all behave exactly as if
// they had typed it in. This route only does what the form can't: it checks
// the club owns the registration it copies from, that the target is the same
// organizer's open, upcoming event the club isn't already in, and it gives the
// director the new event in their portal straight away.
//
// The old "Register again" copied every team with its old division, copied the
// staff notes, and could only target events the director was already linked to.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cleanName, nameKey } from '@/lib/names'
import { todayET } from '@/lib/publicView'
import { officeStamp } from '@/lib/changeRequest'
import { ownRegistration, eventInfo, offeredDivision, divisionFull } from '@/lib/clubPortal'
import { parsePricing, calcFee, withoutVolumeDiscount } from '@/lib/regPricing'
import { POST as createRegistration } from '@/app/api/registrations/route'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, any>
  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'),
    String(body.tournamentId || '').trim(), String(body.registrationId || '').trim())
  if (!own.ok) return own.res
  const { reg, who, userId } = own

  const source = await eventInfo(reg.tournamentId)
  const target = await eventInfo(String(body.targetId || '').trim())
  if (!source || !target || target.id === source.id) return NextResponse.json({ error: 'Pick an event to register for' }, { status: 400 })
  if (!target.orgId || target.orgId !== source.orgId) return NextResponse.json({ error: 'That event is not open to this club' }, { status: 403 })
  if (!target.teamRegEnabled) return NextResponse.json({ error: `${target.name} is not taking team registrations` }, { status: 409 })
  if (String(target.endDate || target.startDate || '') < todayET()) return NextResponse.json({ error: `${target.name} is over` }, { status: 409 })
  const already = await prisma.teamRegistration.findMany({ where: { tournamentId: target.id, deletedAt: null }, select: { clubName: true } })
  if (already.some(r => nameKey(r.clubName) === nameKey(reg.clubName))) {
    return NextResponse.json({ error: `${reg.clubName} is already registered for ${target.name}` }, { status: 409 })
  }

  // The teams that are coming, each with a division the new event offers.
  const picks: { teamId?: unknown; division?: unknown }[] = Array.isArray(body.teams) ? body.teams : []
  const teams = []
  for (const p of picks) {
    const t = reg.teams.find(x => x.id === String(p.teamId || ''))
    if (!t) return NextResponse.json({ error: 'One of those teams is not on your registration' }, { status: 400 })
    const division = offeredDivision(target, p.division)
    if (!division) return NextResponse.json({ error: `Pick a ${target.name} division for ${t.teamName}` }, { status: 400 })
    teams.push({
      clubName: reg.clubName, teamName: t.teamName, division,
      coachName: t.coachName, coachPhone: t.coachPhone, coachEmail: t.coachEmail, logoUrl: t.logoUrl,
    })
  }
  if (!teams.length) return NextResponse.json({ error: 'Pick at least one team' }, { status: 400 })

  // Contact: theirs from the registration unless they changed it here.
  const c = body.contact || {}
  const clubContact = cleanName(c.clubContact ?? reg.clubContact, 120)
  const contactEmail = cleanName(c.contactEmail ?? reg.contactEmail, 160)
  const contactPhone = cleanName(c.contactPhone ?? reg.contactPhone, 40)
  if (!clubContact || !contactPhone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return NextResponse.json({ error: 'Add a contact name, email and phone for this registration' }, { status: 400 })
  }

  // Standard rate per team, without the event's multi-team discount (Bo, Oct 4
  // 2026: he'll offer that as a special, not hand it out because a club brought
  // a lot of teams somewhere else). Teams in a full division are left off the
  // bill exactly as the registration POST would leave them. Zero means every
  // team is waitlisted, and the POST then works out the same zero itself.
  const invoiceAmount = calcFee(
    teams.map(t => ({ division: t.division, waitlisted: divisionFull(target, t.division) })),
    withoutVolumeDiscount(parsePricing(target.pricingRaw)))

  const res = await createRegistration(new NextRequest(new URL('/api/registrations', req.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tournamentId: target.id,
      clubName: reg.clubName,
      clubContact, contactEmail, contactPhone,
      clubBasedIn: reg.clubBasedIn, clubWebsite: reg.clubWebsite,
      numTeams: teams.length,
      needsHotel: reg.needsHotel,
      paymentMethod: reg.paymentMethod,
      // Staff notes are not copied: they are about the old event.
      notes: `[Club portal ${officeStamp()}${who ? `, ${who}` : ''}] Registered from the club portal, copied from ${source.name}. Priced at the standard rate per team, no multi-team discount.`,
      ...(invoiceAmount > 0 ? { invoiceAmount } : {}),
      clubLogoUrl: reg.clubLogoUrl,
      teams,
      source: 'portal',
    }),
  }))
  const made = await res.json().catch(() => ({})) as any
  if (res.status !== 201 || !made?.id) {
    return NextResponse.json({ error: made?.error || 'Registration failed. Please contact the tournament office.' }, { status: res.status >= 400 ? res.status : 500 })
  }

  // The new event in their portal now, not only when the club name matches a
  // prior link exactly (carryDirectorLinks, inside the POST above).
  try {
    await prisma.clubDirectorLink.upsert({
      where: { userId_tournamentId_clubName: { userId, tournamentId: target.id, clubName: made.clubName } },
      update: {},
      create: { userId, tournamentId: target.id, clubName: made.clubName },
    })
  } catch { /* carryDirectorLinks usually has it; staff can link by hand */ }

  return NextResponse.json({
    ok: true,
    registrationId: made.id,
    tournamentId: target.id,
    tournamentName: target.name,
    invoiceAmount: made.invoiceAmount,
    contactEmail: made.contactEmail,
    teams: (made.teams || []).map((t: any) => ({ teamName: t.teamName, division: t.division, waitlisted: !!t.waitlisted })),
  })
}
