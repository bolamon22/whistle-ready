import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

// Completes a password reset: validates the emailed token (single-use, 1h),
// sets the new password, burns the token.
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return NextResponse.json({ error: 'This reset link is invalid.' }, { status: 400 })
    }
    if (!password || String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    const setting = await prisma.appSetting.findUnique({ where: { key: `pwreset:${token}` } })
    if (!setting) return NextResponse.json({ error: 'This reset link is invalid or was already used.' }, { status: 400 })
    let data: any = {}
    try { data = JSON.parse(setting.value || '{}') } catch {}
    if (!data.userId || !data.exp || Date.now() > Number(data.exp)) {
      await prisma.appSetting.delete({ where: { key: `pwreset:${token}` } }).catch(() => {})
      return NextResponse.json({ error: 'This reset link has expired. Request a new one.' }, { status: 400 })
    }
    const hashed = await bcrypt.hash(String(password), 12)
    await prisma.user.update({ where: { id: data.userId }, data: { password: hashed } })
    await prisma.appSetting.delete({ where: { key: `pwreset:${token}` } }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Try the link again.' }, { status: 500 })
  }
}
