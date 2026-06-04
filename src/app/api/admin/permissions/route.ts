import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'

const PERMS_PATH = path.join(process.cwd(), 'src', 'lib', 'role-permissions.json')

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = await readFile(PERMS_PATH, 'utf-8')
  return NextResponse.json(JSON.parse(raw))
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { roles } = await req.json()
  const raw = await readFile(PERMS_PATH, 'utf-8')
  const current = JSON.parse(raw)
  current.roles = roles
  await writeFile(PERMS_PATH, JSON.stringify(current, null, 2), 'utf-8')
  return NextResponse.json({ ok: true })
}
