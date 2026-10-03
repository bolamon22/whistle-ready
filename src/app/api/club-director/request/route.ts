// A CLUB DIRECTOR ASKING THE OFFICE TO CHANGE A TEAM, from the club portal.
//
// Move a team to another division, take one out, add one after the schedule is
// posted, or anything else. Nothing changes until the office does it: a move can
// land in a full division and a removal can owe a refund, so a person decides.
// Bo, Oct 3 2026: clubs may add a team themselves, but never just delete one.
//
// The request goes on the registration as the same amber "change requested" flag
// the confirm-your-teams email raises (lib/changeRequest), so the office works
// one queue, and "Change made" there asks the club to confirm the new list.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cleanName } from '@/lib/names'
import { fileChangeRequest } from '@/lib/changeRequest'
import { ownRegistration, eventInfo, offeredDivision, divisionFull } from '@/lib/clubPortal'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['move', 'remove', 'other', 'add'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const kind = String(body.kind || '')
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Unknown request' }, { status: 400 })

  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'),
    String(body.tournamentId || '').trim(), String(body.registrationId || '').trim())
  if (!own.ok) return own.res
  const { reg, who } = own

  const teamId = String(body.teamId || '').trim()
  const team = teamId ? reg.teams.find(t => t.id === teamId) || null : null
  if ((kind === 'move' || kind === 'remove') && !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (teamId && !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const note = cleanName(body.note, 600)
  const said = note ? ` ${who || 'The club'} wrote: "${note}"` : ''
  const label = (t: { teamName: string; division: string }) => `${t.teamName} (${t.division || 'no division'})`

  let message = ''
  if (kind === 'move' && team) {
    const info = await eventInfo(reg.tournamentId)
    const to = info ? offeredDivision(info, body.toDivision) : null
    if (!info || !to) return NextResponse.json({ error: 'Pick a division this event offers' }, { status: 400 })
    if (to === team.division) return NextResponse.json({ error: `${team.teamName} is already in ${to}` }, { status: 400 })
    const full = divisionFull(info, to)
    message = `Move ${team.teamName} from ${team.division || 'no division'} to ${to}.`
      + (full ? ` ${to} is marked full, so this would put them on its waiting list.` : '') + said
  } else if (kind === 'remove' && team) {
    message = `Remove ${label(team)}.` + (note ? ` Why: "${note}" (${who || 'the club'})` : '')
  } else if (kind === 'add') {
    // Only reached once a club can no longer add the team itself (see the teams route).
    const info = await eventInfo(reg.tournamentId)
    const teamName = cleanName(body.teamName, 120)
    const division = info ? offeredDivision(info, body.division) : null
    if (!teamName) return NextResponse.json({ error: 'Give the new team a name' }, { status: 400 })
    if (!info || !division) return NextResponse.json({ error: 'Pick a division this event offers' }, { status: 400 })
    const coach = cleanName(body.coachName, 120)
    const coachEmail = cleanName(body.coachEmail, 160).toLowerCase()
    const full = divisionFull(info, division)
    message = `Add a team: ${teamName} in ${division}` + (coach ? `, coach ${coach}${coachEmail ? ` (${coachEmail})` : ''}` : '') + '.'
      + (full ? ` ${division} is marked full, so it would go on the waiting list.` : '') + said
  } else {
    if (!note) return NextResponse.json({ error: 'Tell us what you need' }, { status: 400 })
    message = `${who || 'The club'} wrote${team ? ` about ${label(team)}` : ''}: "${note}"`
  }

  const filed = await fileChangeRequest(reg, message, 'portal')
  return NextResponse.json({ ok: true, confirm: { status: filed.status, at: filed.at, note: filed.note } })
}
