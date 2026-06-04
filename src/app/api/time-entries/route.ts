import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(req: Request) {
  const{searchParams}=new URL(req.url);const tid=searchParams.get('tournamentId')
  if(!tid)return NextResponse.json({error:'required'},{status:400})
  return NextResponse.json(await prisma.timeEntry.findMany({where:{tournamentId:tid},include:{worker:{select:{id:true,name:true,hourlyRate:true,defaultRole:true}}},orderBy:[{date:'asc'},{clockIn:'asc'}]}))
}
export async function POST(req: Request) {
  const{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit}=await req.json()
  return NextResponse.json(await prisma.timeEntry.create({data:{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit:isManualEdit??false},include:{worker:{select:{id:true,name:true,hourlyRate:true}}}}),{status:201})
}
