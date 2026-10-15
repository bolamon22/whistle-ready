'use client'

import { SessionProvider } from 'next-auth/react'
import { RoleProvider } from '@/lib/role-context'
import { OrgProvider } from '@/lib/org-context'
import PresencePing from '@/components/PresencePing'
import AlertsNudge from '@/components/AlertsNudge'
import TermsGate from '@/components/TermsGate'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PresencePing />
      <RoleProvider><OrgProvider>{children}<AlertsNudge /><TermsGate /></OrgProvider></RoleProvider>
    </SessionProvider>
  )
}
