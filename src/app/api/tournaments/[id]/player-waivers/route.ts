import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'

// Player-waiver submissions for ONE tournament. They live in the org's form-submissions
// blob (AppSetting `orgFormSubmissions:{orgId}`, a JSON array) tagged with data.tournamentId.
//   GET   → list them (staff of this org, or admin)
//   PATCH → { id, data: { teamName?, jerseyNumber?, … } } edits the whitelisted fields of one
//           submission and appends an audit entry; the signature / agreement are never editable.

const KEY = (orgId: string) => `orgFormSubmissions:${orgId}`
const EDITABLE = [
  'playerName', 'playerEmail', 'usLacrosse', 'dob', 'gender', 'grade', 'teamName', 'jerseyNumber',
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

function isForTournament(s: any, id: string) {
  return s && s.formType === 'player' && s?.data?.tournamentId === id
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY(g.orgId) } })
    const all = row ? JSON.parse(row.value || '[]') : []
    const subs = (Array.isArray(all) ? all : []).filter((s: any) => isForTournament(s, params.id))
    return NextResponse.json({ submissions: subs })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any
  const subId = String(body?.id || '')
  const patch = body?.data && typeof body.data === 'object' ? body.data : {}
  if (!subId) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })

  const changes: Record<string, string> = {}
  for (const k of EDITABLE) if (k in patch) changes[k] = String(patch[k] ?? '').trim()
  if (!Object.keys(changes).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const key = KEY(g.orgId)
  const row = await prisma.appSetting.findUnique({ where: { key } })
  const all: any[] = row ? (JSON.parse(row.value || '[]') || []) : []
  const idx = all.findIndex(s => s?.id === subId && isForTournament(s, params.id))
  if (idx < 0) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const before = all[idx]
  const changed = Object.keys(changes).filter(k => String(before.data?.[k] ?? '') !== changes[k])
  if (changed.length) {
    all[idx] = {
      ...before,
      data: { ...(before.data || {}), ...changes },
      edits: [...(Array.isArray(before.edits) ? before.edits : []), { at: new Date().toISOString(), by: g.gate.userId, fields: changed }],
    }
    await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(all) } })
  }
  return NextResponse.json({ ok: true, submission: all[idx] })
}
