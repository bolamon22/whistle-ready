import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { lookupClaimToken, markClaimed } from '@/lib/claim'
import { orgForTournament, orgLogoUrl as orgLogoUrl2 } from '@/lib/org'

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

  // Who is inviting them. The coach knows the organizer's name, not ours.
  let orgName = '', orgLogoUrl = ''
  try {
    const org = await orgForTournament(info.tournamentId)
    if (org) { orgName = org.name || ''; orgLogoUrl = await orgLogoUrl2(org.id, org.logoUrl) }
  } catch { /* the card just renders without the mark */ }

  return NextResponse.json({
    clubName: info.clubName,
    tournamentName: info.tournamentName,
    contactEmail: info.contactEmail,
    contactName: info.contactName,
    alreadyClaimed: info.alreadyClaimed,
    accountExists,
    orgName,
    orgLogoUrl,
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

    // Claiming a team IS the club-director credential, so the account doing the
    // claiming has to end up with the role that opens the portal.
    //
    // Only the brand-new branch above set it, so anyone who already had an
    // account -- or who signed up first and clicked the link second -- got the
    // ClubDirectorLink and kept whatever role they had. A 'parent' has ZERO
    // permissions in role-permissions.json, so they landed on the parent
    // dashboard locked out of the roster, the balance and the schedule the
    // invitation email had just promised them, with no way to fix it: roles are
    // only editable on the admin Users page. (Joe Frederick of LaxManiax, Sep 15
    // 2026 -- "I followed the process, but it appears I'm registered as a Parent.")
    //
    // Promote WEAK roles only. A director or admin claiming a team on behalf of a
    // club must never be demoted to club_director.
    const PROMOTABLE = new Set(['', 'parent', 'coach', 'viewer'])
    let rolePromoted = false
    try {
      const who = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
      if (PROMOTABLE.has(String(who?.role || ''))) {
        await prisma.user.update({ where: { id: userId }, data: { role: 'club_director' } })
        rolePromoted = true
      }
    } catch { /* the link still stands; staff can set the role by hand */ }

    // Link this user to THIS club for THIS tournament (idempotent).
    await prisma.clubDirectorLink.upsert({
      where: { userId_tournamentId_clubName: { userId, tournamentId: info.tournamentId, clubName: info.clubName } },
      update: {},
      create: { userId, tournamentId: info.tournamentId, clubName: info.clubName },
    })

    await markClaimed(info.registrationId, userId)

    // The role lives in the NextAuth JWT and is only written at sign-in, so a
    // promoted user keeps the stale one until they authenticate again. The page
    // uses this to decide whether its own re-sign-in is enough.
    return NextResponse.json({
      ok: true, clubName: info.clubName, tournamentName: info.tournamentName,
      rolePromoted, wasSignedIn: !!(session?.user as any)?.id,
    })
  } catch (e: any) {
    console.error('[claim] redeem failed:', e)
    return NextResponse.json({ error: 'Something went wrong claiming this team.' }, { status: 500 })
  }
}
