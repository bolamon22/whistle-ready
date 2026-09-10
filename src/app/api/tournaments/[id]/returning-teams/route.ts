import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// Who played before and hasn't signed up yet. `from` takes one id or several
// comma-separated (Bo, Sep 10: invite every past team at once) — clubs are then
// deduped ACROSS those events so nobody gets the same invite twice.

const norm = (x: unknown) => String(x ?? '').trim().toLowerCase()

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const fromIds = [...new Set(String(searchParams.get('from') || '').split(',').map(s => s.trim()).filter(Boolean))]
  if (!fromIds.length) return NextResponse.json({ error: 'from param required' }, { status: 400 })

  const [srcRegs, curRegs, srcEvents] = await Promise.all([
    prisma.teamRegistration.findMany({
      where: { tournamentId: { in: fromIds }, deletedAt: null },
      include: { teams: { select: { teamName: true, division: true } } },
    }),
    prisma.teamRegistration.findMany({
      where: { tournamentId: params.id, deletedAt: null },
      select: { clubName: true, contactEmail: true },
    }),
    prisma.tournament.findMany({ where: { id: { in: fromIds } }, select: { id: true, name: true, startDate: true } }),
  ])

  const currentClubs = new Set(curRegs.map(r => norm(r.clubName)))
  const currentEmails = new Set(curRegs.map(r => norm(r.contactEmail)).filter(Boolean))

  const eventById = new Map(srcEvents.map(t => [t.id, t]))
  const startOf = (id: string) => String(eventById.get(id)?.startDate || '')
  // Newest event first, so the most recent spelling of a club — and its most
  // recent contact — is the one that wins the merge.
  const ordered = [...srcRegs].sort((a, b) => startOf(b.tournamentId).localeCompare(startOf(a.tournamentId)))

  type Row = {
    id: string; clubName: string; contactName: string; contactEmail: string
    numTeams: number; divisions: string[]; registered: boolean
    sources: string[]; lastEvent: string
  }
  const byKey = new Map<string, Row>()
  for (const r of ordered) {
    // One recipient = one invite: keyed on the email when there is one, so the
    // same director under two club spellings still only hears from us once.
    const key = norm(r.contactEmail) || norm(r.clubName)
    if (!key) continue
    const eventName = eventById.get(r.tournamentId)?.name || ''
    const existing = byKey.get(key)
    if (existing) {
      for (const t of r.teams) if (t.division && !existing.divisions.includes(t.division)) existing.divisions.push(t.division)
      if (eventName && !existing.sources.includes(eventName)) existing.sources.push(eventName)
      continue
    }
    byKey.set(key, {
      id: r.id,
      clubName: r.clubName,
      contactName: r.clubContact,
      contactEmail: r.contactEmail,
      numTeams: r.numTeams,
      divisions: [...new Set(r.teams.map(t => t.division).filter(Boolean))],
      registered: currentClubs.has(norm(r.clubName)) || (!!norm(r.contactEmail) && currentEmails.has(norm(r.contactEmail))),
      sources: eventName ? [eventName] : [],
      lastEvent: eventName,
    })
  }

  const rows = [...byKey.values()]
  rows.sort((a, b) => Number(a.registered) - Number(b.registered) || a.clubName.localeCompare(b.clubName))

  return NextResponse.json(rows)
}
