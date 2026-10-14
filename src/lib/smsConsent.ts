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

/** Who is ticking the box. Staff and coaches are ONE program -- operational
 *  game-day messages to the people working the event -- but they are not told
 *  the same thing, because they are not sent the same thing. A coach hears only
 *  about a game moving and an event-wide alert; scores and schedule digests
 *  reach them on free web push, never on a text. Saying "game-day updates" to a
 *  coach would be consent for messages we do not send and do not want to be
 *  approved for (Bo, Oct 14). */
export type SmsAudience = 'staff' | 'coach'

/** The exact words next to the checkbox. Carriers want all of this present:
 *  who is sending, what the messages are, that frequency varies, that rates may
 *  apply, and how to stop. Keep every page and any future profile toggle on this
 *  one function so the screenshot we submit stays true. */
export function smsConsentText(orgName: string, audience: SmsAudience = 'staff'): string {
  const who = (orgName || '').trim() || 'Whistle Ready'
  const what = audience === 'coach'
    ? 'game schedule changes and event alerts'
    : 'staff and game-day updates'
  return `Yes, text me ${what} at this number from ${who}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.`
}

export type SmsConsentSource = 'join' | 'profile' | 'staff' | 'coach-waiver'

export type SmsConsentRow = { consent: boolean; at: string; source: string }
