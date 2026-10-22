import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { parsePayRates, roleLabel } from '@/lib/utils'
import { requireStaffPay } from '@/lib/apiAuth'
import { assignmentPayGroups, entryHours, payGroupsLabel, seesPay, timeEntryPayGroups } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
import { eventSideOf } from '@/lib/eventTeamsStore'
import { payEditsFor } from '@/lib/payEdit'

export async function GET(_: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  // Staff pay (Oct 2026): director, admin or assigner. Any staff, the scheduler
  // included, could read every official's pay here.
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  // Each assigner sees only their pay groups (Bo, Oct 13 2026: one runs boys refs,
  // one girls refs, and neither needs the scorekeepers' pay). A person with pay in
  // a hidden group too comes back `partial`: the director marks them paid.
  const scope = await payScopeFor(gate.role, gate.userId)
  // A division that says neither boys nor girls goes by the event's teams (lib/eventTeams).
  const side = await eventSideOf(params.id)
  const tournament = await prisma.tournament.findUnique({ where:{id:params.id} })
  if (!tournament) return NextResponse.json({ error:'Not found' }, { status:404 })
  const payRates = parsePayRates(tournament.payRates)
  const assignments = await prisma.assignment.findMany({ where:{game:{tournamentId:params.id}}, include:{worker:true,game:{select:{gameNumber:true,date:true,startTime:true,division:true,location:true}}}, orderBy:[{game:{date:'asc'}},{game:{startTime:'asc'}}] })
  // Pay set by hand on a game (lib/payEdit): each game says so, with the note.
  const edits = await payEditsFor(assignments)
  const timeEntries = await prisma.timeEntry.findMany({ where:{tournamentId:params.id}, include:{worker:true}, orderBy:[{date:'asc'},{clockIn:'asc'}] })
  const map=new Map<string,{worker:{id:string;name:string;certLevel:string;defaultRole:string;hourlyRate:number|null;payMethod:string;payHandle:string|null};games:unknown[];timeEntries:unknown[];totalPay:number;hidden:number}>()
  const ensure=(w:{id:string;name:string;certLevel:string;defaultRole:string;hourlyRate:number|null;payMethod:string;payHandle:string|null})=>{if(!map.has(w.id))map.set(w.id,{worker:w,games:[],timeEntries:[],totalPay:0,hidden:0});return map.get(w.id)!}
  for(const a of assignments){const e=ensure(a.worker);if(!seesPay(scope,assignmentPayGroups(a.role,a.game.division,a.worker.gender,side))){e.hidden++;continue}e.games.push({id:a.id,edited:edits.has(a.id)?{note:edits.get(a.id)!.note,by:edits.get(a.id)!.by,at:edits.get(a.id)!.at,was:edits.get(a.id)!.was}:null,gameNumber:a.game.gameNumber,date:a.game.date,startTime:a.game.startTime,division:a.game.division,location:a.game.location,role:roleLabel(a.role),pay:a.payRate});e.totalPay+=a.payRate}
  for(const te of timeEntries){const e=ensure(te.worker);if(!seesPay(scope,timeEntryPayGroups(te.worker))){e.hidden++;continue}const hours=entryHours(te);const pay=hours*(te.worker.hourlyRate??0);e.timeEntries.push({date:te.date,clockIn:te.clockIn,clockOut:te.clockOut,hoursManual:te.hoursManual,notes:te.notes,hours,pay});e.totalPay+=pay}
  const summary=[...map.values()].filter(e=>e.games.length||e.timeEntries.length).map(({hidden,...e})=>({...e,partial:hidden>0}))
  return NextResponse.json({ summary:summary.sort((a,b)=>a.worker.name.localeCompare(b.worker.name)), scope:{ all:scope.all, groups:scope.groups, label:payGroupsLabel(scope.groups) }, tournamentName:tournament.name, tournamentLogo:tournament.logoUrl||'' })
}
