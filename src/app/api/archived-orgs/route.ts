import { NextResponse } from 'next/server'
import { archivedPublicLists } from '@/lib/orgArchive'

// For the middleware: the archived organizations' slugs and their events' ids, whose
// public pages it shows as unavailable (lib/orgArchive). No sign-in; nothing private.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await archivedPublicLists(), { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}
