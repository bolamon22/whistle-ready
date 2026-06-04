import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { PayRates, roleLabel } from '@/lib/utils'

function calcHours(e:{clockIn:string|null;clockOut:string|null;hoursManual:number|null}):number {
  if(e.hoursManual!=null)return e.hoursManual
  if(e.clockIn&&e.clockOut){const[ih,im]=e.clockIn.split(':').map(Number);const[oh,om]=e.clockOut.split(':').map(Number);return Math.max(0,(oh*60+om-(ih*60+im))/60)}
  return 0
}

export async function GET(_: Request, { params }: { params:{id:string} }) {
  const tournament = await prisma.tournament.findUnique({ where:{id:params.id} })
  if (!tournament) return NextResponse.json({ error:'Not found' }, { status:404 })
  const payRates: PayRates = JSON.parse(tournament.payRates)
  const assignments = await prisma.assignment.findMany({ where:{game:{tournamentId:params.id}}, include:{worker:true,game:{select:{gameNumber:true,date:true,startTime:true,division:true,location:true}}}, orderBy:[{game:{date:'asc'}},{game:{startTime:'asc'}}] })
  const timeEntries = await prisma.timeEntry.findMany({ where:{tournamentId:params.id}, include:{worker:true}, orderBy:[{date:'asc'},{clockIn:'asc'}] })
  const map=new Map<string,{worker:{id:string;name:string;certLevel:string;defaultRole:string;hourlyRate:number|null;payMethod:string;payHandle:string|null};games:unknown[];timeEntries:unknown[];totalPay:number}>()
  const ensure=(w:{id:string;name:string;certLevel:string;defaultRole:string;hourlyRate:number|null;payMethod:string;payHandle:string|null})=>{if(!map.has(w.id))map.set(w.id,{worker:w,games:[],timeEntries:[],totalPay:0});return map.get(w.id)!}
  for(const a of assignments){const e=ensure(a.worker);e.games.push({gameNumber:a.game.gameNumber,date:a.game.date,startTime:a.game.startTime,division:a.game.division,location:a.game.location,role:roleLabel(a.role),pay:a.payRate});e.totalPay+=a.payRate}
  for(const te of timeEntries){const e=ensure(te.worker);const hours=calcHours(te);const pay=hours*(te.worker.hourlyRate??0);e.timeEntries.push({date:te.date,clockIn:te.clockIn,clockOut:te.clockOut,hoursManual:te.hoursManual,notes:te.notes,hours,pay});e.totalPay+=pay}
  return NextResponse.json({ summary:[...map.values()].sort((a,b)=>a.worker.name.localeCompare(b.worker.name)), tournamentName:tournament.name, tournamentLogo:tournament.logoUrl||'' })
}
