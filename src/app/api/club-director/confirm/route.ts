// A CLUB DIRECTOR CONFIRMING THEIR TEAM LIST, from the club portal.
//
// Bo, Oct 4 2026: the club ticks the box on "Confirm your team list", checks its
// teams, and that is its verification that the list is right. It sets the same
// Teams confirmed status as "Everything's right" in the confirm-your-teams email
// (lib/changeRequest), so the registrations page reads the same either way.
//
// The portal knows who is signed in, so the staff notes also get who confirmed
// and the exact list they saw. If a division turns out wrong on game day, the
// office can see what the club signed off on, and when.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { nameKey } from '@/lib/names'
import { confirmTeamList, officeStamp } from '@/lib/changeRequest'
import { ownRegistration } from '@/lib/clubPortal'

export const dynamic = 'force-dynamic'

type Seen = { id?: unknown; teamName?: unknown; division?: unknown }
const listKey = (teams: Seen[]) =>
  teams.map(t => `${String(t.id ?? '')}|${nameKey(t.teamName)}|${nameKey(t.division)}`).sort().join('\n')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const own = await ownRegistration(session, req.nextUrl.searchParams.get('userId'),
    String(body.tournamentId || '').trim(), String(body.registrationId || '').trim())
  if (!own.ok) return own.res
  const { reg, who } = own

  if (!reg.teams.length) {
    return NextResponse.json({ error: 'There are no teams on this registration yet. Add a team, or ask the office.' }, { status: 400 })
  }
  // Confirm the list the club was looking at, or nothing. If the office changed
  // it while the club had it open, they look again instead of signing off on a
  // list they never saw.
  if (Array.isArray(body.seen) && listKey(body.seen as Seen[]) !== listKey(reg.teams)) {
    return NextResponse.json({ error: 'Your team list just changed. Check it again, then confirm.' }, { status: 409 })
  }

  const list = reg.teams
    .map(t => `${t.teamName} (${t.division || 'no division'}${t.waitlisted ? ', waiting list' : ''})`)
    .join(', ')
  const done = await confirmTeamList(reg,
    `[Club portal ${officeStamp()}${who ? `, ${who}` : ''}] Confirmed the team list: ${list}.`)
  return NextResponse.json({ ok: true, confirm: { status: done.status, at: done.at, note: '' } })
}
