import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import { markLogin } from '@/lib/presence'
import { fieldDirectorEvents } from '@/lib/fieldDirector'
import { membershipsOf, pickActive } from '@/lib/orgMembers'
import { planOffFor } from '@/lib/orgPlanStore'

// The role, the organization and a field director's events are read again from the
// database at most once a minute, so a change made on Logins or Your team takes
// effect without signing out and back in (Bo, Oct 13 2026: Harry kept his old role
// until he signed in again). getServerSession runs the jwt callback on every API
// call, and only the session endpoint writes the refreshed cookie, so the reads are
// cached per server instance.
//
// A login can work in more than one organization (lib/orgMembers). `activeOrgId` is
// the one it picked with the switcher in the top bar (useSession().update({
// activeOrgId })), checked against its memberships here and never trusted as sent.
// `orgId` and `role` are that organization's, so every page and API route keeps
// seeing one organization and one role; `orgs` lists every organization it can
// switch to (middleware offers the switch when a link leads into one of them),
// `switchable` says the switcher is worth showing, and `planOff` holds the feature
// groups that organization's plan has off (lib/orgPlans). Admins are untouched.
const SYNC_MS = 60_000
type Account = { at: number; role: string; orgId: string | null; orgs: string[]; switchable: boolean; planOff: string[]; events?: string[] }
const accounts = new Map<string, Account>()

async function loadAccount(userId: string, want: string | null, fresh = false): Promise<Account | null> {
  const key = `${userId}|${want || ''}`
  const hit = accounts.get(key)
  if (!fresh && hit && Date.now() - hit.at < SYNC_MS) return hit
  try {
    const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
    const res = await db.execute({ sql: 'SELECT role, orgId FROM "User" WHERE id = ?', args: [userId] })
    const row = res.rows[0]
    if (!row) return null
    const home = { role: String(row.role || 'viewer'), orgId: (row.orgId as string) ?? null }
    const a: Account = { at: Date.now(), role: home.role, orgId: home.orgId, orgs: home.orgId ? [home.orgId] : [], switchable: false, planOff: [] }
    if (home.role !== 'admin') {
      const ms = await membershipsOf(userId, home)
      const pick = pickActive(ms, want)
      if (pick) { a.role = pick.role; a.orgId = pick.orgId }
      a.orgs = ms.map(m => m.orgId).filter((o): o is string => !!o)
      a.switchable = ms.length > 1
      a.planOff = await planOffFor(a.orgId)
    }
    if (a.role === 'field_director') a.events = await fieldDirectorEvents(userId)
    accounts.set(key, a)
    return a
  } catch { return null }
}

/** Copies what was read onto the login token. */
function apply(token: Record<string, unknown>, a: Account) {
  token.role = a.role
  token.orgId = a.orgId
  token.orgs = a.orgs
  if (a.switchable) token.switchable = true; else delete token.switchable
  if (a.planOff.length) token.planOff = a.planOff; else delete token.planOff
  if (a.role === 'field_director') token.events = a.events ?? []; else delete token.events
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase() } })
        if (!user || !user.password) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        await markLogin(user.id)
        return { id: user.id, name: user.name, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? 'viewer'
        token.orgId = null
        const a = await loadAccount(user.id, null, true)
        if (a) apply(token as Record<string, unknown>, a)
        else if (token.role === 'field_director') token.events = await fieldDirectorEvents(user.id)
        token.syncedAt = Date.now()
        return token
      }
      // The org switcher: work in another organization this login belongs to.
      const asked = trigger === 'update' && session && typeof session === 'object' && 'activeOrgId' in session
      if (token.id && asked) {
        const want = (session as { activeOrgId?: unknown }).activeOrgId ? String((session as { activeOrgId?: unknown }).activeOrgId) : null
        const a = await loadAccount(String(token.id), want, true)
        if (a) {
          apply(token as Record<string, unknown>, a)
          if (want && a.orgId === want) token.activeOrgId = want; else delete token.activeOrgId
        }
        token.syncedAt = Date.now()
        return token
      }
      if (token.id && Date.now() - Number(token.syncedAt || 0) > SYNC_MS) {
        const want = token.activeOrgId ? String(token.activeOrgId) : null
        const a = await loadAccount(String(token.id), want)
        if (a) {
          apply(token as Record<string, unknown>, a)
          if (want && a.orgId !== want) delete token.activeOrgId   // no longer a member there
        }
        token.syncedAt = Date.now()   // a failed read is tried again in a minute
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        ;(session.user as any).orgId = (token.orgId as string | null) ?? null
        if (token.role === 'field_director') (session.user as any).events = Array.isArray(token.events) ? token.events : []
        if (token.switchable) (session.user as any).switchable = true
        if (Array.isArray(token.planOff) && token.planOff.length) (session.user as any).planOff = token.planOff
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}