import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { prisma } from '@/lib/db'
import {
  listSubmissions, countSubmissions, teamCounts, getSubmission,
  updateSubmissionData, setCheckIn, clearCheckIns, countCheckedIn,
  setArchived, deleteSubmission,
} from '@/lib/formSubmissions'

// Coach-waiver submissions for ONE tournament (rows in "OrgFormSubmission",
// formType 'coach'). Deliberately a mirror of the player-waivers route beside
// it — same query helpers, same shape of response — so the two lists behave
// identically and neither drifts.
//
//   GET   ?q=&team=&sort=newest|oldest|name&limit=&offset=&archived=1
//         → { submissions, total, grandTotal, teams, checkedIn, archivedTotal, … }
//   GET   ?id=<submission id> | ?token=<passToken> → { submission }
//         The scanned-credential panel. Token as well as id because the QR on
//         the credential encodes /coach/<passToken> — a scanner has the token.
//   PATCH { id, checkIn: true|false }          coaches' tent check-in.
//   PATCH { clearCheckIns: true, team? }       reset before day two.
//   PATCH { id, archive: true|false }          archive / restore.
//   PATCH { id, data: {…} }                    edit the whitelisted fields.
//   DELETE { id }                              permanent, directors only.
//
// The signature, the agreements and the waiver version are NOT editable. A
// signed waiver is the record of what someone agreed to; staff fixing a typo in
// a phone number must not be able to touch that.
const EDITABLE = [
  'coachFullName', 'email', 'mobilePhone', 'clubName', 'coachingRole', 'division',
  'emergencyContactName', 'emergencyContactPhone', 'accommodationStatus',
  'highestLevelCoached',
] as const

async function gateForTournament(id: string) {
  const gate = await requireStaff()
  if (!gate.ok) return { res: gate.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) }
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization' }, { status: 403 }) }
  }
  return { gate, orgId }
}

/** One coach row, confirmed to belong to this tournament. */
async function mine(orgId: string, subId: string, tournamentId: string) {
  const cur = await getSubmission(orgId, subId)
  if (!cur || cur.formType !== 'coach' || String(cur.data?.tournamentId || '') !== tournamentId) return null
  return cur
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const sp = new URL(req.url).searchParams

  const one = String(sp.get('id') || '').trim()
  const token = String(sp.get('token') || '').trim()
  if (one || token) {
    let submission = one ? await mine(g.orgId, one, params.id) : null
    if (!submission && token) {
      // Look the token up, then run it through the same ownership check so a
      // token from another org's event can't be read here.
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "OrgFormSubmission" WHERE "orgId" = ? AND "formType" = 'coach' AND "passToken" = ? LIMIT 1`,
        g.orgId, token)
      const hit = String(rows?.[0]?.id || '')
      if (hit) submission = await mine(g.orgId, hit, params.id)
    }
    if (!submission) return NextResponse.json({ error: 'Coach not found in this tournament' }, { status: 404 })
    return NextResponse.json({ submission })
  }

  const q = String(sp.get('q') || '').trim()
  const team = String(sp.get('team') || '')
  const sortParam = String(sp.get('sort') || 'newest')
  const sort = (['newest', 'oldest', 'name'].includes(sortParam) ? sortParam : 'newest') as 'newest' | 'oldest' | 'name'
  const limit = Math.max(1, Math.min(20000, parseInt(sp.get('limit') || '200', 10) || 200))
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
  const archived = sp.get('archived') === '1' ? 'only' as const : 'live' as const
  const scope = { orgId: g.orgId, formType: 'coach', tournamentId: params.id }

  try {
    const [submissions, total, grandTotal, teams, checkedIn, archivedTotal] = await Promise.all([
      listSubmissions({ ...scope, q, team, sort, limit, offset, archived }),
      countSubmissions({ ...scope, q, team, archived }),
      countSubmissions(scope),
      teamCounts(scope),
      countCheckedIn({ ...scope, q, team }),
      countSubmissions({ ...scope, archived: 'only' }),
    ])
    return NextResponse.json({
      submissions, total, grandTotal, teams, checkedIn, archivedTotal,
      archived: archived === 'only', limit, offset,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load', submissions: [], total: 0, grandTotal: 0, teams: [] },
      { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any
  const who = String(g.gate.session?.user?.name || g.gate.session?.user?.email || g.gate.userId || '')

  if (body?.clearCheckIns === true) {
    const team = body?.team ? String(body.team) : undefined
    const cleared = await clearCheckIns({ orgId: g.orgId, formType: 'coach', tournamentId: params.id, team })
    return NextResponse.json({ ok: true, cleared })
  }

  const subId = String(body?.id || '')
  if (!subId) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })

  if (typeof body?.archive === 'boolean') {
    if (!await mine(g.orgId, subId, params.id)) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    return NextResponse.json({ ok: true, submission: await setArchived(g.orgId, subId, body.archive, who) })
  }

  if (typeof body?.checkIn === 'boolean') {
    if (!await mine(g.orgId, subId, params.id)) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    return NextResponse.json({ ok: true, submission: await setCheckIn(g.orgId, subId, body.checkIn, who) })
  }

  const patch = body?.data && typeof body.data === 'object' ? body.data : {}
  const changes: Record<string, string> = {}
  for (const k of EDITABLE) if (k in patch) changes[k] = String(patch[k] ?? '').trim()
  if (!Object.keys(changes).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  if (!await mine(g.orgId, subId, params.id)) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  return NextResponse.json({ ok: true, submission: await updateSubmissionData(g.orgId, subId, changes, g.gate.userId) })
}

// Permanent delete — a signed waiver is a legal record, so directors/admins only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return NextResponse.json({ error: 'Not your organization' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as any
  const subId = String(body?.id || '')
  if (!subId) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })
  const ok = await deleteSubmission(orgId, subId, 'coach', params.id)
  if (!ok) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
