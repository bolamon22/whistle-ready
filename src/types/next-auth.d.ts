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
      /** Works in more than one organization: the top bar shows the switcher (lib/orgMembers). */
      switchable?: boolean
      /** Feature groups the organization's plan has off (lib/orgPlans). */
      planOff?: string[]
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
    /** The organization picked with the switcher; orgId is where it was honored (lib/orgMembers). */
    activeOrgId?: string
    /** Every organization this login works in. */
    orgs?: string[]
    switchable?: boolean
    /** Feature groups the active organization's plan has off (lib/orgPlans). */
    planOff?: string[]
  }
}
