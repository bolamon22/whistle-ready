import { headers } from 'next/headers'
import { isCustomOrgHost } from '@/lib/orgDomains'

// The claim link is emailed on the ORG's own domain (commSend.ts builds it with
// tournamentAbs), so a club director following it must land on the organizer's
// site -- not on a page wearing Whistle Ready's nav, which is a platform they
// have never heard of and do not have an account on.
//
// Same treatment as tournaments/[id]: these routes pass through the middleware
// unrewritten, so NavBar's own pathname guard never sees them and the app bar
// renders on top of the client's site.
export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  let onOrgDomain = false
  try { onOrgDomain = isCustomOrgHost(headers().get('host')) } catch { /* static render */ }
  return (
    <>
      {onOrgDomain && (
        <style>{`[data-app-chrome]{display:none!important}[data-app-main]{padding:0!important;max-width:none!important}`}</style>
      )}
      {children}
    </>
  )
}
