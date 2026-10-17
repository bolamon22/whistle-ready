// What a tournament director sees of an event (lib/clientEvents), by the head
// assigner's add-ons (lib/orgPlans). Bo, Oct 17 2026: "make sure that model holds true
// for other add-on features as we go." The officials work every plan has is always
// shared: the schedule with who is on each game (names and phone numbers, Bo's pick),
// and Staff pay, because the tournament director normally pays the staff ("The
// tournament directors actually are the one that pays the staff. Normally."). Each
// add-on adds what the tournament director sees of it here, and the area shows a
// section only when the organization has that add-on on.
//
// Adding an add-on (a new plan group, or a new page in one)? Decide what the
// tournament director sees of it, add it to CLIENT_SECTIONS, and show it in
// /dashboard/client. No database import: client pages use this too.

import type { GroupKey } from './orgPlans'

export type ClientSection = 'schedule' | 'officials' | 'pay' | 'scores'

/** The sections each part of a plan shares. `officials` is the part every plan has. */
export const CLIENT_SECTIONS: Record<'officials' | GroupKey, ClientSection[]> = {
  officials: ['schedule', 'officials', 'pay'],
  scores: ['scores'],          // final scores on each game
  registration: [],
  scheduling: [],
  gameday: [],
  money: [],
  tasks: [],
  website: [],
}

/** The sections a tournament director sees, given the groups the organization has off. */
export function clientSections(planOff: readonly string[] | null | undefined): ClientSection[] {
  const off = new Set((planOff ?? []).map(String))
  const out = new Set<ClientSection>(CLIENT_SECTIONS.officials)
  for (const [group, list] of Object.entries(CLIENT_SECTIONS)) {
    if (group === 'officials' || off.has(group)) continue
    for (const s of list) out.add(s)
  }
  return Array.from(out)
}
