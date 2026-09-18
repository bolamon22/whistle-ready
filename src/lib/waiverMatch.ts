// MATCHING WAIVERS TO REGISTERED TEAMS, AFTER THE FACT.
//
// A player waiver stores its team as one string, "Club — Team", and every count in
// the app joins on it: the club-director portal, per-team roster counts, pools,
// brackets and game-day check-in. A tag that matches no registered team belongs to
// nobody, and the player silently vanishes from their team's roster.
//
// The tags drift for reasons that are nobody's fault. Families register before their
// club director has filed the team registration (Space Coast committed verbally for the
// Fall Classic and eight families filed waivers while the club list still had no Space
// Coast in it). A club adds a team late. A parent uses the name the team calls itself
// rather than the one on the registration. All of it is normal, and all of it is only
// resolvable later, once the registration exists.
//
// So this is deliberately a SUGGESTION engine, not an auto-corrector. It says what it
// thinks and why, marks whether it is certain, and leaves the decision to staff --
// because the one case it cannot call is exactly the one that matters: a division
// holding two teams ("Girls High School A" is both HS Select and 2030 Select) is a coin
// flip, and a wrong roster is worse than an unmatched one.

/** One club's registered teams for a tournament. `divisions` maps team name -> its division. */
export type RegisteredClub = { club: string; teams: string[]; divisions?: Record<string, string> }

/** The em-dash (or hyphen) between club and team. Same shape the waiver form writes. */
export const TAG_SEP = /\s+[—–]\s+|\s+-\s+/

/** Compare names the way a person would: case, spacing and punctuation don't count. */
export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** "LaxManiax — HS Select" -> { club: 'LaxManiax', team: 'HS Select' }. No separator means it's all club. */
export function splitTag(tag: string): { club: string; team: string } {
  const t = String(tag || '').trim()
  const m = TAG_SEP.exec(t)
  return m
    ? { club: t.slice(0, m.index).trim(), team: t.slice(m.index + m[0].length).trim() }
    : { club: t, team: '' }
}

/** The canonical stored form, and the value of every option in the team picker. */
export const tagFor = (club: string, team: string) => (team ? `${club} — ${team}` : club)

export type Match = {
  /** '' when nothing can be suggested yet. */
  value: string
  /** Every option worth offering, best first — what the dropdown is seeded with. */
  options: string[]
  /** Plain-English reason, shown to staff. Never jargon; they are deciding on it. */
  why: string
  /** true = safe to apply without thinking. false = a real choice, or nothing to choose from yet. */
  sure: boolean
  /** Nothing to do: the tag already names a registered team. */
  ok?: boolean
}

/**
 * What should this waiver tag become?
 *
 * Rules run in confidence order and stop at the first hit, so a certain answer is never
 * shadowed by a looser one.
 */
