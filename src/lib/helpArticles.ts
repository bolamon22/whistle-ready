// How-to content for the in-app Help & support center. Plain Markdown bodies
// (rendered with mdToHtml). Also fed to the AI help assistant as context.

export type HelpArticle = { id: string; title: string; category: string; keywords: string; body: string }

export const HELP_CATEGORIES = ['Getting started', 'Setup', 'Registration & money', 'Staff', 'Game day', 'Public pages']

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'overview', title: 'How Whistle Ready works', category: 'Getting started',
    keywords: 'overview flow start basics workflow first steps',
    body: `Whistle Ready runs a tournament end to end. The usual flow is:

1. **Set up** the tournament (name, dates, fields, fee, divisions).
2. Add **divisions**, sort teams into **pools**, and generate **brackets**.
3. Use the **Scheduler** to place games on fields and times.
4. Use the **Assigner** to put refs and scorekeepers on games.
5. On event day, enter **scores** and use the **Game day** tools.
6. Share the **Public page** (schedule, standings, brackets) and the **Event page** with teams.

You can jump to any step from the top navigation: **Setup**, **People**, **Game Day**, **Financials**, and **Settings**.`,
  },
  {
    id: 'setup', title: 'Set up a tournament', category: 'Setup',
    keywords: 'new tournament create setup wizard fields dates fee timing',
    body: `Create a tournament from the home page, then open **Setup** to fine‑tune it.

- **General** — name, sport, dates, location, logo.
- **Venues & Fields** — the complexes and fields games are played on, plus daily start/end times.
- **Game timing & format** — period type (halves/quarters/running), length, and time between periods.
- **Registration fees** and **Divisions** — see the related help articles.

Everything you set here flows into the scheduler, the public page, and the registration form.`,
  },
  {
    id: 'divisions', title: 'Divisions, teams & pools', category: 'Setup',
    keywords: 'divisions teams pools assign auto-assign seed groups',
    body: `Open **Setup → Divisions**. Each division has three tabs: **Teams & Pools**, **Games**, and **Bracket**.

- Add teams to a division, then create **pools** (the chips at the top show live counts).
- Toggle **Assign Pools** to drag teams between pool columns, or click **Auto‑assign teams** to fill pools evenly.
- The **Games** tab lists pool games (P#) and bracket games (B#) with date/time/field.

Use **Smart Defaults** to generate pools, pool games, and brackets in one click based on each team count.`,
  },
  {
    id: 'brackets', title: 'Brackets & flights', category: 'Setup',
    keywords: 'bracket playoff flight consolation seed advance champion',
    body: `On a division's **Bracket** tab, pick a format and generate. The builder handles odd team counts with byes and real consolation games.

- **Smart Defaults** sets games‑per‑team, bracket format, how many advance, and consolation.
- A division can **split into Flight A / Flight B**, each with its own champion.
- **Consolation (both‑ways)** renders a mirror: winners flow right to the Champion, first‑round losers drop left to a Consolation Champion.

Edit any matchup inline, and preview before you publish.`,
  },
  {
    id: 'scheduler', title: 'Scheduling games (Auto‑fill)', category: 'Setup',
    keywords: 'scheduler schedule auto-fill grid times fields day split conflicts',
    body: `Open **Setup → Scheduler**. The grid shows fields across the top and time slots down the side.

- **Day start / Day end** load from your saved daily times and persist.
- Drag a game from the parking lot onto a slot, or click **Auto‑fill** to place them by the rules (no team/field double‑book, brackets after their feeders, rest between games, spread across fields).
- The **Day‑split** dropdown chooses how days are used (pool day 1 / bracket day 2, pool across all days, or all on one day).
- Use the **Game‑type** filter to schedule pool vs bracket separately, and **Zoom** to see more at once.

Refs and scorekeepers are added later on the Assigner.`,
  },
  {
    id: 'registration', title: 'Team registration & fees', category: 'Registration & money',
    keywords: 'registration register fee tier pricing 7v7 public form divisions',
    body: `Teams sign up on your public **Register** page. You control it under **Settings → Registration Fees** and **Divisions**.

- Fees use **per‑team tiers**. Add or remove tiers with **+ Add tier** and the × button; ranges chain automatically (1–3, 4–6, 7+ …) and the last tier is "and up".
- Add an optional **flat‑rate tier** (e.g. 7v7) with its own name and the divisions it applies to.
- The register form shows your divisions and a live fee estimate as teams are added.

Change anything and press **Save Changes** — the public form updates immediately.`,
  },
  {
    id: 'registration-emails', title: 'Who gets new-registration emails', category: 'Registration & money',
    keywords: 'notify notification notifications email alert heads-up new registration who gets emails recipients organizer office co-director',
    body: `Every new team registration sends your team an internal heads-up (contact info, teams, payment status) so someone can call the club director.

**For all your events (org default):**
1. From the home dashboard, open **Forms**.
2. Open **Registration Confirmation**.
3. Under **Notify your team**, enter the addresses, comma-separated. Leave it blank to use your org contact email.
4. To notify someone for certain events only (for example a co-director), click **Add person** under **Notify specific people by event** and tick their events. New yearly editions are included automatically.

**For one tournament:**
1. Open **Setup → Tournament setup → Team fees**.
2. Scroll to **Confirmation letter** and fill in **Notify your team**. Leave it blank to use the org default.

Note: the **Notify me at** fields on the Forms page belong to the vendor and staff application forms, not team registration.`,
  },
  {
    id: 'financials', title: 'Financials & payments', category: 'Registration & money',
    keywords: 'money financials payments invoice collected balance stripe check',
    body: `**Financials** shows what's invoiced, collected, and outstanding across team and player registrations.

- Registrants can pay by card (Stripe) or manual methods (Check, Zelle, ACH, PayPal) depending on what you enable.
- The **Registrations** page lists each club, its teams, invoice amount, and payments.
- Record manual payments against a registration to keep the balance accurate.`,
  },
  {
    id: 'roster', title: 'Staff roster & availability', category: 'Staff',
    keywords: 'staff roster availability pay rates refs scorekeepers workers',
    body: `Build your working staff under **People → Staff roster**.

- Add staff to the tournament roster (refs, scorekeepers, field ops, trainers).
- **Availability** lets staff mark which days/times they can work.
- **Pay rates** and **Pay summary** track what each role earns and totals owed.

On‑field workers all log in as **Staff**; their specific job comes from their Assigner assignments.`,
  },
  {
    id: 'assigner', title: 'Assigning refs & scorekeepers', category: 'Staff',
    keywords: 'assigner assign refs scorekeepers staffing slots lock',
    body: `Open **Setup → Assigner** after games are scheduled.

- Drag staff from the pool onto a game's role slots.
- Set how many refs each game needs, and see staffing requirements at a glance.
- Use the **lock‑editing** toggle to prevent accidental changes once you're set.

Assignments determine who can open the live scorekeeper for a game.`,
  },
  {
    id: 'scores', title: 'Scores & live scorekeeping', category: 'Game day',
    keywords: 'scores scorekeeper live game results enter standings',
    body: `Track results from the **Scores** page (directors/assigners). It shows scored vs total games.

- Open a game's **Scorekeeper** view to run the clock and enter the score live.
- Scores flow straight into **standings** on the public page (with your configured tiebreakers).

Only staff assigned to a game (or with the scorekeeper permission) can open its live scorekeeper.`,
  },
  {
    id: 'gameday', title: 'Game day tools', category: 'Game day',
    keywords: 'game day ops board incidents checklist directory contacts messages',
    body: `On event day, the **Game Day** menu has mobile‑friendly tools for everyone working:

- **Ops board** — send quick messages ("ball to Field 5", "trainer to Field 7") to a group or everyone.
- **Incidents** — log medical/safety/facility/weather issues with severity and field; track open vs resolved.
- **Setup checklist** — a shared list anyone can check off and add to.
- **Staff directory** — searchable, tap to call or text.`,
  },
  {
    id: 'public', title: 'Public page & event page', category: 'Public pages',
    keywords: 'public page event page schedule standings bracket builder blocks tabs',
    body: `Two public‑facing pages share your tournament with teams and families.

- The **Public page** has division standings, a grouped schedule (filters, add‑to‑calendar), and full bracket trees.
- The **Event page** is a builder‑driven landing page: drag blocks (overview, fees, locations, hotels, rules, FAQ, countdown, schedule, standings) and arrange them, with an **Event info** menu and a tabbed layout.

Edit the event page under **Setup → Event page → Page builder**. Use **Generate with AI** to draft section copy.`,
  },
]

