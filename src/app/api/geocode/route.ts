import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { geocodeCached } from '@/lib/geocodeStore'

// GET ?q=<street address> → { found, lat, lng, matched }. Builder › Hotels asks it
// when staff type a hotel's address, to put the hotel on the hotels page map.
// Staff only (tournament_setup), so it can't be used as a free lookup service.
export async function GET(req: NextRequest) {
  const gate = await requireFeature('tournament_setup')
  if (!gate.ok) return gate.res
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/\s+/g, ' ').trim()
  if (q.length < 6 || q.length > 200) return NextResponse.json({ error: 'Type the street, city and state' }, { status: 400 })
  const hit = await geocodeCached(q, { timeoutMs: 8000 })
  return NextResponse.json(hit ? { found: true, lat: hit.lat, lng: hit.lng, matched: hit.matched || '' } : { found: false })
}
