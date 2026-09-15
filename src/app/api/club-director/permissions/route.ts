import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

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
  const effectiveRole = viewingOther ? 'club_director' : role

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