// Where each page lives, so Chirp can link to it. Labels match TournamentNav;
// paths are relative to /tournaments/{id}. Chirp shows a role only the pages
// that role can open (lib/routeAccess), plus the public pages.
export const TOURNAMENT_PAGES: { label: string; path: string; public?: boolean }[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Setup → Tournament setup', path: '/builder' },
  { label: 'Setup → Divisions & teams', path: '/divisions' },
  { label: 'Setup → Scheduler', path: '/scheduler' },
  { label: 'Setup → Assigner', path: '' },
  { label: 'Setup → Checklist', path: '/checklist' },
  { label: 'Setup → Documents', path: '/documents' },
  { label: 'People → Team registrations', path: '/registrations' },
  { label: 'People → Player waivers', path: '/player-waivers' },
  { label: 'People → Coach waivers', path: '/coach-waivers' },
  { label: 'People → Travel & hotels', path: '/travel' },
  { label: 'People → Staff roster', path: '/roster' },
  { label: 'People → Staff applications', path: '/staff-applications' },
  { label: 'People → Vendor requests', path: '/vendor-requests' },
  { label: 'Live → Post scores', path: '/scores' },
  { label: 'Live → Assignments', path: '/assignments' },
  { label: 'Live → Communications', path: '/communications' },
  { label: 'Live → Chirp insights', path: '/chirp-insights' },
  { label: 'Financials', path: '/financials' },
  { label: 'Public page', path: '/public', public: true },
  { label: 'Event page', path: '/event', public: true },
]

