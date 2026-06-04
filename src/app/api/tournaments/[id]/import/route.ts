import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import prisma from '@/lib/db'
import { excelSerialToDate, excelSerialToTime } from '@/lib/utils'

function parseDate(val: unknown): string {
  if (typeof val==='number') return excelSerialToDate(val)
  if (typeof val==='string') { const d=new Date(val); if(!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  return String(val)
}
function parseTime(val: unknown): string {
  if (typeof val==='number') return excelSerialToTime(val)
  if (typeof val==='string') { const m=val.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if(m){let h=parseInt(m[1],10);const ap=m[3]?.toUpperCase();if(ap==='PM'&&h!==12)h+=12;if(ap==='AM'&&h===12)h=0;return`${String(h).padStart(2,'0')}:${m[2]}`} }
  return String(val)
}
function autoDetect(headers: string[]) {
  const find=(...c:string[])=>c.map(k=>headers.find(h=>h.toLowerCase().replace(/\s+/g,'')===k.toLowerCase().replace(/\s+/g,''))).find(Boolean)??''
  return { gameNumber:find('GameNumber','Game Number','Game#'), date:find('GameDate','Game Date','Date'), startTime:find('StartTime','Start Time','Time'), division:find('Division','division'), pool:find('Pool','pool'), location:find('Location','Field','location'), team1:find('Team1','Team 1','Home'), team2:find('Team2','Team 2','Away') }
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  try {
    const fd = await req.formData(); const file = fd.get('file') as File; const mj = fd.get('mapping') as string|null
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type:'buffer' })
    const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], { defval:'' })
    if (!rows.length) return NextResponse.json({ error:'No data' }, { status:400 })
    const mapping = mj ? JSON.parse(mj) : autoDetect(Object.keys(rows[0]))

    // Get tournament division rules for ref count
    const tournament = await prisma.tournament.findUnique({ where:{id:params.id} })
    const divRules: Record<string,number> = tournament ? JSON.parse(tournament.divisionRules||'{}') : {}

    const dateSet = new Set<string>()
    const games = rows.filter(r=>String(r[mapping.gameNumber]??'').trim()).map(r=>{
      const date=parseDate(r[mapping.date]??''); const startTime=parseTime(r[mapping.startTime]??'')
      const division=String(r[mapping.division]??'')
      dateSet.add(date)
      // Determine ref count from division rules
      let refCount=2
      for (const [keyword, count] of Object.entries(divRules)) {
        if (division.toLowerCase().includes(keyword.toLowerCase())) { refCount=count; break }
      }
      return { tournamentId:params.id, gameNumber:String(r[mapping.gameNumber]??''), date, startTime, division, pool:mapping.pool?String(r[mapping.pool]??'')||null:null, location:String(r[mapping.location]??''), team1:String(r[mapping.team1]??''), team2:String(r[mapping.team2]??''), refCount }
    })
    await prisma.game.deleteMany({ where:{tournamentId:params.id} })
    await prisma.game.createMany({ data:games })
    await prisma.tournament.update({ where:{id:params.id}, data:{dates:JSON.stringify([...dateSet].sort())} })
    return NextResponse.json({ imported:games.length })
  } catch(e) { return NextResponse.json({ error:String(e) }, { status:500 }) }
}
