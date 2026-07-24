import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled } from '@/lib/email'
import { SITE_URL } from '@/lib/seo'

// Self-serve "forgot password": emails a one-hour, single-use reset link.
// Always answers {ok:true} — the response must not reveal whether an email
// has an account (that would let anyone probe the user list).
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    const addr = String(email || '').trim().toLowerCase()
    if (!addr || !addr.includes('@')) return NextResponse.json({ ok: true })

    const user = await prisma.user.findUnique({ where: { email: addr } })
    if (user && emailEnabled()) {
      const token = randomBytes(32).toString('hex')
      // Tokens live in AppSetting (the app's config store) — no schema change.
      await prisma.appSetting.upsert({
        where: { key: `pwreset:${token}` },
        update: { value: JSON.stringify({ userId: user.id, exp: Date.now() + 60 * 60 * 1000 }) },
        create: { key: `pwreset:${token}`, value: JSON.stringify({ userId: user.id, exp: Date.now() + 60 * 60 * 1000 }) },
      })
      const url = `${SITE_URL}/reset/${token}`
      await sendEmail({
        to: addr,
        subject: 'Reset your Whistle Ready password',
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <div style="border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:16px">
            <h1 style="margin:0;font-size:20px;color:#0f172a">Reset your password</h1>
          </div>
          <p style="color:#475569;font-size:14px;line-height:1.6">Someone (hopefully you) asked to reset the password for this Whistle Ready account. This link works once and expires in 1 hour.</p>
          <p style="margin:20px 0"><a href="${url}" style="display:inline-block;background:#0f766e;color:#ffffff;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">Choose a new password →</a></p>
          <p style="color:#94a3b8;font-size:12px;line-height:1.6">Didn't request this? You can ignore this email — your password is unchanged.</p>
        </div>`,
      })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
