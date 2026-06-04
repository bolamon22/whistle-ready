import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
export async function POST(req: Request) {
  try {
    const fd = await req.formData(); const file = fd.get('file') as File
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type:'buffer' })
    const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]], { defval:'' })
    if (!rows.length) return NextResponse.json({ error:'No data' }, { status:400 })
    const headers = Object.keys(rows[0])
    const preview = rows.slice(0,3).map(r => Object.fromEntries(headers.map(h=>[h,String(r[h]??'')])))
    return NextResponse.json({ headers, preview, totalRows:rows.length })
  } catch(e) { return NextResponse.json({ error:String(e) }, { status:500 }) }
}
