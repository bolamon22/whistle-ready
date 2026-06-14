import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'
import crypto from 'crypto'

const APP_URL = process.env.NEXTAUTH_URL || 'https://whistleready.app'
const FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'invites@gamedaystaff.com'

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { email, name, tournamentId } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    // Check if worker already exists
    const existing = await prisma.worker.findFirst({ where: { email: email.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 409 })

    // Expire any previous unused invites for this email
    await prisma.staffInvite.updateMany({
      where: { email: email.toLowerCase(), usedAt: null },
      data: { expiresAt: new Date() },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Get tournament name if provided
    let tournamentName = 'Staff Invite'
    if (tournamentId) {
      const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } })
      if (t) tournamentName = t.name
    }

    await prisma.staffInvite.create({
      data: { token, email: email.toLowerCase(), name: name || null, tournamentId: tournamentId || null, expiresAt },
    })

    const inviteUrl = `${APP_URL}/invite/${token}`

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `You're invited to join ${tournamentName} staff`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">
            You've been invited to join the ${tournamentName} staff
          </h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            ${name ? `Hi ${name}, ` : ''}Click the button below to accept your invite. It takes less than a minute.
          </p>
          <a href="${inviteUrl}"
            style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
                   font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
            Accept Invite →
          </a>
          <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
            This link expires in 7 days. If you weren't expecting this, you can ignore it.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
  }
}
