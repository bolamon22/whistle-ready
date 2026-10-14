import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { fieldDirectorSees } from '@/lib/roleScope'
import { workerIdForEmail } from '@/lib/staffW9'

// Who can work which days of an event. Staff only (Oct 13 2026): it took no login at
// all, so anyone could read the names on an event's staff or change their days. A
// field director (lib/fieldDirector) reads and sets it only for the scorekeepers,
// athletic trainers and field ops on their own events.

// Staff logins (scorekeepers, refs, trainers, field ops) set their OWN days from their
// home page (components/MyAvailability). Before Oct 13 2026 any staff login could read
// everyone's days and change anyone's, because only the managing roles' page was gated.
// So for anyone but the roles that manage staff, the worker is the one their login
// email matches, never an id from the browser.
const MANAGES = ['admin', 'director', 'assigner', 'scheduler', 'field_director']
async function ownWorker(gate: { role: string; session: any }): Promise<string | null | undefined> {
  if (MANAGES.includes(gate.role)) return undefined // not limited
  return (await workerIdForEmail(String(gate.session?.user?.email || ''))) || null
}

async function fieldDirectorMay(role: string, workerId: string): Promise<boolean> {
  if (role !== 'field_director') return true
  return fieldDirectorSees(await prisma.worker.findUnique({ where: { id: workerId }, select: { roles: true, defaultRole: true } }))
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{searchParams}=new URL(req.url);const tid=searchParams.get('tournamentId')
  if(!tid)return NextResponse.json({error:'required'},{status:400})
  const refused = eventGate(gate, tid); if (refused) return refused
  const rows = await prisma.availability.findMany({where:{tournamentId:tid},include:{worker:{select:{id:true,name:true,roles:true,defaultRole:true}}}})
  const own = await ownWorker(gate)
  const shown = own !== undefined ? rows.filter(r => own && r.workerId === own) : gate.role === 'field_director' ? rows.filter(r => fieldDirectorSees(r.worker)) : rows
  return NextResponse.json(shown.map(r => ({ ...r, worker: r.worker ? { id: r.worker.id, name: r.worker.name } : r.worker })))
}
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{workerId,tournamentId,date,timeSlots}=await req.json()
  const refused = eventGate(gate, tournamentId); if (refused) return refused
  if (!(await fieldDirectorMay(gate.role, String(workerId || '')))) return NextResponse.json({ error: 'Not one of your staff' }, { status: 403 })
  { const own = await ownWorker(gate); if (own !== undefined && (!own || own !== String(workerId || ''))) return NextResponse.json({ error: 'You can only set your own days' }, { status: 403 }) }
  return NextResponse.json(await prisma.availability.upsert({where:{workerId_tournamentId_date:{workerId,tournamentId,date}},create:{workerId,tournamentId,date,timeSlots:JSON.stringify(timeSlots??[])},update:{timeSlots:JSON.stringify(timeSlots??[])}}))
}
export async function DELETE(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{searchParams}=new URL(req.url)
  const refused = eventGate(gate, searchParams.get('tournamentId')); if (refused) return refused
  if (!(await fieldDirectorMay(gate.role, searchParams.get('workerId') || ''))) return NextResponse.json({ error: 'Not one of your staff' }, { status: 403 })
  { const own = await ownWorker(gate); if (own !== undefined && (!own || own !== (searchParams.get('workerId') || ''))) return NextResponse.json({ error: 'You can only set your own days' }, { status: 403 }) }
  await prisma.availability.deleteMany({where:{workerId:searchParams.get('workerId')!,tournamentId:searchParams.get('tournamentId')!,date:searchParams.get('date')!}})
  return NextResponse.json({ok:true})
}
