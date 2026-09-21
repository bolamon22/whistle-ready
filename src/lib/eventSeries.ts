// WHICH REPEATING EVENT A TOURNAMENT BELONGS TO.
//
// Four series run once a year and have since 2007, so a tournament's name carries its
// series and its edition together ("Monster Mash 2024", "Jingle Brawl 25"). Anything that
// matches none of them is a one-off -- a flag football weekend, a Father's Day event --
// and those are grouped under their own heading rather than forced into a series.
//
// Its own module, with no database import, because both a server component (lib/orgHistory
// computing the track record) and a client page (the Website admin grouping event pages by
// event) need it. Putting it in orgHistory would pull that file's libsql query code into
// the browser bundle; copying it into the admin page is how the front page and /stats came
// to disagree about how many tournaments there have been.
const SERIES: [RegExp, string][] = [
  [/monster mash/i, 'Monster Mash'],
  [/fall classic/i, 'Fall Classic'],
  [/jingle brawl/i, 'Jingle Brawl'],
  [/summer kick ?off|sunshine state games/i, 'Summer Kick Off'],
]

/** The catch-all heading. Exported so a caller can sort it last rather than test the string. */
export const ONE_OFF = 'One-off events'

export function seriesOf(name: unknown): string {
  const s = String(name ?? '')
  for (const [re, label] of SERIES) if (re.test(s)) return label
  return ONE_OFF
}
