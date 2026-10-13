// Permission to text a staff member, recorded per person (Bo, Oct 13 2026).
//
// Two reasons this exists, and the first one is the one that matters:
//
// 1. We hold phone numbers people gave us so we could CALL them on game day.
//    That is not permission to send them messages. Nobody gets a text from us
//    unless they ticked a box that said we would.
//
// 2. Toll-free verification asks for `optInType` and `optInImageUrls` -- "a link
//    to an image that shows the opt-in workflow". The /join checkbox IS that
//    workflow, and a screenshot of it is the evidence. Submissions without one
//    get rejected.
//
// THIS FILE IS PURE and is imported by the /join page, which runs in the
// browser. Nothing here may import prisma or anything that reaches the
// database -- that would drag the Prisma client into the client bundle and
// break the build. The storage side lives in src/lib/smsConsentDb.ts.

/** The exact words next to the checkbox. Carriers want all of this present:
 *  who is sending, what the messages are, that frequency varies, that rates may
 *  apply, and how to stop. Keep the page and any future profile toggle on this
 *  one string so the screenshot we submit stays true. */
export function smsConsentText(orgName: string): string {
  const who = (orgName || '').trim() || 'Whistle Ready'
  return `Yes, text me staff and game-day updates at this number from ${who}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.`
}

export type SmsConsentSource = 'join' | 'profile' | 'staff'

export type SmsConsentRow = { consent: boolean; at: string; source: string }
