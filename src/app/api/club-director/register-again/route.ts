// REGISTER THESE TEAMS FOR ANOTHER EVENT, from the club portal.
//
// A club already in one event was signing up for the next through the public
// form and typing every team again (Bo, Oct 3 2026). Here their teams are filled
// in to start: they keep, rename or leave out each one, add new ones, pick each
// team's division at the new event, and register. Bo, Oct 4 2026: it doesn't have
// to be the same teams; it is registering from the portal, pre-filled.
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
import { grantAccess } from '@/lib/clubAccess'
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

  // The teams that are coming, each with a division the new event offers. A row
  // with a teamId starts from that team: its logo comes along, and so does its
  // coach's phone while the coach is the same person. Name and coach are what the
  // club typed (the old values when a row leaves them out). A row without a
  // teamId is a new team.
  type Pick = { teamId?: unknown; teamName?: unknown; division?: unknown; coachName?: unknown; coachEmail?: unknown }
  const picks: Pick[] = Array.isArray(body.teams) ? body.teams.slice(0, 40) : []
  const teams = []
  const changes: string[] = []
  const names = new Set<string>()
  for (const p of picks) {
    const id = String(p.teamId || '')
    const base = id ? reg.teams.find(x => x.id === id) || null : null
    if (id && !base) return NextResponse.json({ error: 'One of those teams is not on your registration' }, { status: 400 })
    const teamName = cleanName(p.teamName ?? base?.teamName, 120)
    if (!teamName) return NextResponse.json({ error: 'Give every team a name' }, { status: 400 })
    if (names.has(nameKey(teamName))) {
      return NextResponse.json({ error: `Two teams are named ${teamName}. Give each team its own name.` }, { status: 400 })
    }
    names.add(nameKey(teamName))
    const division = offeredDivision(target, p.division)
    if (!division) return NextResponse.json({ error: `Pick a ${target.name} division for ${teamName}` }, { status: 400 })
    const coachName = p.coachName !== undefined ? cleanName(p.coachName, 120) : (base?.coachName || '')
    const coachEmail = (p.coachEmail !== undefined ? cleanName(p.coachEmail, 160) : (base?.coachEmail || '')).toLowerCase()
    if (coachEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coachEmail)) {
      return NextResponse.json({ error: `Check the coach email for ${teamName}` }, { status: 400 })
    }
    const sameCoach = !!base && nameKey(coachName) === nameKey(base.coachName)
    teams.push({
      clubName: reg.clubName, teamName, division,
      coachName, coachEmail, coachPhone: base && sameCoach ? base.coachPhone : '',
      logoUrl: base?.logoUrl || '',
    })
    if (!base) changes.push(`${teamName} is new`)
    else if (nameKey(teamName) !== nameKey(base.teamName)) changes.push(`${base.teamName} is now ${teamName}`)
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
      notes: `[Club portal ${officeStamp()}${who ? `, ${who}` : ''}] Registered from the club portal, starting from its ${source.name} teams${changes.length ? ` (${changes.join('; ')})` : ''}. Priced at the standard rate per team, no multi-team discount.`,
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

  // The new event in their portal now (lib/clubAccess). The POST above only does
  // that when the contact on the form is their own email; they may have changed it.
  await grantAccess(userId, made.id, 'registered again')

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
