import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

/**
 * "Claim your team" tokens.
 *
 * When a club registers a team we mint a single-use token and put it in the
 * confirmation letter/email. Following that link lets the coach create (or sign in
 * to) an account that is then linked to THAT registration's club — giving them the
 * Club Director portal: roster, player waivers, billing, schedule.
 *
 * Why a token instead of matching on email:
 * the portal exposes rosters, MINORS' waiver data and billing. Email matching would
 * let anyone who knows a coach's address claim their team. A token is unguessable
 * and is proof the person actually received the confirmation.
 *
 * Storage: claimToken / claimedAt live as raw columns on TeamRegistration. They're
 * not in the Prisma schema, so (as elsewhere in this app) we self-heal them with a
 * guarded ALTER TABLE and read/write via raw SQL.
 */

/** 32 random bytes → 43-char URL-safe string. Not guessable, not sequential. */
export function generateClaimToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** Add the claim columns if they don't exist yet. Safe to call repeatedly. */
export async function ensureClaimColumns(): Promise<void> {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "claimToken" TEXT`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "claimedAt" DATETIME`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "claimedByUserId" TEXT`) } catch { /* exists */ }
}

/** Store a freshly-minted token on a registration. Returns the token. */
export async function issueClaimToken(registrationId: string): Promise<string | null> {
  try {
    await ensureClaimColumns()
    const token = generateClaimToken()
    await prisma.$executeRawUnsafe(
      `UPDATE "TeamRegistration" SET "claimToken" = ? WHERE id = ?`,
      token, registrationId,
    )
    return token
  } catch (e) {
    console.error('[claim] could not issue token:', e)
    return null   // never block a registration over this
  }
}

export type ClaimInfo = {
  registrationId: string
  tournamentId: string
  tournamentName: string
  clubName: string
  contactEmail: string
  contactName: string
  alreadyClaimed: boolean
}

/**
 * Look up a claim token. Returns null for unknown/blank tokens — callers must not
 * reveal whether a token merely expired vs never existed.
 */
export async function lookupClaimToken(token: string): Promise<ClaimInfo | null> {
  const t = String(token || '').trim()
  if (!t || t.length < 20) return null
  try {
    await ensureClaimColumns()
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id, r.tournamentId, r.clubName, r.contactEmail, r.clubContact, r.claimedAt, t.name AS tournamentName
       FROM "TeamRegistration" r
       JOIN "Tournament" t ON t.id = r.tournamentId
       WHERE r."claimToken" = ? AND r."deletedAt" IS NULL
       LIMIT 1`,
      t,
    )
    const r = rows?.[0]
    if (!r) return null
    return {
      registrationId: r.id,
      tournamentId: r.tournamentId,
      tournamentName: r.tournamentName || 'the tournament',
      clubName: r.clubName || 'your club',
      contactEmail: (r.contactEmail || '').toLowerCase(),
      contactName: r.clubContact || '',
      alreadyClaimed: !!r.claimedAt,
    }
  } catch (e) {
    console.error('[claim] lookup failed:', e)
    return null
  }
}

/** Mark a token consumed and record who claimed it. Single-use. */
export async function markClaimed(registrationId: string, userId: string): Promise<void> {
  await ensureClaimColumns()
  await prisma.$executeRawUnsafe(
    `UPDATE "TeamRegistration" SET "claimedAt" = CURRENT_TIMESTAMP, "claimedByUserId" = ? WHERE id = ?`,
    userId, registrationId,
  )
}

/** Absolute URL for the claim link that goes in the confirmation letter/email. */
export function claimUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/claim/${token}`
}

// ---------------------------------------------------------------------------
// A LOGIN AT THE SAME TIME AS THE REGISTRATION
//
// Bo, Oct 4 2026: "when club directors register their teams, it just kind of
// automatically makes them have a login ... have them create a password at the
// time of registration." The form asks for a password; this does what the claim
// link does, without the trip back through email:
//
//   - signed in as the contact email already: linked to that account.
//   - a new email: an account with the password they chose, role club_director.
//   - an email that already has an account: linked only if the password matches
//     it. Never overwritten: a registration form must not be a way to take over
//     someone's login. A mismatch leaves the claim link in their letter.
//
// Access is the same ClubDirectorLink the claim makes, and the registration is
// marked claimed. Never throws: a registration must not fail over its login.
// ---------------------------------------------------------------------------

export type PortalLogin = {
  status: 'created' | 'linked' | 'existing_account' | 'none'
  email: string
  /** Raised to club_director just now. The role lives in the sign-in token, so
      someone already signed in has to sign in once more to see the portal. */
  rolePromoted?: boolean
}

/** Roles a club login may be raised from (same rule as the claim route). */
const PROMOTABLE = new Set(['', 'parent', 'coach', 'viewer'])

export async function setUpPortalLogin(
  reg: { id: string; tournamentId: string; clubName: string; clubContact?: string | null; contactEmail?: string | null },
  opts: { password?: string; sessionUser?: { id?: string; email?: string | null } | null },
): Promise<PortalLogin> {
  const email = String(reg.contactEmail || '').trim().toLowerCase()
  const none: PortalLogin = { status: 'none', email }
  if (!email || !reg.clubName) return none
  try {
    let userId = ''
    let status: PortalLogin['status'] = 'linked'
    const sessionEmail = String(opts.sessionUser?.email || '').trim().toLowerCase()
    if (opts.sessionUser?.id && sessionEmail === email) {
      userId = String(opts.sessionUser.id)
    } else {
      const password = String(opts.password || '')
      if (!password) return none
      // Emails are stored lowercase (auth.ts signs in on the lowercased address),
      // but match without case anyway so an older mixed-case row is still found.
      const rows: { id: string; password: string | null }[] = await prisma.$queryRawUnsafe(
        `SELECT id, password FROM "User" WHERE lower(email) = ? LIMIT 1`, email)
      const existing = rows?.[0]
      if (existing) {
        if (!existing.password || !(await bcrypt.compare(password, existing.password))) {
          return { status: 'existing_account', email }
        }
        userId = existing.id
      } else {
        if (password.length < 8) return none
        const created = await prisma.user.create({
          data: {
            name: String(reg.clubContact || reg.clubName).trim().slice(0, 120),
            email,
            password: await bcrypt.hash(password, 12),
            role: 'club_director',
          },
        })
        userId = created.id
        status = 'created'
      }
    }

    let rolePromoted = false
    try {
      const who = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
      if (PROMOTABLE.has(String(who?.role || ''))) {
        await prisma.user.update({ where: { id: userId }, data: { role: 'club_director' } })
        rolePromoted = true
      }
    } catch { /* the link still stands; staff can set the role by hand */ }
    await prisma.clubDirectorLink.upsert({
      where: { userId_tournamentId_clubName: { userId, tournamentId: reg.tournamentId, clubName: reg.clubName } },
      update: {},
      create: { userId, tournamentId: reg.tournamentId, clubName: reg.clubName },
    })
    await markClaimed(reg.id, userId)
    return { status, email, rolePromoted }
  } catch (e) {
    console.error('[claim] login at registration failed:', e)
    return none
  }
}
