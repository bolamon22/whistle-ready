import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import path from 'path'

const PERMS_PATH = path.join(process.cwd(), 'src', 'lib', 'role-permissions.json')

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user.role
  const raw = await readFile(PERMS_PATH, 'utf-8')
  const config = JSON.parse(raw)

  // Admin always gets all CD permissions
  if (role === 'admin') {
    return NextResponse.json({ cd_overview: true, cd_players: true, cd_schedule: true, cd_billing: true })
  }

  const rolePerms = config.roles[role] ?? {}
  return NextResponse.json({
    cd_overview:  rolePerms.cd_overview  ?? false,
    cd_players:   rolePerms.cd_players   ?? false,
    cd_schedule:  rolePerms.cd_schedule  ?? false,
    cd_billing:   rolePerms.cd_billing   ?? false,
  })
}
