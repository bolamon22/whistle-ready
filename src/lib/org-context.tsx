'use client'

import { createContext, useContext, useEffect, useState } from 'react'

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

  useEffect(() => {
    const previewOrgId = getPreviewOrgCookie()
    const url = previewOrgId ? `/api/admin/org?view=${previewOrgId}` : '/api/admin/org'
    fetch(url)
      .then(r => r.json())
      .then(d => setOrg(d?.id ? d : null))
      .catch(() => setOrg(null))
  }, [])

  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>
}

export function useOrg() {
  return useContext(OrgContext)
}
