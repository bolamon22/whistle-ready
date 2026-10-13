import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'
import { openableRegistrations } from '@/lib/clubAccess'

const PERMS_PATH = path.join(process.cwd(), 'src', 'lib', 'role-permissions.json')

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  const raw = await readFile(PERMS_PATH, 'utf-8')
  const config = JSON.parse(raw)

  // Staff opening someone else's portal (?userId=) want to see what THAT person
  // sees, so answer with the club_director role's tabs rather than their own.
  // Without this a director viewing a club would get every tab hidden, because
  // the director role has no cd_* keys at all.
  const viewingOther = !!req.nextUrl.searchParams.get('userId')
  let effectiveRole = viewingOther ? 'club_director' : role
  // A staff login can direct a club too: Terry Crowley works events as a field
  // director and runs his own club (Oct 13 2026). On their own portal they get a
  // club director's tabs as soon as they can open one of the club's registrations
  // (lib/clubAccess), the same grant any club director has.
  if (!viewingOther && !['admin', 'club_director', 'coach', 'parent'].includes(role)
    && (await openableRegistrations(String(session.user.id || ''))).length > 0) effectiveRole = 'club_director'

  // Admin always gets all CD permissions
  if (effectiveRole === 'admin') {
    return NextResponse.json({ cd_overview: true, cd_players: true, cd_schedule: true, cd_billing: true })
  }

  const rolePerms = config.roles[effectiveRole] ?? {}
  return NextResponse.json({
    cd_overview:  rolePerms.cd_overview  ?? false,
    cd_players:   rolePerms.cd_players   ?? false,
    cd_schedule:  rolePerms.cd_schedule  ?? false,
    cd_billing:   rolePerms.cd_billing   ?? false,
  })
}
