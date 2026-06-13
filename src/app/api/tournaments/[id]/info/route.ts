import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Tournament Info content (medical, parking, lost & found, etc.) shown on the public page.
// Stored as JSON in the hand-migrated AppSetting table under key `tournamentInfo:<id>`.
// Public GET (parents/coaches, no login); POST saves from the staff Settings editor.

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const key = (id: string) => `tournamentInfo:${id}`

// Sensible starter content — editable in Settings. icon = a lucide name the client maps.
export const DEFAULT_INFO = [
  { icon: 'heart-pulse', title: 'Medical & Athletic Trainers', body: 'Athletic trainers are on-site during play. Medical tents are located near the main entrance and the north fields. For emergencies call 911, then notify Tournament HQ.' },
  { icon: 'shirt',       title: 'Lost & Found', body: 'Turn in or claim items at Tournament HQ. Unclaimed items are held for two weeks after the event.' },
  { icon: 'square-parking', title: 'Parking', body: 'Free parking in the main lot. Please keep fire lanes clear and follow staff directions for overflow parking.' },
  { icon: 'scroll-text', title: 'Park Rules', body: 'Service animals welcome; no other pets. No smoking or vaping. Carry out your trash. Spectators must stay behind the designated areas.' },
  { icon: 'utensils',    title: 'Food & Concessions', body: 'Concessions are available on-site during the event. Outside food and drink policies follow the host facility’s rules.' },
  { icon: 'phone',       title: 'Tournament HQ', body: 'Visit the main tent for schedule changes, lost & found, first aid, and general questions.' },
  { icon: 'cloud-lightning', title: 'Weather Policy', body: 'Play pauses for lightning (30-minute clear rule). Watch this page or check HQ for restart times.' },
]

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const row = await prisma.appSetting.findUnique({ where: { key: key(params.id) } })
    if (!row) return NextResponse.json({ sections: DEFAULT_INFO, isDefault: true })
    const parsed = JSON.parse(row.value || '[]')
    const sections = Array.isArray(parsed) ? parsed : (parsed.sections || [])
    return NextResponse.json({ sections, isDefault: false })
  } catch {
    return NextResponse.json({ sections: DEFAULT_INFO, isDefault: true })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const body = await req.json()
    const sections = Array.isArray(body) ? body : (body.sections || [])
    const clean = sections
      .filter((s: any) => s && (s.title || s.body))
      .map((s: any) => ({ icon: String(s.icon || 'info'), title: String(s.title || ''), body: String(s.body || '') }))
    await prisma.appSetting.upsert({
      where: { key: key(params.id) },
      update: { value: JSON.stringify(clean) },
      create: { key: key(params.id), value: JSON.stringify(clean) },
    })
    return NextResponse.json({ ok: true, sections: clean })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save info' }, { status: 500 })
  }
}
