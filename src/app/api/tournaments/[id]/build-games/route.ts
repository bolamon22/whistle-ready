import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { refsLookup } from '@/lib/refRules'

// "Build a schedule" on the Assigner (Bo, Oct 19 2026): a head assigner is handed the
// day by a tournament director who may not use Whistle Ready, often as a grid of fields
// and times with a division in each box. They lay out the fields and time slots, fill in
// the boxes, and this makes the games: teams TBD, refs per game from the event's rules.
//
// Body: { date, games: [{ startTime: "HH:MM", location, division }], replaceDay }.
// replaceDay deletes that day's games (and their assignments) first. Game numbers carry on
// from the highest number left in the event, in time and field order.
export async function POST(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!['admin', 'director', 'scheduler'].includes(gate.role)) return NextResponse.json({ error: 'Only the director or scheduler can add games.' }, { status: 403 })
  const b = await req.json().catch(() => null)
  const date = String(b?.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a day' }, { status: 400 })
  const list = (Array.isArray(b?.games) ? b.games : [])
    .map((g: any) => ({ startTime: String(g?.startTime || ''), location: String(g?.location || '').trim(), division: String(g?.division || '').trim() }))
    .filter((g: { startTime: string; location: string; division: string }) => /^\d{2}:\d{2}$/.test(g.startTime) && g.location && g.division)
  if (!list.length) return NextResponse.json({ error: 'Fill in at least one box' }, { status: 400 })
  if (list.length > 2000) return NextResponse.json({ error: 'That is more games than one day can hold' }, { status: 400 })

  if (b.replaceDay) await prisma.game.deleteMany({ where: { tournamentId: params.id, date } })
  const left = await prisma.game.findMany({ where: { tournamentId: params.id }, select: { gameNumber: true } })
  let n = left.reduce((m, g) => Math.max(m, parseInt(g.gameNumber, 10) || 0), 0)
  const fieldNo = (f: string) => { const m = f.match(/(\d+)\s*([A-Za-z]?)/); return m ? Number(m[1]) * 100 + (m[2] ? m[2].toUpperCase().charCodeAt(0) - 64 : 0) : 99999 }
  list.sort((a: any, c: any) => a.startTime.localeCompare(c.startTime) || fieldNo(a.location) - fieldNo(c.location) || a.location.localeCompare(c.location))
  const refsFor = await refsLookup(params.id)
  const data = list.map((g: { startTime: string; location: string; division: string }) => ({
    tournamentId: params.id, gameNumber: String(++n), date, startTime: g.startTime, location: g.location, division: g.division,
    team1: 'TBD', team2: 'TBD', pool: null, refCount: refsFor(g.division),
  }))
  await prisma.game.createMany({ data })
  return NextResponse.json({ created: data.length })
}
