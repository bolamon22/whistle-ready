import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import { markLogin } from '@/lib/presence'
import { fieldDirectorEvents } from '@/lib/fieldDirector'

// The role, the organization and a field director's events are read again from the
// database at most once a minute, so a change made on Logins or Your team takes
// effect without signing out and back in (Bo, Oct 13 2026: Harry kept his old role
// until he signed in again). getServerSession runs the jwt callback on every API
// call, and only the session endpoint writes the refreshed cookie, so the reads are
// cached per server instance.
const SYNC_MS = 60_000
type Account = { at: number; role: string; orgId: string | null; events?: string[] }
const accounts = new Map<string, Account>()

async function loadAccount(userId: string): Promise<Account | null> {
  const hit = accounts.get(userId)
  if (hit && Date.now() - hit.at < SYNC_MS) return hit
  try {
    const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
    const res = await db.execute({ sql: 'SELECT role, orgId FROM "User" WHERE id = ?', args: [userId] })
    const row = res.rows[0]
    if (!row) return null
    const role = String(row.role || 'viewer')
    const a: Account = { at: Date.now(), role, orgId: (row.orgId as string) ?? null }
    if (role === 'field_director') a.events = await fieldDirectorEvents(userId)
    accounts.set(userId, a)
    return a
  } catch { return null }
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? 'viewer'
        // Look up orgId — not in Prisma schema, use raw SQL
        try {
          const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
          const res = await db.execute({ sql: 'SELECT orgId FROM "User" WHERE id = ?', args: [user.id] })
          token.orgId = (res.rows[0]?.orgId as string) ?? null
        } catch {
          token.orgId = null
        }
        if (token.role === 'field_director') token.events = await fieldDirectorEvents(user.id)
        token.syncedAt = Date.now()
        return token
      }
      if (token.id && Date.now() - Number(token.syncedAt || 0) > SYNC_MS) {
        const a = await loadAccount(String(token.id))
        if (a) {
          token.role = a.role
          token.orgId = a.orgId
          if (a.role === 'field_director') token.events = a.events ?? []
          else delete token.events
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