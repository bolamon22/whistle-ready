'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'

interface RoleContextType {
  effectiveRole: string
  isPreview: boolean
  setPreviewRole: (role: string | null) => void
  /** Feature groups the organization's plan has off (lib/orgPlans): pass to roleCanAccess. */
  planOff: string[]
}

const RoleContext = createContext<RoleContextType>({
  effectiveRole: 'viewer',
  isPreview: false,
  setPreviewRole: () => {},
  planOff: [],
})

const NO_GROUPS: string[] = []

export function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [previewRole, setPreviewRoleState] = useState<string | null>(null)

  // Load from cookie on mount (cookie is source of truth since middleware reads it)
  useEffect(() => {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('preview-role='))
    const cookieVal = cookie ? cookie.trim().split('=')[1] : null
    // The cookie alone: it is what the server reads, and a role remembered only in
    // localStorage showed one role's tabs over another role's data.
    const val = cookieVal || null
    if (val) setPreviewRoleState(val)
  }, [])

  const setPreviewRole = (role: string | null) => {
    setPreviewRoleState(role)
    if (role) {
      localStorage.setItem('previewRole', role)
      document.cookie = `preview-role=${role}; path=/; max-age=86400; SameSite=Lax`
    } else {
      localStorage.removeItem('previewRole')
      document.cookie = 'preview-role=; path=/; max-age=0; SameSite=Lax'
    }
    // The server answers as the previewed role too (pages and API data), so the
    // page has to be fetched again; switching in place left the old role's data
    // on screen.
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/unauthorized')) window.location.href = '/'
      else window.location.reload()
    }
  }

  const realRole = session?.user?.role ?? 'viewer'
  const isAdmin = realRole === 'admin'
  const isPreview = isAdmin && previewRole !== null
  const effectiveRole = isPreview ? previewRole! : realRole
  // The plan of the organization this login works in. Admins (previewing or not) aren't held to one.
  const planOff = !isAdmin && Array.isArray(session?.user?.planOff) ? session!.user.planOff! : NO_GROUPS

  return (
    <RoleContext.Provider value={{ effectiveRole, isPreview, setPreviewRole, planOff }}>
      {children}
    </RoleContext.Provider>
  )
}

export const useRole = () => useContext(RoleContext)
