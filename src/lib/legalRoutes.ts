// The public legal / program pages, enumerated ONCE.
//
// Each of these has to be registered in three unrelated places, and /sms has
// already been missed in two of them:
//
//   1. middleware PUBLIC_ROUTES        -- or the page demands a login, and a
//      carrier reviewing it sees a sign-in wall (rejection code 30491).
//   2. the middleware custom-host passthrough -- or the org domain rewrites it
//      into /o/<slug><path>, which does not exist, and sunshineeventsgroup.com
//      /sms 404s while whistleready.app/sms renders fine.
//   3. NavBar's signed-out hide list   -- or the app's own nav stacks on top of
//      the page's header, so the page shows two headers naming two different
//      companies.
//
// Add a page here, not in three lists.
export const LEGAL_PATHS = ['/privacy', '/terms', '/sms'] as const

export const isLegalPath = (pathname: string): boolean =>
  (LEGAL_PATHS as readonly string[]).includes(pathname)
