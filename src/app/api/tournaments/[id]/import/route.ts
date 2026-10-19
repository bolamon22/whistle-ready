import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import prisma from '@/lib/db'
import { excelSerialToDate, excelSerialToTime } from '@/lib/utils'
import { requireStaff } from '@/lib/apiAuth'
import { refsLookup } from '@/lib/refRules'
import { findGrids, gridGames } from '@/lib/gridSchedule'

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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  // Assigners staff games; adding or importing them is the scheduler's job (Bo, Oct 13 2026).
  if (gate.role === 'assigner') return NextResponse.json({ error: 'Assigners can’t add or import games.' }, { status: 403 })
  try {
    const fd = await req.formData(); const file = fd.get('file') as File; const mj = fd.get('mapping') as string|null
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type:'buffer' })
    // Each game's refs from the event's officials setting: its standard officials per game
    // and the division exceptions (lib/refRules), like every other way games are made.
    // This read only the exceptions and gave every other game 2, so a Head Assigner who
    // set 1 or 3 per game in Pay rates got 2 on every imported game.
    const refsFor = await refsLookup(params.id)

    // A field grid (lib/gridSchedule): `grid` carries the day picked for each grid found.
    const gj = fd.get('grid') as string|null
    if (gj) {
      const dates: Record<string,string> = JSON.parse(gj).dates || {}
      const grids = findGrids(wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) })))
      const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
      const made = gridGames(grids, g => ok(dates[g.key] || '') ? dates[g.key] : '')
      if (!made.length) return NextResponse.json({ error:'Pick a day for at least one grid.' }, { status:400 })
      const data = made.map(g => ({ tournamentId:params.id, ...g, pool:null, refCount:refsFor(g.division) }))
      await prisma.game.deleteMany({ where:{tournamentId:params.id} })
      await prisma.game.createMany({ data })
      await prisma.tournament.update({ where:{id:params.id}, data:{dates:JSON.stringify(Array.from(new Set(made.map(g=>g.date))).sort())} })
      return NextResponse.json({ imported:data.length })
    }

    const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], { defval:'' })
    if (!rows.length) return NextResponse.json({ error:'No data' }, { status:400 })
    const mapping = mj ? JSON.parse(mj) : autoDetect(Object.keys(rows[0]))

    const dateSet = new Set<string>()
    const games = rows.filter(r=>String(r[mapping.gameNumber]??'').trim()).map(r=>{
      const date=parseDate(r[mapping.date]??''); const startTime=parseTime(r[mapping.startTime]??'')
      const division=String(r[mapping.division]??'')
      dateSet.add(date)
      const refCount=refsFor(division)
      return { tournamentId:params.id, gameNumber:String(r[mapping.gameNumber]??''), date, startTime, division, pool:mapping.pool?String(r[mapping.pool]??'')||null:null, location:String(r[mapping.location]??''), team1:String(r[mapping.team1]??''), team2:String(r[mapping.team2]??''), refCount }
    })
    await prisma.game.deleteMany({ where:{tournamentId:params.id} })
    await prisma.game.createMany({ data:games })
    await prisma.tournament.update({ where:{id:params.id}, data:{dates:JSON.stringify([...dateSet].sort())} })
    return NextResponse.json({ imported:games.length })
  } catch(e) { return NextResponse.json({ error:String(e) }, { status:500 }) }
}
