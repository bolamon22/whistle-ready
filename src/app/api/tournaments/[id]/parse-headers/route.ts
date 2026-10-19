import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireStaff } from '@/lib/apiAuth'
import { findGrids, gridGameCount } from '@/lib/gridSchedule'
export async function POST(req: Request) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const fd = await req.formData(); const file = fd.get('file') as File
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type:'buffer' })
    const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], { defval:'' })
    // A schedule laid out as times down, fields across (lib/gridSchedule): offered as a
    // grid import, since its columns don't map to one game per row.
    const grids = findGrids(wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }) })))
      .map(g => ({ key: g.key, label: g.label, fields: g.fields.length, games: gridGameCount(g), first: g.slots[0]?.time || '', last: g.slots[g.slots.length - 1]?.time || '', dateGuess: g.dateGuess }))
    if (!rows.length && !grids.length) return NextResponse.json({ error:'No data' }, { status:400 })
    const headers = rows.length ? Object.keys(rows[0]) : []
    const preview = rows.slice(0,3).map(r => Object.fromEntries(headers.map(h=>[h,String(r[h]??'')])))
    return NextResponse.json({ headers, preview, totalRows:rows.length, grids })
  } catch(e) { return NextResponse.json({ error:String(e) }, { status:500 }) }
}
