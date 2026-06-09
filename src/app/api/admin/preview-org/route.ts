import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orgId } = await req.json()
  const res = NextResponse.json({ ok: true })

  if (orgId) {
    res.cookies.set('preview-org', orgId, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 8 })
  } else {
    res.cookies.delete('preview-org')
  }
  return res
}
