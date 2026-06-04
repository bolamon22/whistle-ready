'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'

interface RoleContextType {
  effectiveRole: string
  isPreview: boolean
  setPreviewRole: (role: string | null) => void
}

const RoleContext = createContext<RoleContextType>({
  effectiveRole: 'viewer',
  isPreview: false,
  setPreviewRole: () => {},
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [previewRole, setPreviewRoleState] = useState<string | null>(null)

  // Load from cookie on mount (cookie is source of truth since middleware reads it)
  useEffect(() => {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('preview-role='))
    const cookieVal = cookie ? cookie.trim().split('=')[1] : null
    const stored = localStorage.getItem('previewRole')
    const val = cookieVal || stored || null
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
  }

  const realRole = session?.user?.role ?? 'viewer'
  const isAdmin = realRole === 'admin'
  const isPreview = isAdmin && previewRole !== null
  const effectiveRole = isPreview ? previewRole! : realRole

  return (
    <RoleContext.Provider value={{ effectiveRole, isPreview, setPreviewRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export const useRole = () => useContext(RoleContext)
