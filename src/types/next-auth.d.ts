import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: string
      orgId?: string | null
      /** A field director's events (lib/fieldDirector). */
      events?: string[]
    }
  }
  interface User {
    role?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    orgId?: string | null
    /** A field director's events (lib/fieldDirector), refreshed every minute. */
    events?: string[]
    /** When role, orgId and events were last read from the database (lib/auth). */
    syncedAt?: number
  }
}
