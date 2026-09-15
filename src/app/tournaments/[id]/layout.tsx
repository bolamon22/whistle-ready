import { headers } from 'next/headers'
import { isCustomOrgHost } from '@/lib/orgDomains'

// Tournament pages are served on BOTH hosts: staff use them on whistleready.app,
// where the app nav belongs, and families reach the same routes on the org's own
// domain, where it does not.
//
// Unlike /o/<slug>, these routes pass through the middleware unrewritten, so
// NavBar's pathname guard never sees them and the Whistle Ready bar was rendering
// on top of the client's own site for every visitor -- on the event, schedule and
// registration pages families actually use.
//
// Reading headers() here is free in practice: these pages already call orgBase(),
// which reads the same header, so they are dynamic either way.
export default function TournamentLayout({ children }: { children: React.ReactNode }) {
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
