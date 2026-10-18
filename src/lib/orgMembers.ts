import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { archivedOrgIds } from '@/lib/orgArchive'

// One login in more than one organization (Bo, Oct 16 2026: an assigner who works
// Sunshine's events "wants to use it for his own. So he would have the same login,
// but I would give him access to our events, and then he would create his own events
// in the website. So we would need to kind of have that crossover between
// organization").
//
// A login's home organization stays where it always was: User.orgId and User.role
// (raw columns). Every other organization it works in is a row in raw table
// "OrgMember" (userId, orgId, role), TEXT columns only (CLAUDE.md, raw-query column
// types). The login works in one organization at a time, picked with the switcher in
// the top bar; lib/auth puts that organization's id and the role held THERE in the
// login token, so pages and API routes see one organization and one role, exactly as
// before. Nothing crosses over: being a director in your own organization gives you
// nothing in Sunshine's, where you are whatever Sunshine made you (middleware turns
// an event of another organization away, or switches to it when you're a member).
//
// Admins are never members of anything: they see every organization already, and no
// director can add, change or remove an admin login.
// Server only: never import this from a client component.

/** Roles an organization can give someone (the same list Your team offers). `client`
 *  is a head assigner's tournament director (lib/clientEvents). */
export const MEMBER_ROLES = ['director', 'scheduler', 'assigner', 'field_director', 'client', 'coach', 'staff']
/** Logins that belong to families and clubs, not to an organization's staff. */
const OUTSIDE_ROLES = ['coach', 'parent', 'club_director']

export type Membership = { orgId: string | null; role: string; home: boolean }
export type OrgPerson = { id: string; name: string; email: string; role: string; member: boolean }
type Home = { role: string; orgId: string | null }

