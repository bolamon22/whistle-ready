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
  {
    slug: 'how-to-follow-your-team-at-a-lacrosse-tournament',
    title: 'How to follow your team at a lacrosse tournament: schedules, live scores and alerts on your phone',
    description: 'Find your team’s games, field numbers and live scores, and get an alert on your phone when the schedule changes or a game goes final. No account needed.',
    audience: 'Parents and fans',
    published: '2026-10-16',
    updated: '2026-10-16',
    author: TEAM,
    body: `
> **Short answer:** Open the event at [whistleready.app/find](/find), find your team, and tap **Follow**. Your team moves to the top of the page under **My Teams**, and if you turn on alerts your phone tells you when the schedule is posted, when your team’s games move, and when each game goes final. No account, no password.

Every tournament weekend, the most common question at the main tent is some version of “when and where does my kid play next?” Here is how to answer it yourself in about a minute.

## 1. Find the event

Go to [whistleready.app/find](/find) and search for the tournament by name, or open the link the club or tournament shared with you. The event page shows every division, the full schedule, field numbers and standings.

## 2. Find your team, in the right division

Search for your team’s name. Many clubs bring more than one team to the same event, so check the **division** too. “Miami Reign” in Boys U14 and “Miami Reign” in Boys HS are different teams with different schedules.

## 3. Tap Follow

Tap **Follow** on your team. You can follow more than one, which helps if you have two kids playing, or you want to keep an eye on the team your team plays next. Your teams show up at the top of the event page under **My Teams**, so you are not scrolling through 300 games to find yours.

Follows are saved on your phone, so there is nothing to sign up for. If you switch phones, just follow again.

## 4. Turn on alerts

The first time you follow a team, you are asked whether you want alerts. Say yes and you will hear about:

- **The schedule going out,** with your team’s games.
- **Changes to your team’s games,** such as a new time or field.
- **Final scores** for your team’s games during the event.
- **Announcements from the tournament,** such as a weather delay.

You will not get a buzz for every little edit while the director is still building the schedule. Alerts are sent when the schedule is published.

### On an iPhone: add it to your Home Screen first

Apple only allows alerts from a website once it is on your Home Screen. Open the event in Safari, tap the **Share** button, tap **Add to Home Screen**, then open the event from that new icon and turn on alerts. It takes about 15 seconds. Android phones can turn on alerts straight from the browser.

## 5. Check live scores and standings during the day

Scores are entered at the field by the scorekeeper and show up on the event page within moments. Standings update as each final comes in, so you can see where your team sits going into bracket day without asking anyone.

## Game-day tips from the tent

- **Check the field number, not just the time.** Big events can run on a dozen or more fields spread across a park. The field number is on every game.
- **Look again in the morning.** Weather and late games can shift a schedule overnight. If you follow your team, you will be told.
- **Lightning means everyone off the field.** Play usually resumes 30 minutes after the last strike, and the tournament will post an update when games restart.
- **Coaches have the final word on arrival times.** The schedule shows game times. Your coach may want the team there earlier to warm up.

## For coaches

Coaches can follow their own teams in one tap when they sign the coach waiver, so they hear about schedule changes the same moment parents do.

## How Whistle Ready helps

[Whistle Ready](/#features) runs the schedule, scores and alerts for the tournaments that use it, so families get one link for the whole weekend instead of a printed sheet and a group text.

[Find a tournament](/find)
`,
  },
  {
    slug: 'what-to-bring-to-a-youth-lacrosse-tournament',
    title: 'What to bring to a youth lacrosse tournament: a packing list for players and parents',
    description: 'A packing list for a youth lacrosse tournament weekend in the Florida heat: player gear, spares, sideline setup, food and water, and what to do before you leave home.',
    audience: 'Parents and players',
    published: '2026-10-16',
    updated: '2026-10-16',
    author: TEAM,
    body: `
> **Short answer:** Pack the full set of gear plus spares (an extra stick or head, mouthguard and laces), two jerseys if your team has light and dark, more water than you think, sunscreen, a pop-up tent and chairs, and snacks for between games. Before you leave, check the schedule for your first game’s field number and make sure your waiver is signed.

We have watched a lot of families arrive at 7:30 in the morning without a mouthguard. This is the list we wish everyone had.

## Player gear

- **Helmet** with a properly fitted chin strap
- **Mouthguard,** plus a spare. Players without one cannot play.
- **Gloves**
- **Shoulder pads and arm pads**
- **Rib pads,** if your division or position requires them
- **Cup** for boys
- **Goggles** for girls, plus **eye protection** checked to your division’s rules
- **Stick,** plus a **backup stick or head.** Strings break and heads crack.
- **Cleats,** and a pair of sneakers or slides for between games
- **Both game jerseys** (light and dark) and shorts or kilt
- **Extra socks.** Wet socks by game three are miserable.

Goalies: add the chest protector, throat guard, goalie stick and a backup.

## Small things that save a game

- Spare **laces and stringing,** and someone who knows how to restring
- **Athletic tape**
- A **screwdriver** for helmet hardware
- **Hair ties** and a towel

## Staying cool in the heat

Florida tournaments are hot, even in the fall, and most of the day is in full sun.

- **Water and a sports drink,** more than you think. A cooler with ice is worth the carry.
- **Sunscreen,** reapplied between games
- **A pop-up tent** for shade. Many clubs set up a team tent row, so ask your coach.
- **Chairs** for the sideline
- **Cooling towels** and a **spray bottle**
- **Hat and sunglasses** for parents

## Food between games

Teams usually play two or three games a day with a game off in between. Pack food that is easy to eat in that break: fruit, sandwiches, granola bars, pretzels. Skip anything heavy right before a game. Many events have food trucks, but lines get long at lunch.

## For parents

- **Phone charger** or a battery pack. You will be checking scores all day.
- **Some cash** for parking, vendors or the merch tent
- **A small first-aid kit.** Every event should have an athletic trainer, but a bandage and ice pack in your bag save a walk.
- **Rain jacket or poncho** for afternoon storms

## Before you leave home

- **Check the schedule** for your first game’s time and **field number,** and follow your team so you hear about changes. See [how to follow your team](/guides/how-to-follow-your-team-at-a-lacrosse-tournament).
- **Make sure the player waiver is signed.** Most events check waivers before a team’s first game.
- **Look at the field map** for parking and where your field is. Big parks can be a long walk.
- **Know the weather plan.** Lightning stops play, and games pick up once it is safe.

## How Whistle Ready helps

Tournaments on [Whistle Ready](/#features) post the schedule, field numbers and live scores in one place, and let families sign waivers online before the weekend.

[Find a tournament](/find)
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
