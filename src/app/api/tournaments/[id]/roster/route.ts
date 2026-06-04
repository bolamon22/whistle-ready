import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(_: Request, { params }: { params:{id:string} }) {
  const r = await prisma.rosterEntry.findMany({ where:{tournamentId:params.id}, include:{worker:true} })
  return NextResponse.json(r)
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  const { workerId, gameTarget, notes } = await req.json()
  const entry = await prisma.rosterEntry.upsert({
    where:{ workerId_tournamentId:{ workerId, tournamentId:params.id } },
    create:{ workerId, tournamentId:params.id, gameTarget:gameTarget??0, notes },
    update:{ gameTarget:gameTarget??0, notes },
    include:{ worker:true },
  })
  return NextResponse.json(entry)
}

export async function DELETE(req: Request, { params }: { params:{id:string} }) {
  const { searchParams } = new URL(req.url)
  const workerId = searchParams.get('workerId')!
  await prisma.rosterEntry.deleteMany({ where:{ workerId, tournamentId:params.id } })
  return NextResponse.json({ ok:true })
}
