import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// What a family needs to get to an event, for the parent dashboard (Oct 13 2026):
// each event's venues (name, address, map link, field map) and its org's slug.
// No auth: all of it is already on the public event page, which reads the same
// `venues` column (a venue shows once it has an address or a field map).
// Tournament.venues and orgId are raw columns, not in the Prisma schema.

export const dynamic = 'force-dynamic'

type Venue = { name: string; address: string; mapUrl: string; fieldMapUrl: string }

export async function GET(req: NextRequest) {
  const ids = Array.from(new Set(String(req.nextUrl.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean))).slice(0, 20)
  if (!ids.length) return NextResponse.json({ events: {} })
  const out: Record<string, { venues: Venue[]; orgSlug: string }> = {}
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: string; venues: string | null; slug: string | null }[]>(
      `SELECT t."id" AS id, t."venues" AS venues, o."slug" AS slug FROM "Tournament" t LEFT JOIN "Organization" o ON o."id" = t."orgId" WHERE t."id" IN (${ids.map(() => '?').join(',')})`, ...ids)
    for (const r of rows) {
      let venues: Venue[] = []
      try {
        const raw = JSON.parse(r.venues || '[]')
        const list = Array.isArray(raw) ? raw : (raw?.venues || [])
        venues = (Array.isArray(list) ? list : [])
          .filter((v: any) => v && (v.address || v.fieldMapUrl))
          .map((v: any) => ({ name: String(v.name || ''), address: String(v.address || ''), mapUrl: String(v.mapUrl || ''), fieldMapUrl: String(v.fieldMapUrl || '') }))
      } catch { /* no venues */ }
      out[String(r.id)] = { venues, orgSlug: String(r.slug || '') }
    }
  } catch (e) {
    console.error('[public/event-info]', e)
  }
  return NextResponse.json({ events: out }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
