'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface OrgData {
  id: string
  name: string
  logoUrl?: string
  slug?: string
}

const OrgContext = createContext<OrgData | null>(null)

function getPreviewOrgCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<OrgData | null>(null)
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === 'admin'

  useEffect(() => {
    if (!session?.user) return

    const previewOrgId = getPreviewOrgCookie()

    if (isAdmin) {
      if (previewOrgId) {
        // Admin is previewing a specific org — fetch that org's data
        fetch(`/api/admin/orgs/${previewOrgId}`)
          .then(r => r.json())
          .then(d => { if (d?.id) setOrg(d); else setOrg(null) })
          .catch(() => setOrg(null))
      } else {
        // Admin with no preview — platform view, no org branding
        setOrg(null)
      }
    } else {
      // Regular org user — fetch their own org
      fetch('/api/admin/org')
        .then(r => r.json())
        .then(d => { if (d?.id) setOrg(d); else setOrg(null) })
        .catch(() => setOrg(null))
    }
  }, [session, isAdmin])

  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>
}

export function useOrg() {
  return useContext(OrgContext)
}

export function usePreviewOrgId(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}
