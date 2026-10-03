// A CLUB DIRECTOR ADDING A TEAM TO THEIR OWN REGISTRATION, from the club portal.
//
// Bo, Oct 3 2026: a club may add a team itself but not delete one. Adding is
// direct until the schedule is posted; after that (and once a division has games
// in the draft schedule) it answers 409 with code 'schedule_posted' and the
// portal files the same thing as a request instead (see ../request).
//
// What the club would get on the public form, it gets here: a team in a division
// marked full goes on the waiting list and is not billed, and the invoice is
// recomputed from the event's pricing as of the date they registered. As on the
// staff delete path, the invoice only moves when the stored figure still matches
// the schedule; a figure someone set by hand is a decision, so it is left alone
// and the office is told what the schedule now says.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cleanName, nameKey } from '@/lib/names'
import { parsePricing, calcFee } from '@/lib/regPricing'
import { sendEmail, orgSender, OFFICE_CC } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { officeStamp, APP_URL } from '@/lib/changeRequest'
import { ownRegistration, eventInfo, offeredDivision, divisionFull, directAddBlock, addStaffNote } from '@/lib/clubPortal'

export const dynamic = 'force-dynamic'

const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'),
    String(body.tournamentId || '').trim(), String(body.registrationId || '').trim())
  if (!own.ok) return own.res
  const { reg, who } = own

  const info = await eventInfo(reg.tournamentId)
  const teamName = cleanName(body.teamName, 120)
  const division = info ? offeredDivision(info, body.division) : null
  if (!teamName) return NextResponse.json({ error: 'Give the new team a name' }, { status: 400 })
  if (!info || !division) return NextResponse.json({ error: 'Pick a division this event offers' }, { status: 400 })
  // One team at one event is a (division, name) pair; the same pair twice is a
  // double tap or a duplicate, never a second team.
  if (reg.teams.some(t => nameKey(t.division) === nameKey(division) && nameKey(t.teamName) === nameKey(teamName))) {
    return NextResponse.json({ error: `${teamName} is already registered in ${division}` }, { status: 409 })
  }
  const coachName = cleanName(body.coachName, 120)
  const coachEmail = cleanName(body.coachEmail, 160).toLowerCase()
  if (coachEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coachEmail)) {
    return NextResponse.json({ error: 'That coach email does not look right' }, { status: 400 })
  }

  const block = await directAddBlock(reg.tournamentId, division)
  if (block === 'ended') return NextResponse.json({ error: 'This event is over' }, { status: 409 })
  if (block) {
    return NextResponse.json({
      error: block === 'posted'
        ? 'The schedule is posted, so a new team goes to the office as a request.'
        : `The ${division} schedule is already being built, so a new team goes to the office as a request.`,
      code: 'schedule_posted',
    }, { status: 409 })
  }

  const waitlisted = divisionFull(info, division)
  const team = await prisma.registeredTeam.create({
    data: {
      registrationId: reg.id,
      clubName: reg.clubName,
      teamName,
      division,
      coachName,
      coachEmail,
      coachPhone: cleanName(body.coachPhone, 40),
      logoUrl: reg.clubLogoUrl || '',
      waitlisted,
    },
  })

  // Invoice: the held-back rule from the staff delete path.
  const pricing = parsePricing(info.pricingRaw)
  const asOf = reg.createdAt.toISOString().slice(0, 10)   // their price is as of when they registered
  const before = calcFee(reg.teams.map(t => ({ division: t.division, waitlisted: t.waitlisted })), pricing, asOf)
  const after = calcFee([...reg.teams, team].map(t => ({ division: t.division, waitlisted: t.waitlisted })), pricing, asOf)
  const was = reg.invoiceAmount || 0
  const unedited = Math.round(was * 100) === Math.round(before * 100)
  const data: { numTeams: number; invoiceAmount?: number } = { numTeams: reg.teams.length + 1 }
  if (unedited) data.invoiceAmount = after
  await prisma.teamRegistration.update({ where: { id: reg.id }, data })
  const invoice = { was, now: unedited ? after : was, heldBack: !unedited, wouldBe: after }

  // What the office sees: a line in the registration's notes and an email.
  const what = `Added ${teamName} to ${division}${waitlisted ? ' (division full: waiting list, not billed)' : ''}`
  const bill = unedited
    ? (Math.round(after * 100) !== Math.round(was * 100) ? ` Invoice ${money(was)} → ${money(after)}.` : ' Invoice unchanged.')
    : ` Invoice left at ${money(was)} because it was set by hand; the price list now says ${money(after)}.`
  try {
    await addStaffNote(reg.id, reg.notes, `[Club portal ${officeStamp()}${who ? `, ${who}` : ''}] ${what}.${bill}`)
  } catch { /* the team is added; the note is the record, not the gate */ }
  try {
    const org = await orgForTournament(reg.tournamentId)
    await sendEmail({
      ...orgSender(org),
      to: OFFICE_CC,
      subject: `Team added — ${reg.clubName} (${info.name || 'tournament'})`,
      html: `<div style="font-family: sans-serif; max-width: 440px; margin: 0 auto; padding: 28px 24px;">
        <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 4px;">${esc(reg.clubName)} added a team</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0 0 14px;">${esc(info.name || 'the tournament')} · from the club portal${who ? ` · ${esc(who)}` : ''}</p>
        <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 12px 14px; color: #134e4a; font-size: 14px;">${esc(what)}.${esc(bill)}${coachName ? `<br>Coach: ${esc(coachName)}${coachEmail ? ` (${esc(coachEmail)})` : ''}` : ''}</div>
        <a href="${APP_URL}/tournaments/${reg.tournamentId}/registrations"
          style="display: inline-block; margin-top: 18px; background: #14b8a6; color: white; font-weight: 600; font-size: 13px; padding: 10px 22px; border-radius: 10px; text-decoration: none;">
          Open registrations &rarr;
        </a>
      </div>`,
    })
  } catch { /* the note on the registration is the record */ }

  return NextResponse.json({
    ok: true,
    team: { id: team.id, teamName: team.teamName, division: team.division, coachName: team.coachName, coachEmail: team.coachEmail, coachPhone: team.coachPhone, logoUrl: team.logoUrl, waitlisted: team.waitlisted },
    invoice,
  })
}
