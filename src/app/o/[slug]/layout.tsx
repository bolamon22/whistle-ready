// Public org site layout.
//
// WHY THIS FILE EXISTS: on an org's own domain (sunshineeventsgroup.com) the
// middleware REWRITES /gallery to /o/<slug>/gallery. A rewrite keeps the browser
// URL as /gallery, and `usePathname()` in a client component reports the browser
// path -- so NavBar's `pathname.startsWith('/o/')` guard never matched and the
// Whistle Ready bar rendered on top of the client's own site, with the app's
// padded max-width wrapper squeezing the page in from both sides.
//
// Fixing it by reading headers() in the root layout would work but would opt the
// entire app out of static rendering, which is the thing that made pages take
// ~14s the last time it happened. A style tag scoped to this subtree costs
// nothing, survives both the rewrite and the direct /o/<slug> URL, and needs no
// hydration to be correct on first paint.
import PublicChirp from '@/components/PublicChirp'

// Chirp on the org's own website (Bo, Oct 3 2026). Only the slug is passed: the
// answers are built server-side, so this layout stays static.
export default function OrgSiteLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  return (
    <>
      <style>{`[data-app-chrome]{display:none!important}[data-app-main]{padding:0!important;max-width:none!important}`}</style>
      {children}
      <PublicChirp orgSlug={params.slug} />
    </>
  )
}
