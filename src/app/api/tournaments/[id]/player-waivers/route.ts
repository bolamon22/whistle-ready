import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, countSubmissions, teamCounts, getSubmission, updateSubmissionData, setCheckIn, clearCheckIns, countCheckedIn, ensurePassToken, setArchived, deleteSubmission } from '@/lib/formSubmissions'
import { playerPassEnabled } from '@/lib/playerPass'

// Player-waiver submissions for ONE tournament (rows in "OrgFormSubmission", see
// src/lib/formSubmissions.ts).
//   GET   ?q=&team=&sort=newest|name|jersey&limit=&offset=
//         → { submissions, total, grandTotal, teams:[{name,count}], limit, offset }
//         Search and paging are server-side so the page stays quick at thousands of waivers.
//         &pass=1 makes sure every returned row has a passToken (the badge sheet prints
//         /pass/<token>/card.png; waivers from before passes existed get one minted here).
//   GET   ?id=<submission id> → { submission } — one row, for the scanned-pass check-in panel.
//   PATCH { id, data: { teamName?, jerseyNumber?, … } } edits the whitelisted fields of one
//         submission and appends an audit entry; the signature / agreement are never editable.
//   PATCH { id, checkIn: true|false }  game-day check-in: marks the player present (or undoes it).
//   PATCH { clearCheckIns: true, team? } clears check-ins for the team (or the whole tournament).
//   PATCH { id, archive: true|false }  archives a player (not attending, test entry…) or restores them.
//         Archived rows keep everything but leave the list, counts, check-in and badges.
//         GET ?archived=1 lists only archived rows; every GET also returns archivedTotal.
//   DELETE { id }  permanently deletes one submission — directors/admins only, no undo.

const EDITABLE = [
  'playerName', 'playerEmail', 'usLacrosse', 'dob', 'gender', 'grade', 'clubName', 'teamName', 'jerseyNumber', 'position',
  'parentName', 'parentEmail', 'parentPhone', 'parent2Name', 'parent2Email', 'parent2Phone',
  'emergencyName', 'emergencyPhone', 'hotel', 'hotelName',
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const sp = new URL(req.url).searchParams
  const one = String(sp.get('id') || '').trim()
  if (one) {
    const submission = await getSubmission(g.orgId, one)
    if (!submission || submission.formType !== 'player' || String(submission.data?.tournamentId || '') !== params.id) {
      return NextResponse.json({ error: 'Player not found in this tournament' }, { status: 404 })
    }
    return NextResponse.json({ submission })
  }
  const q = String(sp.get('q') || '').trim()
  const team = String(sp.get('team') || '')
  const sortParam = String(sp.get('sort') || 'newest')
  const sort = (['newest', 'oldest', 'name', 'jersey'].includes(sortParam) ? sortParam : 'newest') as 'newest' | 'oldest' | 'name' | 'jersey'
  const limit = Math.max(1, Math.min(20000, parseInt(sp.get('limit') || '100', 10) || 100))
  const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
  const archived = sp.get('archived') === '1' ? 'only' as const : 'live' as const
  const scope = { orgId: g.orgId, formType: 'player', tournamentId: params.id }
  try {
    const [submissions, total, grandTotal, teams, checkedIn, playerPass, archivedTotal] = await Promise.all([
      listSubmissions({ ...scope, q, team, sort, limit, offset, archived }),
      countSubmissions({ ...scope, q, team, archived }),
      countSubmissions(scope),
      teamCounts(scope),
      countCheckedIn({ ...scope, q, team }),
      playerPassEnabled(g.orgId),
      countSubmissions({ ...scope, archived: 'only' }),
    ])
    if (sp.get('pass') === '1' && playerPass) {
      for (const s of submissions) if (!s.passToken) s.passToken = await ensurePassToken(g.orgId, s.id)
    }
    return NextResponse.json({ submissions, total, grandTotal, teams, checkedIn, playerPass, archivedTotal, archived: archived === 'only', limit, offset })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load', submissions: [], total: 0, grandTotal: 0, teams: [] }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any
  const who = String(g.gate.session?.user?.name || g.gate.session?.user?.email || g.gate.userId || '')

  // Clear a team's (or the tournament's) check-ins — e.g. before day two.
  if (body?.clearCheckIns === true) {
    const team = body?.team ? String(body.team) : undefined
    const cleared = await clearCheckIns({ orgId: g.orgId, formType: 'player', tournamentId: params.id, team })
    return NextResponse.json({ ok: true, cleared })
  }

  const subId = String(body?.id || '')
  if (!subId) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })

  // Archive / restore.
  if (typeof body?.archive === 'boolean') {
    const cur = await getSubmission(g.orgId, subId)
    if (!cur || cur.formType !== 'player' || String(cur.data?.tournamentId || '') !== params.id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    const submission = await setArchived(g.orgId, subId, body.archive, who)
    return NextResponse.json({ ok: true, submission })
  }

  // Game-day check-in toggle.
  if (typeof body?.checkIn === 'boolean') {
    const cur = await getSubmission(g.orgId, subId)
    if (!cur || cur.formType !== 'player' || String(cur.data?.tournamentId || '') !== params.id) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    const submission = await setCheckIn(g.orgId, subId, body.checkIn, who)
    return NextResponse.json({ ok: true, submission })
  }

  const patch = body?.data && typeof body.data === 'object' ? body.data : {}

  const changes: Record<string, string> = {}
  for (const k of EDITABLE) if (k in patch) changes[k] = String(patch[k] ?? '').trim()
  if (!Object.keys(changes).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const cur = await getSubmission(g.orgId, subId)
  if (!cur || cur.formType !== 'player' || String(cur.data?.tournamentId || '') !== params.id) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }
  const submission = await updateSubmissionData(g.orgId, subId, changes, g.gate.userId)
  return NextResponse.json({ ok: true, submission })
}

// Permanent delete — a signed waiver is a legal record, so this is directors/admins only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) return NextResponse.json({ error: 'Not your organization' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as any
  const subId = String(body?.id || '')
  if (!subId) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })
  const ok = await deleteSubmission(orgId, subId, 'player', params.id)
  if (!ok) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
