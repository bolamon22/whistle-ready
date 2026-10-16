import { NextRequest, NextResponse } from 'next/server'
import { tournamentOrgId } from '@/lib/org'

// Event id -> the organization that runs it, for middleware (lib/orgMembers: a login
// that works in more than one organization sees an event only while working in the
// event's own organization). A separate tiny route like /api/event-slug: middleware
// runs on the edge, and this keeps the database on the node runtime.
//
// Public on purpose: the event's own pages already say whose event it is. Cached for a
// minute at the edge; an event changes organization only when an admin moves it.
export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get('id') || '').trim()
  if (!id || id.length > 64) return NextResponse.json({ orgId: null }, { status: 400 })
  return NextResponse.json({ orgId: await tournamentOrgId(id) }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
