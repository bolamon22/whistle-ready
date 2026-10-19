import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { archivedOrgIds } from '@/lib/orgArchive'
import { sendChirpDigest } from '@/lib/publicChirp'

export const runtime = 'nodejs'
export const maxDuration = 60

// Hourly (vercel.json). Each organization gets its bundled Chirp chats when its
// interval (3 hours by default, or daily) has passed. Organizations set to
// "after every chat" or "off" are skipped here. Vercel cron sends CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const qs = req.nextUrl.searchParams.get('secret') || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgs: any[] = await prisma.$queryRawUnsafe('SELECT id, name, slug, contactEmail FROM "Organization"').catch(() => [])
  const closed = await archivedOrgIds()
  const results: Record<string, unknown> = {}
  for (const org of orgs) {
    if (closed.has(String(org.id))) continue
    try { results[org.id] = await sendChirpDigest(org) } catch (e: any) { results[org.id] = { sent: false, reason: e?.message } }
  }
  return NextResponse.json({ ok: true, results })
}
