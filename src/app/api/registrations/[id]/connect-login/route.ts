import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewerRole } from '@/lib/apiAuth'
import { canOpen, openableRegistrations } from '@/lib/clubAccess'
import { connectLogin } from '@/lib/claim'
import { nameKey } from '@/lib/names'

// /api/registrations/<id>/connect-login
//   GET  whose login is on this registration's contact email and what it already
//        opens, shown before connecting.
//   POST connect it, so the registration shows in that person's club portal
//        without the Account email round trip (Bo, Oct 7 2026; lib/claim
//        connectLogin).
//
// Logins aren't email-checked: anyone can make one with any address. That is why
// the Account email, whose link only the inbox owner can use, stays the default
// way in; connecting by hand is for when the admin knows the login is theirs. A
// login that already opens this club at another event is good evidence; one that
// opens nothing is not, and the page says so.
//
// Admin only, like linking a login to a club on the Users page: the portal shows
// rosters, minors' waivers and invoices. An admin previewing another role gets
// that role's answer (viewerRole), so the preview shows what that role can do.

type Found = { reg: any; user: any; email: string } | { res: NextResponse }

async function find(id: string): Promise<Found> {
  const role = await viewerRole()
  if (!role) return { res: NextResponse.json({ error: 'Sign in first' }, { status: 401 }) }
  if (role !== 'admin') return { res: NextResponse.json({ error: 'Only an admin can connect a login.' }, { status: 403 }) }

  let reg: any = null
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, tournamentId, clubName, clubContact, contactEmail FROM "TeamRegistration" WHERE id = ? AND "deletedAt" IS NULL LIMIT 1`, id)
    reg = rows?.[0] || null
  } catch { /* answered below */ }
  if (!reg) return { res: NextResponse.json({ error: 'Registration not found' }, { status: 404 }) }

  const email = String(reg.contactEmail || '').trim().toLowerCase()
  if (!email) return { res: NextResponse.json({ error: 'This registration has no contact email.' }, { status: 400 }) }
  let user: any = null
  try {
    const us = await prisma.$queryRawUnsafe<any[]>(`SELECT id, name, email, role, createdAt FROM "User" WHERE lower(email) = ? LIMIT 1`, email)
    user = us?.[0] || null
  } catch { /* answered below */ }
  if (!user) return { res: NextResponse.json({ error: `No login uses ${email} yet. Send them the Account email so they can make one.` }, { status: 404 }) }
  return { reg, user, email }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const f = await find(params.id)
  if ('res' in f) return f.res
  const { reg, user, email } = f
  const opens = await openableRegistrations(String(user.id))
  const events = new Map<string, string>()
  const ids = [...new Set(opens.map(o => o.tournamentId))]
  if (ids.length) {
    try {
      const ts = await prisma.$queryRawUnsafe<any[]>(`SELECT id, name FROM "Tournament" WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      for (const t of ts || []) events.set(String(t.id), String(t.name || ''))
    } catch { /* names are a nicety */ }
  }
  let createdAt = ''
  try { const d = new Date(user.createdAt); if (!isNaN(d.getTime())) createdAt = d.toISOString() } catch { /* left blank */ }
  return NextResponse.json({
    name: String(user.name || ''), email, role: String(user.role || ''), createdAt,
    already: opens.some(o => o.id === String(reg.id)),
    sameClub: opens.some(o => o.id !== String(reg.id) && nameKey(o.clubName) === nameKey(String(reg.clubName || ''))),
    opens: opens.filter(o => o.id !== String(reg.id)).slice(-6).reverse().map(o => ({ clubName: o.clubName, event: events.get(o.tournamentId) || '' })),
    openCount: opens.filter(o => o.id !== String(reg.id)).length,
  })
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const f = await find(params.id)
  if ('res' in f) return f.res
  const { reg, user, email } = f

  const answer = { name: String(user.name || ''), email, clubName: String(reg.clubName || '') }
  if (await canOpen(String(user.id), String(reg.id))) return NextResponse.json({ ok: true, already: true, rolePromoted: false, role: String(user.role || ''), ...answer })

  const session = await getServerSession(authOptions)
  const by = `staff: ${String((session?.user as any)?.name || (session?.user as any)?.email || 'admin').slice(0, 80)}`
  const done = await connectLogin(String(reg.id), String(user.id), by)
  if (!done) return NextResponse.json({ error: 'That didn’t connect. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, already: false, rolePromoted: done.rolePromoted, role: done.rolePromoted ? 'club_director' : String(user.role || ''), ...answer })
}
