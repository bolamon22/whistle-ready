import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { csv1099, threshold1099 } from '@/lib/form1099'
import { rows1099 } from '@/lib/form1099Store'

export const runtime = 'nodejs'

// The 1099 export (lib/form1099): the caller's own organization only (View as: the
// viewed one). Directors (the Head Assigner on the Assigner plan) and admins: pay is
// private, and an assigner sees only his own pay groups, which a year's total can't
// honor. GET ?year=2026 -> { year, threshold, rows, payers }; &format=csv -> the file.
export async function GET(req: NextRequest) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const now = new Date().getFullYear()
  const y = Number(req.nextUrl.searchParams.get('year'))
  const year = Number.isInteger(y) && y >= 2015 && y <= now + 1 ? y : now
  const { rows, payers } = await rows1099(gate.orgId, year)
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    const payer = req.nextUrl.searchParams.get('payer') || ''
    const list = payer ? rows.filter(r => r.payerKey === payer) : rows
    return new NextResponse(csv1099(list, year), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="1099-${year}.csv"`, 'Cache-Control': 'no-store' },
    })
  }
  return NextResponse.json({ year, threshold: threshold1099(year), rows, payers }, { headers: { 'Cache-Control': 'no-store' } })
}
