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
  // Mint when absent, on explicit regenerate, or when the stored code predates short
  // links (legacy 24-hex from the first build) — Bo wanted a textable URL, not
  // /join?org=<uuid>&code=<24 hex>.
  if (!code || body.regenerate === true || code.length > 16) {
    const old = code
    code = crypto.randomBytes(6).toString('base64url') // 8 URL-safe chars
    await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } })
    if (old) { try { await prisma.appSetting.delete({ where: { key: `joinCodeMap:${old}` } }) } catch { /* no map */ } }
  }
  // Reverse map so /join/<code> resolves the org from the code alone
  const mapKey = `joinCodeMap:${code}`
  await prisma.appSetting.upsert({ where: { key: mapKey }, update: { value: orgId }, create: { key: mapKey, value: orgId } })

  return NextResponse.json({ url: `${APP_URL}/join/${code}` })
}
