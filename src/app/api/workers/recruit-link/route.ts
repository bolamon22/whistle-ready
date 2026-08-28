import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL — prod's still points at old gameday-staff5.vercel.app (found Aug 28)

// POST /api/workers/recruit-link — get (or mint) this org's public recruiting link
// for /join. The link carries a secret code (AppSetting joinCode:{orgId}) so the open
// signup can't be botted; pass {regenerate:true} to rotate the code and kill every
// previously shared link.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res

  let body: { regenerate?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* optional body */ }

  const orgId = gate.role === 'admin'
    ? String(body.viewOrgId || gate.orgId || '')
    : String(gate.orgId || '')
  if (!orgId) return NextResponse.json({ error: 'No organization on your account' }, { status: 400 })

  const key = `joinCode:${orgId}`
  const existing = await prisma.appSetting.findUnique({ where: { key } })
  let code = existing?.value || ''
  if (!code || body.regenerate === true) {
    code = crypto.randomBytes(12).toString('hex')
    await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } })
  }

  return NextResponse.json({ url: `${APP_URL}/join?org=${encodeURIComponent(orgId)}&code=${code}` })
}
