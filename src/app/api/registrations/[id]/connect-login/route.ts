import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewerRole } from '@/lib/apiAuth'
import { canOpen } from '@/lib/clubAccess'
import { connectLogin } from '@/lib/claim'

// POST /api/registrations/<id>/connect-login
// An admin connects this registration to the login on its contact email, so it
// shows in that person's club portal without the Account email round trip (Bo,
// Oct 7 2026; lib/claim connectLogin). The registrations page shows whose login it
// is before the admin confirms.
//
// Admin only, like linking a login to a club on the Users page: the portal shows
// rosters, minors' waivers and invoices. An admin previewing another role gets
// that role's answer (viewerRole), so the preview shows what that role can do.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const role = await viewerRole()
  if (!role) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Only an admin can connect a login.' }, { status: 403 })

  let reg: any = null
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, tournamentId, clubName, clubContact, contactEmail FROM "TeamRegistration" WHERE id = ? AND "deletedAt" IS NULL LIMIT 1`, params.id)
    reg = rows?.[0] || null
  } catch { /* answered below */ }
  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })

  const email = String(reg.contactEmail || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'This registration has no contact email.' }, { status: 400 })
  let user: any = null
  try {
    const us = await prisma.$queryRawUnsafe<any[]>(`SELECT id, name, email, role FROM "User" WHERE lower(email) = ? LIMIT 1`, email)
    user = us?.[0] || null
  } catch { /* answered below */ }
  if (!user) return NextResponse.json({ error: `No login uses ${email} yet. Send them the Account email so they can make one.` }, { status: 404 })

  const answer = { name: String(user.name || ''), email, clubName: String(reg.clubName || '') }
  if (await canOpen(String(user.id), String(reg.id))) return NextResponse.json({ ok: true, already: true, rolePromoted: false, role: String(user.role || ''), ...answer })

  const session = await getServerSession(authOptions)
  const by = `staff: ${String((session?.user as any)?.name || (session?.user as any)?.email || 'admin').slice(0, 80)}`
  const done = await connectLogin(String(reg.id), String(user.id), by)
  if (!done) return NextResponse.json({ error: 'That didn’t connect. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true, already: false, rolePromoted: done.rolePromoted, role: done.rolePromoted ? 'club_director' : String(user.role || ''), ...answer })
}
