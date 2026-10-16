import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PREVIEW_COOKIE, previewPlanValue } from '@/lib/previewView'

// The organization an admin is looking at (the "Viewing" picker and View as,
// lib/previewView). Its plan goes along in preview-plan, so a View as preview shows
// only the pages that organization has.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orgId } = await req.json().catch(() => ({} as { orgId?: unknown }))
  const id = typeof orgId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(orgId) ? orgId : ''
  const res = NextResponse.json({ ok: true })

  if (id) {
    res.cookies.set('preview-org', id, PREVIEW_COOKIE)
    res.cookies.set('preview-plan', await previewPlanValue(id), PREVIEW_COOKIE)
  } else {
    res.cookies.delete('preview-org')
    res.cookies.delete('preview-plan')
  }
  return res
}
