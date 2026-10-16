// Whistle Ready guides: practical articles for tournament directors, assigners,
// coaches and parents, at whistleready.app/guides (Bo, Oct 16 2026: articles for
// authority in search and AI answers).
//
// Rules for a guide:
// - First-hand: real numbers from events we ran and Bo's own rules of thumb.
//   Generic advice anyone could write does not rank and does not help.
// - Each guide has an author and an updated date (shown, and in the JSON-LD).
//   Guides are credited to the Whistle Ready team, not a person (Bo, Oct 16 2026:
//   he does not want his name on them).
// - Mention Whistle Ready only where it genuinely helps; never name competitors.
// - Body is Markdown rendered by app/o/[slug]/_md (headings, lists, links,
//   > callouts, bold/italic; no tables).
// - Adding a guide here adds it to /guides, the sitemap and llms.txt.

export type Guide = {
  slug: string
  title: string
  description: string   // ~155 chars; the search snippet
  audience: string      // who it is for, shown on the card
  published: string     // YYYY-MM-DD
  updated: string       // YYYY-MM-DD
  author: { name: string; bio: string; type: 'Organization' | 'Person' }
  body: string
}

export const TEAM = {
  name: 'The Whistle Ready team',
  bio: 'Whistle Ready is built by people who have run youth lacrosse tournaments in Florida for more than a decade, and who coach and play the game.',
  type: 'Organization' as const,
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-schedule-a-youth-lacrosse-tournament',
    title: 'How to schedule a youth lacrosse tournament: fields, game slots and how many teams fit',
    description: 'A director’s rule of thumb: about 10 teams per field for a two-day weekend. Here is the math behind it, plus game slots, rest between games and pool vs. bracket days.',
    audience: 'Tournament directors',
    published: '2026-10-16',
    updated: '2026-10-16',
    author: TEAM,
    body: `
> **The short answer:** plan on about **10 teams per field** for a two-day weekend. Seven fields comfortably hold around 70 teams. Use 50-minute game slots, give every team 2 to 3 games a day, and leave one slot of rest between a team's games whenever you can.

That rule of thumb comes from years of running youth lacrosse tournaments in Florida, and it holds up when you check it against real schedules. Below is the math behind it, and the other decisions that make a weekend run on time.

## Start with your fields, not your team count

The number of fields you can get is the hard limit. Everything else bends around it. Before you open registration, know:

- how many fields you have each day, and their hours,
- which fields are full size and which are only right for 7v7 or younger divisions,
- whether any field is lit, so you could run later if you have to.

Then set your team cap from the fields. If you sell more spots than your fields can hold, you end up with 7 a.m. starts, back-to-back games and an angry Sunday.

## The 10-teams-per-field rule, and why it works

Here is the math for a typical two-day lacrosse weekend:

1. **A game slot is about 50 minutes.** That covers the game plus a few minutes to clear the field and start the next one. Across the lacrosse events we have analyzed, the time between games on a field was 50 to 55 minutes.
2. **A field day runs about 8 a.m. to 6 p.m.** That is roughly 12 slots a day, or about 24 slots per field over two days.
3. **Each team plays 4 to 5 games over the weekend.** Every game uses two teams, so 10 teams playing 4 to 5 games each is 20 to 25 games.
4. **20 to 25 games fills 24 slots.** So one field carries about 10 teams with a little room to spare for a weather delay or a long overtime.

Seven fields, then, is around 70 teams. Ten fields is around 100.

> If your games are longer (older divisions, longer halves), or your field hours are shorter, lower the number. If you only promise 3 to 4 games per team, you can stretch it a little higher. The rule is a starting point, not a promise.

**A real example.** At the 2026 Sunshine State Summer Kick-Off we ran **292 games over two days on 14 fields**, with as many as 14 games going at once. That works out to a little over 20 games per field for the weekend, right where the rule says it should be.

## Games per day: 2 to 3, never more than 3

Most teams in our events play **2 or 3 games a day**. Three is the ceiling for youth lacrosse. A fourth game in a day wears kids out, and it is usually the sign that you sold too many spots.

## Rest between games: "one on, one off"

The pattern that works best is **one on, one off**: a team plays, sits out one slot, then plays again. That gives players about an hour to rest, eat and get water, and it gives coaches time to talk.

Back-to-back games still happen when a schedule is tight. In the schedules we studied, about one game in five was back-to-back. Treat back-to-back as something to avoid, not something to forbid, and never put the same team in three games in a row.

## Spread each division across fields

It is tempting to put a whole division on one field. Don't. Spreading a division across several fields lets more of its games happen at the same time, so a division finishes earlier and families are not stuck at the complex all day.

- Small divisions (4 to 6 teams) usually need 1 to 2 fields.
- Big divisions can use 6 or more fields at once.
- Keep a team on the same field or a nearby one between games when you can, so families are not walking across the complex every hour.

## Pool play and brackets: decide how to use the two days

There are two common ways to use a weekend, and both work:

- **Pool play Saturday, brackets Sunday.** Teams play their pool games on day one, then seeds decide day two. This is what most of our fall events use.
- **Pool play both days.** Every team plays a full weekend of pool games, with a few championship games at the end. This works well when divisions are small or you want to guarantee more games.

Decide which one you are running before you build the schedule, and tell coaches when they register.

**A 4-team division** is the simplest case: a round robin is 6 games (3 per team) on day one, then a 4-team bracket on day two, with both semifinals at the same time and the final later in the day.

## Younger divisions earlier, older divisions later

Families with young kids want to be done early. High school divisions can play later into the afternoon. It is a nudge, not a rule, but it makes the day easier for everyone.

## Mark fields for the divisions they can host

If some fields are only right for 7v7 or the youngest divisions, mark them before you schedule so you never put a high school game on a small field. It is much easier to plan around that early than to fix it the night before.

## A quick checklist before you publish the schedule

- Every team has 2 to 3 games a day, and no more than 3.
- No team plays three games in a row.
- Each division is spread across enough fields to finish on time.
- Brackets are scheduled after the games that feed them.
- Every field has a 50-minute slot, with some slack for delays.
- Coaches know whether day two is brackets or more pool play.

## How Whistle Ready helps

We built [Whistle Ready](/#features) because we were doing all of this by hand. It fills a schedule grid following the rules above: 2 to 3 games a day, one on and one off, divisions spread across fields, and brackets after the pool games that feed them. You can still move any game yourself. When the schedule is posted, teams, parents and fans see it live at [whistleready.app/find](/find) with no account needed.

Running a tournament and want to see it work on your own fields? [Tell us about your event](/#organizations).
`,
  },
]

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

export function fmtGuideDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