/** Org-level pages (not inside one tournament). */
export const ORG_PAGES: { label: string; path: string }[] = [
  { label: 'Forms (home dashboard → Forms)', path: '/dashboard/org/forms' },
]

/** The pages each article is about. A role is given an article when it can open
 *  at least one of them; an article with none is for everyone. '*' is the
 *  tournament id. */
export const ARTICLE_ROUTES: Record<string, string[]> = {
  overview: [],
  setup: ['/tournaments/*/builder'],
  divisions: ['/tournaments/*/divisions'],
  brackets: ['/tournaments/*/divisions'],
  scheduler: ['/tournaments/*/scheduler'],
  registration: ['/tournaments/*/registrations', '/tournaments/*/builder'],
  'registration-emails': ['/dashboard/org/forms', '/tournaments/*/builder'],
  financials: ['/tournaments/*/financials'],
  roster: ['/tournaments/*/roster'],
  assigner: ['/tournaments/*'],
  scores: ['/tournaments/*/scores'],
  gameday: ['/tournaments/*/communications', '/tournaments/*/ops', '/tournaments/*/incidents', '/tournaments/*/checklist', '/tournaments/*/directory'],
  public: ['/tournaments/*/builder'],
}

// Flattened text used as grounding context for the AI help assistant.
export function helpArticlesText(): string {
  return HELP_ARTICLES.map(a => `## ${a.title} [${a.category}]\n${a.body}`).join('\n\n')
}
