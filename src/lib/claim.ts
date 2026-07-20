import crypto from 'crypto'
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
