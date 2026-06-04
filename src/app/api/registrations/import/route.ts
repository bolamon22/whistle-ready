import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(req: Request) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File
    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[wb.SheetNames[0]], { defval: '' }
    )
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    return NextResponse.json({ headers, rows, count: rows.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
