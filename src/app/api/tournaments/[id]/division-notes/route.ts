import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'
import { readDivisionNotes, setDivisionNote } from '@/lib/divisionNotes'

export const dynamic = 'force-dynamic'

// Division notes for the public schedule page (lib/divisionNotes).
//
//   GET  ?view=public -> what the public page shows: nothing until Teams & pools is
//                        public, like the division view they sit on. Shared-cacheable.
//   GET  (no param)   -> staff get the notes; anyone else the public answer, never
//                        shared-cached (the CDN keys on URL only).
//   PUT  { division, note } -> staff. A blank division is the note for every
//                        division; a blank note removes it.
const EMPTY = { all: '', divisions: {} }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const publicView = new URL(req.url).searchParams.get('view') === 'public'
  const staff = publicView ? false : await isStaffRequest()
  const cache = publicView ? 'public, s-maxage=5, stale-while-revalidate=30' : 'private, no-store'
  if (!staff) {
    const vis = await getPublicVisibility(params.id).catch(() => null)
    if (vis?.pools !== 'live') return NextResponse.json(EMPTY, { headers: { 'Cache-Control': cache } })
  }
  return NextResponse.json(await readDivisionNotes(params.id), { headers: { 'Cache-Control': cache } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => null) as { division?: unknown; note?: unknown } | null
  if (!body || typeof body.note !== 'string') return NextResponse.json({ error: 'Note required' }, { status: 400 })
  const division = typeof body.division === 'string' ? body.division : ''
  try {
    return NextResponse.json(await setDivisionNote(params.id, division, body.note))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'That note didn’t save. Try again.' }, { status: 500 })
  }
}
