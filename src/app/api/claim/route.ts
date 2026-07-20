import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { lookupClaimToken, markClaimed } from '@/lib/claim'

/**
 * Claim a team registration → get access to the Club Director portal.
 *
 * GET  ?token=…  → what this token is for (club + tournament), so the page can
 *                  greet the coach by club name and pre-fill their email.
 * POST { token, name?, password? }
 *                → links the registration's club to an account and consumes the token.
 *
 * Security notes:
 * - The token IS the authorization. It's 256-bit random and single-use.
 * - We never reveal whether an email already has an account beyond what the coach
 *   needs to proceed (they were emailed this link, so they own that inbox).
 * - Claiming only ever grants access to the ONE club on this registration.
 */

// Consistent vague failure so a caller can't probe for valid tokens.
const INVALID = { error: 'This link is not valid. It may have already been used — try signing in instead.' }

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || ''
  const info = await lookupClaimToken(token)
  if (!info) return NextResponse.json(INVALID, { status: 404 })

  // Does an account already exist for the address that registered?
  let accountExists = false
  try {
    const u = await prisma.user.findUnique({ where: { email: info.contactEmail } })
    accountExists = !!u
  } catch { /* treat as no account */ }

  return NextResponse.json({
    clubName: info.clubName,
    tournamentName: info.tournamentName,
    contactEmail: info.contactEmail,
    contactName: info.contactName,
    alreadyClaimed: info.alreadyClaimed,
    accountExists,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const token = String(body.token || '')
  const info = await lookupClaimToken(token)
  if (!info) return NextResponse.json(INVALID, { status: 404 })
  if (info.alreadyClaimed) {
    return NextResponse.json({ error: 'This team has already been claimed. Please sign in.' }, { status: 409 })
  }

  try {
    // Who is claiming? Either the already-signed-in user, an existing account
    // (verified by password), or a brand-new account we create now.
    const session = await getServerSession(authOptions)
    let userId: string | null = (session?.user as any)?.id ?? null

    if (!userId) {
      const existing = await prisma.user.findUnique({ where: { email: info.contactEmail } })
      const password = String(body.password || '')

      if (existing) {
        // Existing account — require the password so a forwarded link can't hijack it.
        if (!password || !existing.password) {
          return NextResponse.json({ error: 'Enter your existing password to link this team.' }, { status: 401 })
        }
        const ok = await bcrypt.compare(password, existing.password)
        if (!ok) return NextResponse.json({ error: 'That password is incorrect.' }, { status: 401 })
        userId = existing.id
      } else {
        if (password.length < 8) {
          return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
        }
        const created = await prisma.user.create({
          data: {
            name: String(body.name || info.contactName || info.clubName).slice(0, 120),
            email: info.contactEmail,           // always the address that registered
            password: await bcrypt.hash(password, 12),
            role: 'club_director',
          },
        })
        userId = created.id
      }
    }

    if (!userId) return NextResponse.json({ error: 'Could not complete sign-in.' }, { status: 400 })

    // Link this user to THIS club for THIS tournament (idempotent).
    await prisma.clubDirectorLink.upsert({
      where: { userId_tournamentId_clubName: { userId, tournamentId: info.tournamentId, clubName: info.clubName } },
      update: {},
      create: { userId, tournamentId: info.tournamentId, clubName: info.clubName },
    })

    await markClaimed(info.registrationId, userId)

    return NextResponse.json({ ok: true, clubName: info.clubName, tournamentName: info.tournamentName })
  } catch (e: any) {
    console.error('[claim] redeem failed:', e)
    return NextResponse.json({ error: 'Something went wrong claiming this team.' }, { status: 500 })
  }
}
