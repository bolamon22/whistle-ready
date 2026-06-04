import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET() { return NextResponse.json(await prisma.worker.findMany({ orderBy:{name:'asc'} })) }
export async function POST(req: Request) {
  const body = await req.json()
  if (Array.isArray(body.bulk)) {
    let count=0
    for(const s of body.bulk){
      await prisma.worker.create({data:{name:String(s.name),email:s.email||null,phone:s.phone||null,certLevel:String(s.certLevel??'youth'),defaultRole:String(s.defaultRole??'ref'),roles:JSON.stringify(s.roles??[s.defaultRole??'ref']),isAssigner:Boolean(s.isAssigner),gender:String(s.gender??'both'),payRateOverride:s.payRateOverride!=null?Number(s.payRateOverride):null,hourlyRate:s.hourlyRate!=null?Number(s.hourlyRate):null,payMethod:String(s.payMethod??'check'),payHandle:s.payHandle||null}});count++
    }
    return NextResponse.json({ created:count }, { status:201 })
  }
  const{name,email,phone,certLevel,defaultRole,roles,isAssigner,gender,payRateOverride,hourlyRate,payMethod,payHandle,notes}=body
  return NextResponse.json(await prisma.worker.create({data:{name,email:email||null,phone:phone||null,certLevel:certLevel??'youth',defaultRole:defaultRole??'ref',roles:JSON.stringify(roles??[defaultRole??'ref']),isAssigner:isAssigner??false,gender:gender??'both',payRateOverride:payRateOverride??null,hourlyRate:hourlyRate??null,payMethod:payMethod??'check',payHandle:payHandle||null,notes:notes||null}}),{status:201})
}
