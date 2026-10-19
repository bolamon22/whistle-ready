import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { FAVORITE_STYLES, isPostStyle } from '@/lib/socialPosts'

// The org's favorite post looks (starred in the Looks library). GET → { favorites };
// PUT { favorites } saves them. AppSetting `postLooks:{orgId}`; until someone stars
// anything, Bo's original picks (FAVORITE_STYLES) stand in.
export const runtime = 'nodejs'
const key = (orgId: string) => `postLooks:${orgId}`

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ favorites: FAVORITE_STYLES })
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(gate.orgId) } }).catch(() => null)
  let favorites: string[] = FAVORITE_STYLES
  try { if (row) { const v = JSON.parse(row.value); if (Array.isArray(v?.favorites)) favorites = v.favorites.filter((x: unknown) => isPostStyle(String(x))) } } catch {}
  return NextResponse.json({ favorites })
}

export async function PUT(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const b = await req.json().catch(() => ({} as any))
  const favorites = Array.from(new Set((Array.isArray(b.favorites) ? b.favorites : []).map(String).filter(isPostStyle))).slice(0, 40)
  await ensureTable()
  const value = JSON.stringify({ favorites })
  await prisma.appSetting.upsert({ where: { key: key(gate.orgId) }, update: { value }, create: { key: key(gate.orgId), value } })
  return NextResponse.json({ favorites })
}
