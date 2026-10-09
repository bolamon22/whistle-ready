import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { linkedWaivers } from '@/lib/parentWaivers'
import { pickParentFields, shownParentFields } from '@/lib/parentWaiverFields'
import { fmtRange, playerPassEnabled, teamOnly } from '@/lib/playerPass'

export const dynamic = 'force-dynamic'

// GET /api/parent/waivers: the player waivers in the signed-in parent's account
// (put there at the end of the waiver, see lib/parentWaivers), with the details
// they can change (lib/parentWaiverFields). Only waivers linked to this login;
// never looked up by email.
export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = String(session?.user?.id || '')
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const subs = await linkedWaivers(userId)
  const tids = [...new Set(subs.map(s => String(s.data?.tournamentId || '')).filter(Boolean))]
  const events = tids.length
    ? await prisma.tournament.findMany({ where: { id: { in: tids } }, select: { id: true, name: true, startDate: true, endDate: true } }).catch(() => [])
    : []
  const eventOf = new Map(events.map(e => [e.id, e]))

  // Per org: is the player card on, and which questions its waiver form asks.
  const orgs = [...new Set(subs.map(s => s.orgId))]
  const passOn = new Map<string, boolean>()
  const formFields = new Map<string, Record<string, unknown>>()
  for (const orgId of orgs) {
    passOn.set(orgId, await playerPassEnabled(orgId).catch(() => false))
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
      formFields.set(orgId, (row ? JSON.parse(row.value || '{}') : {})?.player?.fields || {})
    } catch { formFields.set(orgId, {}) }
  }

  const today = new Date().toISOString().slice(0, 10)
  const waivers = subs.map(s => {
    const d = s.data || {}
    const tid = String(d.tournamentId || '')
    const ev = eventOf.get(tid)
    const lastDay = String(ev?.endDate || ev?.startDate || '').slice(0, 10)
    return {
      id: s.id,
      tournamentId: tid,
      // The team as the schedule names it: (division, team), never the name alone.
      division: String(d.division || ''),
      playerName: String(d.playerName || ''),
      eventName: ev?.name || String(d.tournamentName || ''),
      eventDates: ev ? fmtRange(String(ev.startDate || ''), String(ev.endDate || '')) : '',
      startDate: String(ev?.startDate || '').slice(0, 10),
      past: !!lastDay && lastDay < today,
      clubName: String(d.clubName || ''),
      team: teamOnly(d),
      submittedAt: s.submittedAt,
      passUrl: s.passToken && tid && passOn.get(s.orgId) ? `/pass/${s.passToken}` : '',
      fields: pickParentFields(d),
      shown: shownParentFields(formFields.get(s.orgId), d),
    }
  })
  // Coming up first (soonest first), then past events (latest first).
  waivers.sort((a, b) => a.past !== b.past ? (a.past ? 1 : -1)
    : a.past ? b.startDate.localeCompare(a.startDate) : (a.startDate || '9999').localeCompare(b.startDate || '9999'))
  return NextResponse.json({ waivers })
}