export function matchTag(tag: string, clubs: RegisteredClub[]): Match {
  let { club, team } = splitTag(tag)
  const all = clubs.flatMap(c => c.teams.map(t => tagFor(c.club, t)))
  const none = (why: string): Match => ({ value: '', options: all, why, sure: false })
  if (!tag.trim()) return none('No team on the waiver at all.')

  let rec = clubs.find(c => norm(c.club) === norm(club))

  // NO DASH AT ALL: "LaxManiax 2031/32 Select" is a club and a team run together, which
  // splitTag can only read as one very long club name. Find the registered club whose
  // name starts the tag (longest first, so "FCA Treasure Coast" wins over "FCA") and
  // read what's left as the team.
  if (!rec) {
    const whole = norm(tag)
    const byPrefix = clubs
      .filter(c => norm(c.club) && whole.startsWith(norm(c.club)) && whole !== norm(c.club))
      .sort((a, b) => norm(b.club).length - norm(a.club).length)[0]
    if (byPrefix) {
      const rest = whole.slice(norm(byPrefix.club).length)
      const hit = byPrefix.teams.filter(t => norm(t) && rest.includes(norm(t)))
      const opts = byPrefix.teams.map(t => tagFor(byPrefix.club, t))
      if (hit.length === 1) {
        return { value: tagFor(byPrefix.club, hit[0]), options: opts, sure: true,
          why: `Club and team written without the dash \u2014 this is ${byPrefix.club}'s ${hit[0]}.` }
      }
      rec = byPrefix   // club found, team still unclear; the rules below take it from here
      club = byPrefix.club
      team = ''
    }
  }

  if (!rec) {
    // The club itself hasn't registered. Offer a near-spelling if there is one, else say
    // plainly that this is waiting on the club director rather than on staff.
    const near = clubs.find(c => norm(c.club).includes(norm(club)) || norm(club).includes(norm(c.club)))
    if (near && norm(club)) {
      return { value: '', options: near.teams.map(t => tagFor(near.club, t)), sure: false,
        why: `No club called "${club}" is registered — did they mean ${near.club}?` }
    }
    return none(`${club || 'This club'} hasn't registered for this event yet. Once the club director files the registration, their teams show up here.`)
  }

  const mine = rec.teams.map(t => tagFor(rec.club, t))
  const exact = rec.teams.find(t => norm(t) === norm(team))
  if (exact) {
    const canonical = tagFor(rec.club, exact)
    // Same team, different spelling or separator -- e.g. "LaxManiax 2031/32 Select".
    return canonical === tag.trim()
      ? { value: canonical, options: mine, why: 'Already matches a registered team.', sure: true, ok: true }
      : { value: canonical, options: mine, sure: true, why: `Same team as "${exact}", spelled differently.` }
  }

  // A DIVISION where a team should be. This was the big one: the form used to file the
  // division instead of the team, so most mismatches look like this.
  const divs = rec.divisions || {}
  const inDivision = rec.teams.filter(t => norm(divs[t] || '') === norm(team) && norm(team))
  if (inDivision.length === 1) {
    return { value: tagFor(rec.club, inDivision[0]), options: mine, sure: true,
      why: `"${team}" is a division, not a team — ${rec.club} has exactly one team in it.` }
  }
  if (inDivision.length > 1) {
    return { value: '', options: inDivision.map(t => tagFor(rec.club, t)).concat(mine.filter(o => !inDivision.some(t => tagFor(rec.club, t) === o))), sure: false,
      why: `"${team}" is a division holding ${inDivision.length} of ${rec.club}'s teams. Nothing on the waiver says which one — pick it.` }
  }

  if (!team) {
    return rec.teams.length === 1
      ? { value: tagFor(rec.club, rec.teams[0]), options: mine, sure: true, why: `Only the club was given, and ${rec.club} registered one team.` }
      : { value: '', options: mine, sure: false, why: `Only the club was given. ${rec.club} has ${rec.teams.length} teams — pick one.` }
  }

  // Last resort: one registered team whose name is contained in the typed one (or the
  // reverse) -- "2033/2034 Select Team" against a registered "2033/2034 Select".
  const near = rec.teams.filter(t => norm(t).includes(norm(team)) || norm(team).includes(norm(t)))
  if (near.length === 1) {
    return { value: tagFor(rec.club, near[0]), options: mine, sure: false,
      why: `Closest registered team to "${team}" — worth a look before applying.` }
  }
  return { value: '', options: mine, sure: false,
    why: `${rec.club} never registered a team called "${team}". Pick the right one, or have the club add it.` }
}

/** One row of the review panel: a tag, how many waivers carry it, and what to do about it. */
export type Unmatched = { tag: string; count: number; match: Match }

/** Every tag that doesn't name a registered team, worst first (biggest groups at the top). */
export function unmatchedTags(tags: { name: string; count: number }[], clubs: RegisteredClub[]): Unmatched[] {
  if (!clubs.length) return []   // registrations haven't loaded; don't cry wolf
  return tags
    .filter(t => String(t.name || '').trim() && t.name !== '__other')
    .map(t => ({ tag: t.name, count: t.count, match: matchTag(t.name, clubs) }))
    .filter(r => !r.match.ok)
    .sort((a, b) => Number(b.match.sure) - Number(a.match.sure) || b.count - a.count || a.tag.localeCompare(b.tag))
}
