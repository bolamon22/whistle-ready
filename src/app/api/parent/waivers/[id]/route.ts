import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getSubmission, updateSubmissionData } from '@/lib/formSubmissions'
import { linkedTo } from '@/lib/parentWaivers'
import { cleanParentChanges, pickParentFields } from '@/lib/parentWaiverFields'
import { allowRequest } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// PATCH /api/parent/waivers/<id> { changes: { field: value } }
// A parent updates their own child's waiver: only a waiver in their account
// (ParentWaiverLink, lib/parentWaivers), only the fields in lib/parentWaiverFields.
// The waiver's edit history records "parent: <name>", the same history the
// Player waivers page shows for staff edits.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const userId = String(session?.user?.id || '')
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  if (!allowRequest(`parentedit:${userId}`, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many saves. Wait a few minutes and try again.' }, { status: 429 })
  }

  const link = await linkedTo(userId, String(params.id || ''))
  const sub = link ? await getSubmission(link.orgId, params.id).catch(() => null) : null
  // Archived by staff (not attending, a duplicate): gone from the parent's list too.
  if (!link || !sub || sub.formType !== 'player' || sub.archivedAt) {
    return NextResponse.json({ error: 'That waiver isn’t in your account.' }, { status: 404 })
  }
  // Once the event is over the waiver is the record of it: the hotel answers feed
  // the room-night reports the grants are paid on. Same rule as the parent page.
  const tid = String(sub.data?.tournamentId || '')
  if (tid) {
    const ev = await prisma.tournament.findUnique({ where: { id: tid }, select: { startDate: true, endDate: true } }).catch(() => null)
    const lastDay = String(ev?.endDate || ev?.startDate || '').slice(0, 10)
    if (lastDay && lastDay < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'This event is over, so its waiver can’t be changed.' }, { status: 409 })
    }
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const clean = cleanParentChanges(body.changes)
  if ('error' in clean) return NextResponse.json({ error: clean.error }, { status: 400 })
  const changes = clean.changes
  // Where they're staying goes with "staying at a hotel": answered No or Maybe,
  // the old hotel name is cleared so the hotel counts don't keep it; answered
  // Yes, it has to be filled in (the waiver form requires it too).
  const cur = sub.data || {}
  const hotel = 'hotel' in changes ? changes.hotel : String(cur.hotel || '')
  if ('hotel' in changes && hotel !== 'Yes' && String(cur.hotelName || '')) changes.hotelName = ''
  if (hotel === 'Yes' && ('hotel' in changes || 'hotelName' in changes)) {
    const name = 'hotelName' in changes ? changes.hotelName : String(cur.hotelName || '')
    if (!name.trim()) return NextResponse.json({ error: 'Fill in where you’re staying.' }, { status: 400 })
  }
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true, changed: [], fields: pickParentFields(cur) })

  const who = String(session?.user?.name || session?.user?.email || 'account').trim().slice(0, 80)
  const before = pickParentFields(cur)
  const updated = await updateSubmissionData(link.orgId, sub.id, changes, `parent: ${who}`)
  if (!updated) return NextResponse.json({ error: 'That waiver isn’t in your account.' }, { status: 404 })
  const after = pickParentFields(updated.data)
  return NextResponse.json({ ok: true, changed: Object.keys(changes).filter(k => before[k] !== after[k]), fields: after })
}