let ready = false
export async function ensureOrgMembers(): Promise<void> {
  if (ready) return
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OrgMember" (
    "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "orgId" TEXT NOT NULL, "role" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL, "by" TEXT NOT NULL DEFAULT '')`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OrgMember_who" ON "OrgMember" ("userId", "orgId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgMember_org" ON "OrgMember" ("orgId")`)
  ready = true
}

async function homeOf(userId: string): Promise<Home | null> {
  const r = await prisma.$queryRawUnsafe<{ role: string | null; orgId: string | null }[]>('SELECT role, orgId FROM "User" WHERE id = ?', userId)
  return r[0] ? { role: String(r[0].role || 'viewer'), orgId: r[0].orgId ? String(r[0].orgId) : null } : null
}

/** Every organization this login works in: home first, then the others in the order
 *  they were added. A home with no organization is listed only for a club or family
 *  login (its portal); a staff login with no home organization just works in its
 *  other ones. */
export async function membershipsOf(userId: string, home?: Home | null): Promise<Membership[]> {
  const h = home === undefined ? await homeOf(userId) : home
  if (!h || h.role === 'admin') return []
  const out: Membership[] = []
  if (h.orgId || OUTSIDE_ROLES.includes(h.role)) out.push({ orgId: h.orgId, role: h.role, home: true })
  try {
    await ensureOrgMembers()
    const rows = await prisma.$queryRawUnsafe<{ orgId: string; role: string }[]>(
      `SELECT "orgId", "role" FROM "OrgMember" WHERE "userId" = ? ORDER BY "createdAt", "orgId"`, userId)
    for (const r of rows) if (String(r.orgId) !== h.orgId) out.push({ orgId: String(r.orgId), role: String(r.role), home: false })
  } catch (e) { console.error('[orgMembers] read', e) }
  if (!out.length && h.orgId === null) out.push({ orgId: null, role: h.role, home: true })
  // An archived organization (lib/orgArchive) is closed to its people.
  const closed = await archivedOrgIds()
  return closed.size ? out.filter(m => !m.orgId || !closed.has(m.orgId)) : out
}

/** The entry a login works in: the organization it picked when it's still a member
 *  there, else its home, else its first other organization. */
export function pickActive(ms: Membership[], want: string | null | undefined): Membership | null {
  return (want ? ms.find(m => m.orgId === want) : undefined) ?? ms.find(m => m.home) ?? ms[0] ?? null
}

/** The role this login has in one organization, or null when it isn't in it. */
export async function roleIn(userId: string, orgId: string): Promise<string | null> {
  if (!userId || !orgId) return null
  const m = (await membershipsOf(userId)).find(x => x.orgId === orgId)
  return m ? m.role : null
}

/** Everyone who works in an organization: the logins whose home it is (admins
 *  included, so a list can show them without offering to change them) and the
 *  members whose home is somewhere else. */
export async function orgPeople(orgId: string): Promise<OrgPerson[]> {
  const home = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id, name, email, role FROM "User" WHERE orgId = ? ORDER BY name COLLATE NOCASE`, orgId)
  let others: Record<string, unknown>[] = []
  try {
    await ensureOrgMembers()
    others = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT u.id AS id, u.name AS name, u.email AS email, m.role AS role FROM "OrgMember" m JOIN "User" u ON u.id = m."userId"
        WHERE m."orgId" = ? AND (u.orgId IS NULL OR u.orgId <> ?) AND u.role <> 'admin' ORDER BY u.name COLLATE NOCASE`, orgId, orgId)
  } catch (e) { console.error('[orgMembers] people', e) }
  const row = (r: Record<string, unknown>, member: boolean): OrgPerson => ({ id: String(r.id), name: String(r.name || ''), email: String(r.email || ''), role: String(r.role || 'staff'), member })
  return [...home.map(r => row(r, false)), ...others.map(r => row(r, true))]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export type AddResult =
  | { ok: true; how: 'role' | 'home' | 'member' }
  | { ok: false; status: number; error: string }

/** Put a login in an organization with a role (Your team; Admin → Organizations).
 *  - an admin login: refused (admins see everything already, and a director must
 *    never be able to change one)
 *  - already this organization's: its role changes
 *  - a staff login with no organization yet: this becomes its home, as before
 *  - anyone else (home in another organization, or a club or family login): a
 *    membership, so nothing they have elsewhere changes. */
export async function addToOrg(userId: string, orgId: string, role: string, by: string): Promise<AddResult> {
  if (!MEMBER_ROLES.includes(role)) return { ok: false, status: 400, error: 'Pick a role.' }
  const h = await homeOf(userId)
  if (!h) return { ok: false, status: 404, error: 'No such login.' }
  if (h.role === 'admin') return { ok: false, status: 400, error: 'That login is a Whistle Ready admin. Admins already see every organization.' }
  if (h.orgId === orgId) {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET role = ? WHERE id = ? AND role <> 'admin'`, role, userId)
    return { ok: true, how: 'role' }
  }
  await ensureOrgMembers()
  if (!h.orgId && !OUTSIDE_ROLES.includes(h.role)) {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET orgId = ?, role = ? WHERE id = ? AND role <> 'admin'`, orgId, role, userId)
    await prisma.$executeRawUnsafe(`DELETE FROM "OrgMember" WHERE "userId" = ? AND "orgId" = ?`, userId, orgId)
    return { ok: true, how: 'home' }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrgMember" ("id", "userId", "orgId", "role", "createdAt", "by") VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT ("userId", "orgId") DO UPDATE SET "role" = excluded."role"`,
    randomBytes(12).toString('hex'), userId, orgId, role, new Date().toISOString(), String(by || '').slice(0, 120))
  return { ok: true, how: 'member' }
}

/** Change someone's role in one organization. False when they aren't in it (or are an admin). */
export async function setRoleIn(userId: string, orgId: string, role: string): Promise<boolean> {
  if (!MEMBER_ROLES.includes(role)) return false
  const h = await homeOf(userId)
  if (!h || h.role === 'admin') return false
  if (h.orgId === orgId) {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET role = ? WHERE id = ? AND orgId = ? AND role <> 'admin'`, role, userId, orgId)
    return true
  }
  await ensureOrgMembers()
  const n = await prisma.$executeRawUnsafe(`UPDATE "OrgMember" SET "role" = ? WHERE "userId" = ? AND "orgId" = ?`, role, userId, orgId)
  return Number(n) > 0
}

/** Take someone out of one organization; everything they have elsewhere stays. False
 *  when they weren't in it (or are an admin). */
export async function removeFromOrg(userId: string, orgId: string): Promise<boolean> {
  const h = await homeOf(userId)
  if (!h || h.role === 'admin') return false
  if (h.orgId === orgId) {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET orgId = NULL WHERE id = ? AND orgId = ? AND role <> 'admin'`, userId, orgId)
    return true
  }
  await ensureOrgMembers()
  const n = await prisma.$executeRawUnsafe(`DELETE FROM "OrgMember" WHERE "userId" = ? AND "orgId" = ?`, userId, orgId)
  return Number(n) > 0
}
