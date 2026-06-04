import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(req: Request) {
  const{searchParams}=new URL(req.url);const tid=searchParams.get('tournamentId')
  if(!tid)return NextResponse.json({error:'required'},{status:400})
  return NextResponse.json(await prisma.availability.findMany({where:{tournamentId:tid},include:{worker:{select:{id:true,name:true}}}}))
}
export async function POST(req: Request) {
  const{workerId,tournamentId,date,timeSlots}=await req.json()
  return NextResponse.json(await prisma.availability.upsert({where:{workerId_tournamentId_date:{workerId,tournamentId,date}},create:{workerId,tournamentId,date,timeSlots:JSON.stringify(timeSlots??[])},update:{timeSlots:JSON.stringify(timeSlots??[])}}))
}
export async function DELETE(req: Request) {
  const{searchParams}=new URL(req.url)
  await prisma.availability.deleteMany({where:{workerId:searchParams.get('workerId')!,tournamentId:searchParams.get('tournamentId')!,date:searchParams.get('date')!}})
  return NextResponse.json({ok:true})
}
