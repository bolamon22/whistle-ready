import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canonicalTeamName, teamsInDivision, sendPushToFollowers } from '@/lib/follows'

// In-app broadcasts/announcements. Stored as JSON in the hand-migrated AppSetting
// table (no schema migration needed): key `announcements:<id>`.
// GET is public (the public page banner reads it). POST/DELETE require a logged-in
// staffer whose role the director has allowed to broadcast (key `broadcastRoles:<id>`).
//
// A broadcast can also go to the phones of people following the teams it is
// for (lib/follows): everyone at the event, one division, or one team. The
// banner is still the record; the push is a pointer to it. Coaches and staff
// are not followers, so those audiences stay banner-only until messaging
// reaches them some other way.

type Audience = { type?: string; division?: string; team?: string }

/** The teams whose followers should hear this, `null` for every follower at the
 *  event, or `[]` when the audience has no followers to reach (coaches, staff,
 *  an unknown team). */
async function followerTargets(tournamentId: string, aud: Audience): Promise<string[] | null> {
  switch (aud.type) {
    case 'everyone': return null
    case 'division': {
      const division = String(aud.division || '').trim()
      return division ? teamsInDivision(tournamentId, division) : null
    }
    case 'team': {
      const name = await canonicalTeamName(tournamentId, String(aud.team || ''))
      return name ? [name] : []
    }
    default: return []
  }
}

async function ensureTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  } catch { /* ignore */ }
}

const annKey = (id: string) => `announcements:${id}`
const rolesKey = (id: string) => `broadcastRoles:${id}`
const DEFAULT_BROADCAST_ROLES = ['director', 'assigner']

async function readJson(key: string, fallback: any) {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return fallback
  try { const v = JSON.parse(row.value || 'null'); return v ?? fallback } catch { return fallback }
}

// Admin and director are always allowed; otherwise the role must be in the configured list.
async function canBroadcast(id: string, role: string | undefined) {
  if (!role) return false
  if (role === 'admin' || role === 'director') return true
  const allowed = await readJson(rolesKey(id), DEFAULT_BROADCAST_ROLES)
  return Array.isArray(allowed) && allowed.includes(role)
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTable()
    const list = await readJson(annKey(params.id), [])
    return NextResponse.json({ announcements: Array.isArray(list) ? list : [] })
  } catch {
    return NextResponse.json({ announcements: [] })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await canBroadcast(params.id, role))) return NextResponse.json({ error: 'Not allowed to broadcast' }, { status: 403 })

    await ensureTable()
    const body = await req.json()
    const text = String(body.text || '').trim()
    if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      text,
      scope: String(body.scope || 'Everyone'),
      urgent: Boolean(body.urgent),
      createdAt: new Date().toISOString(),
      createdBy: session.user?.name || session.user?.email || 'Staff',
    }
    const list = await readJson(annKey(params.id), [])
    const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, 50)
    await prisma.appSetting.upsert({
      where: { key: annKey(params.id) },
      update: { value: JSON.stringify(next) },
      create: { key: annKey(params.id), value: JSON.stringify(next) },
    })

    // Phones hear only when the sender left "alert followers" on. Sent after
    // the banner is saved, so a tap on the alert lands on a page that shows it.
    // Each broadcast is its own notification (tag by entry id): a weather delay
    // and the restart notice an hour later must not replace each other.
    let notified: { sent: number; failed: number } | null = null
    if (body.notify === true) {
      const targets = await followerTargets(params.id, body.audience || {})
      if (targets === null || targets.length > 0) {
        const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true } }).catch(() => null)
        const tname = t?.name || 'Whistle Ready'
        notified = await sendPushToFollowers(params.id, targets, {
          title: entry.urgent ? `Urgent: ${tname}` : tname,
          body: text.length > 240 ? `${text.slice(0, 237)}...` : text,
          url: `/tournaments/${params.id}/public`,
          tag: `ann:${params.id}:${entry.id}`,
        })
      } else {
        notified = { sent: 0, failed: 0 }
      }
    }
    return NextResponse.json({ ok: true, announcement: entry, notified })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to post' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role as string | undefined
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await canBroadcast(params.id, role))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    await ensureTable()
    const delId = req.nextUrl.searchParams.get('id')
    const list = await readJson(annKey(params.id), [])
    const next = (Array.isArray(list) ? list : []).filter((a: any) => a.id !== delId)
    await prisma.appSetting.upsert({
      where: { key: annKey(params.id) },
      update: { value: JSON.stringify(next) },
      create: { key: annKey(params.id), value: JSON.stringify(next) },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 })
  }
}
