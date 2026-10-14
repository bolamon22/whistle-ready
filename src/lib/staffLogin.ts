import { createClient } from '@libsql/client'
import { prisma } from '@/lib/db'

// A login works events through the Staff Pool record with the same email (no
// foreign key: the staff home, rosters, Availability and Auto-assign all match by
// email, oldest record first). So whoever puts an existing login on the staff --
// the recruiting link, an invite, or an admin on Logins -- has to fix the login
// too. A Parent login lands on the parent home, the staff home refuses it, and a
// login with no orgId sees no events.
//
// Steve Newell, Oct 14 2026: signed up to officiate with Create account and got a
// Parent login. Bo switched him to Staff on Logins and still couldn't find him on
// any staff list, because nothing had made his Staff Pool record.
//
// Only roles without staff pages are raised. An office role (admin, director,
// assigner, scheduler, field director) keeps its own, and so does the old
// Scorekeeper role. A club director becomes Staff: the club portal follows their
// club links, not the role, so it stays in their account menu (the two-hat setup
// in help/admin-users.md). Never import this from a client component.

export const STAFF_PROMOTABLE = new Set(['', 'viewer', 'parent', 'coach', 'club_director'])

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export type StaffAccess = { userId: string; from: string; to: string }

/** Give the login with this email what a staff member needs: a staff-capable role
 *  (`role` replaces a weak one only) and the Staff Pool record's organization when
 *  it has none. Null when no login uses the email. */
export async function giveStaffAccess(email: string, orgId: string | null, role = 'staff'): Promise<StaffAccess | null> {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return null
  const client = db()
  const r = await client.execute({ sql: `SELECT id, role FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [e] })
  const u = r.rows[0] as Record<string, unknown> | undefined
  if (!u) return null
  const userId = String(u.id)
  const from = String(u.role ?? '')
  const to = STAFF_PROMOTABLE.has(from) ? role : from
  if (to !== from) {
    await prisma.user.update({ where: { id: userId }, data: { role: to } })
  }
  if (orgId) {
    // Raw column (not in the Prisma schema): only fill an empty one.
    try { await client.execute({ sql: `UPDATE "User" SET orgId = ? WHERE id = ? AND (orgId IS NULL OR orgId = '')`, args: [orgId, userId] }) } catch { /* no column yet */ }
  }
  return { userId, from, to }
}
