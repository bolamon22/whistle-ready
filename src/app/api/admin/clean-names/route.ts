import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { cleanName } from '@/lib/names'
import { renameTeamRefs, renameClubRefs } from '@/lib/teamRename'
import { listSubmissions, updateSubmissionData } from '@/lib/formSubmissions'

// One-time (re-runnable) whitespace cleanup for names saved before the write
// paths started trimming: club / contact / team / coach names on registrations,
// and the "Club — Team" tags on player waivers. Renames are carried through
// pools, games, brackets, follows and waivers via the shared helpers.
//
//   POST /api/admin/clean-names            → dry run: lists what would change
//   POST /api/admin/clean-names?apply=1    → applies it
//
// Admin only. Scoped to the admin's organization (all tournaments).
export const dynamic = 'force-dynamic'

type Change = { tournament: string; kind: string; id: string; from: string; to: string; refs?: Record<string, number> }

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (gate.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const apply = new URL(req.url).searchParams.get('apply') === '1'

  const tournaments = gate.orgId
    ? await prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM "Tournament" WHERE "orgId" = ? ORDER BY "createdAt" DESC`, gate.orgId)
    : await prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM "Tournament" ORDER BY "createdAt" DESC`)

  const changes: Change[] = []
  const divisionNotes: Change[] = []

  for (const t of tournaments || []) {
    const regs = await prisma.teamRegistration.findMany({ where: { tournamentId: t.id }, include: { teams: true } })
    for (const r of regs) {
      const club = cleanName(r.clubName)
      const regData: Record<string, string> = {}
      if (club !== r.clubName) regData.clubName = club
      for (const k of ['clubContact', 'clubBasedIn'] as const) {
        const v = cleanName(r[k]); if (v !== r[k]) regData[k] = v
      }
      for (const k of ['contactEmail', 'contactPhone', 'clubWebsite'] as const) {
        const v = String(r[k] || '').trim(); if (v !== r[k]) regData[k] = v
      }
      if (Object.keys(regData).length) {
        const entry: Change = { tournament: t.name, kind: 'registration', id: r.id, from: JSON.stringify(pick(r, Object.keys(regData))), to: JSON.stringify(regData) }
        if (apply) {
          await prisma.teamRegistration.update({ where: { id: r.id }, data: regData })
          if (regData.clubName) entry.refs = await renameClubRefs(t.id, r.clubName, club)
        }
        changes.push(entry)
      }

      for (const tm of r.teams) {
        const teamData: Record<string, string> = {}
        const teamName = cleanName(tm.teamName)
        if (teamName !== tm.teamName) teamData.teamName = teamName
        const teamClub = cleanName(tm.clubName) || club
        if (teamClub !== tm.clubName) teamData.clubName = teamClub
        const coach = cleanName(tm.coachName); if (coach !== tm.coachName) teamData.coachName = coach
        for (const k of ['coachEmail', 'coachPhone'] as const) {
          const v = String(tm[k] || '').trim(); if (v !== tm[k]) teamData[k] = v
        }
        // Divisions are string keys for pools/games/brackets too, but they come
        // from a fixed list — report a stray one rather than rewrite it here.
        const div = cleanName(tm.division)
        if (div !== tm.division) divisionNotes.push({ tournament: t.name, kind: 'division', id: tm.id, from: tm.division, to: div })
        if (Object.keys(teamData).length) {
          const entry: Change = { tournament: t.name, kind: 'team', id: tm.id, from: JSON.stringify(pick(tm, Object.keys(teamData))), to: JSON.stringify(teamData) }
          if (apply) {
            await prisma.registeredTeam.update({ where: { id: tm.id }, data: teamData })
            if (teamData.teamName) entry.refs = await renameTeamRefs(t.id, tm.teamName, teamName, club)
          }
          changes.push(entry)
        }
      }
    }
  }

  // Waiver tags were built from the raw names above, so tidy them the same way.
  const waivers: Change[] = []
  if (gate.orgId) {
    const byId = new Map<string, string>((tournaments || []).map((t: any) => [t.id, t.name]))
    for (let offset = 0; ; offset += 5000) {
      const page = await listSubmissions({ orgId: gate.orgId, formType: 'player', sort: 'oldest', limit: 5000, offset })
      for (const s of page) {
        const d = s.data || {}
        const w: Record<string, string> = {}
        const tn = String(d.teamName ?? '')
        if (tn && tn !== '__other' && cleanName(tn) !== tn) w.teamName = cleanName(tn)
        const cn = String(d.clubName ?? '')
        if (cn && cleanName(cn) !== cn) w.clubName = cleanName(cn)
        if (!Object.keys(w).length) continue
        if (apply) await updateSubmissionData(gate.orgId, s.id, w, 'system')
        waivers.push({ tournament: byId.get(String(d.tournamentId || '')) || '', kind: 'waiver', id: s.id, from: JSON.stringify(pick(d, Object.keys(w))), to: JSON.stringify(w) })
      }
      if (page.length < 5000) break
    }
  }

  return NextResponse.json({
    applied: apply,
    tournaments: (tournaments || []).length,
    summary: { registrations: changes.filter(c => c.kind === 'registration').length, teams: changes.filter(c => c.kind === 'team').length, waivers: waivers.length, divisionNotes: divisionNotes.length },
    changes, waivers, divisionNotes,
  })
}

function pick(obj: any, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of keys) out[k] = obj?.[k]
  return out
}
