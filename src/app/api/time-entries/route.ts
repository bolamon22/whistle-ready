import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay } from '@/lib/roleScope'
// Staff only (had no sign-in check); the hourly rate rides along only for roles
// that see staff pay.
const rate = (e: any, role: string) => (canSeeStaffPay(role) || !e?.worker ? e : { ...e, worker: { ...e.worker, hourlyRate: null } })
export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{searchParams}=new URL(req.url);const tid=searchParams.get('tournamentId')
  if(!tid)return NextResponse.json({error:'required'},{status:400})
  return NextResponse.json((await prisma.timeEntry.findMany({where:{tournamentId:tid},include:{worker:{select:{id:true,name:true,hourlyRate:true,defaultRole:true}}},orderBy:[{date:'asc'},{clockIn:'asc'}]})).map((e: any) => rate(e, gate.role)))
}
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit}=await req.json()
  return NextResponse.json(rate(await prisma.timeEntry.create({data:{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit:isManualEdit??false},include:{worker:{select:{id:true,name:true,hourlyRate:true}}}}), gate.role),{status:201})
}
