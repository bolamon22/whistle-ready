# GameDay Staff — project guide & working philosophy

This file is read automatically at the start of any Claude / Cowork session that has
this repo connected. It is the project's memory: what the app is, how we work, and the
standards to follow. Keep it updated as things evolve — editing this file is how you
"teach" future sessions, on any computer. Keep it lean: fold old session notes into
"Current state" rather than stacking dated handoffs forever.

## The app
Whistle Ready (formerly "GameDay Staff") — tournament management for Sunshine Events Group
(lacrosse and other sports): tournaments, divisions, pools, brackets, team & player registration,
staff assignment, payroll, financials, public schedule/standings, and live scorekeeping.

- Stack: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
  Prisma + Turso (libSQL) · NextAuth · Stripe · SendGrid (email) · hosted on Vercel.
- Repo: github.com/bolamon22/whistle-ready (public; auto-redirects from the old
  gameday-staff5 name). Live: **whistleready.app** (Vercel project `whistle-ready`).
- The local folders are still named `gameday-staff5` — intentional, don't rename.

### Email (SendGrid)
ALL transactional email goes through ONE wrapper: **`src/lib/email.ts`** (`sendEmail()` /
`emailEnabled()`). Routes must never import an email provider directly — that keeps the
provider swappable in one file and is the seam for per-org senders + future channels.
- Provider: **SendGrid** (`@sendgrid/mail`). Resend was fully removed Jul 16 2026.
- Env: `SENDGRID_API_KEY`, `EMAIL_FROM` (noreply@whistleready.app), `EMAIL_FROM_NAME`.
  `INVITE_FROM_EMAIL` is read only as a legacy fallback.
- `sendEmail()` **never throws** — it returns `{ok, error}` and logs. Email is best-effort so a
  failed receipt can't break a registration. **Tradeoff: a bad key fails SILENTLY** — after any
  email change, confirm a real send in SendGrid's Activity feed, don't trust config alone.
- 5 send sites: staff invite, org user invite, org-forms submit, registration confirmation,
  returning-teams invite.
- `whistleready.app` is domain-authenticated in SendGrid (3 CNAMEs at **GoDaddy**, which hosts
  this domain's DNS; `_dmarc` already existed). The SendGrid account is SHARED with
  Lacrossewear/lwops.com but uses a SEPARATE key ("Whistle Ready", Mail Send only) and a separate
  authenticated domain — only the plan quota is shared.

## How we ship (workflow)
- **Working clone (use this one): `C:\Users\bo\GitHub\gameday-staff5`.** There is a second, OLD
  clone at `C:\Users\bo\OneDrive\Documents\GitHub\gameday-staff5` — do NOT commit there. Both show
  as "whistle-ready" in GitHub Desktop; hover to check the path before committing.
- Verify before shipping: `npx tsc --noEmit` (grep the files you touched) and/or an
  esbuild parse; preview UI changes before deploying.
- Deploy: commit → **push to `master` via GitHub Desktop** → Vercel auto-builds and redeploys.
  After pushing, confirm with `git fetch origin` + `git rev-list --left-right --count master...origin/master`.
- Make small, single-file commits where possible. Fix root causes, not symptoms.
- Secrets live in `.env` (gitignored) and Vercel env vars — never in the repo or in chat.
- **DB migrations run in-app**, not via prisma migrate: hit an admin migrate route (e.g. the
  `/admin` page "Migrate: Flights" button → `api/admin/migrate-flights`; the main
  `api/admin/migrate` route creates core tables). Some API routes also self-heal with a
  guarded `ALTER TABLE ... ADD COLUMN` in a try/catch. Migrations use the app's own Turso
  connection — no secrets needed by the agent.

### Tooling gotcha — git index corruption
The Windows-mounted `Downloads/.git` index can corrupt when CLI git and GitHub Desktop write
`.git/index` at the same time (symptom: "bad signature"/"index file corrupt", or a commit that
phantom-deletes hundreds of files). Mitigations: prefer single-file commits; if it corrupts,
`rm .git/index` then `git reset --mixed origin/master` (or `--hard` if the tree is clean) to
rebuild, and commit through GitHub Desktop itself for multi-file/dir changes. A broken
`ORIG_HEAD` ref blocks `merge --ff-only`; `rm .git/ORIG_HEAD` then `git reset --hard origin/master`.

### Tooling gotcha — editor tool truncates; GitHub Desktop can crash
- The Read/Edit/Write file tools can TRUNCATE files in this Downloads folder (and their view can
  diverge from what git/bash see). **Write/patch files via the shell** (python / sed / cat heredoc);
  restore a clobbered file with `git show HEAD:path > path`. Verify with `wc -l` + esbuild after.
- **Stale-mount truncation (Jun 16 — caused a broken prod deploy):** the sandbox mount can serve a
  *stale, truncated* copy of a large file (hit on the ~95 KB `divisions/page.tsx`) — `stat`/`wc -c`
  agree on size yet the content ends mid-component — while git/GHD hold the full, correct file. A
  python read→write then persists the truncation and the build fails (`Unexpected end of file`).
  **Safe edit / recovery:** read the REAL file from git, not the working tree —
  `SHA=$(cat .git/refs/heads/master); git cat-file -p "$SHA:path" > /tmp/x` (use the SHA, **not**
  `HEAD` — the index is often corrupt so `HEAD` won't resolve). Edit the /tmp copy, **guard before
  writing** (assert it ends with the closing `}` AND esbuild is CLEAN), then write it back. **Never
  commit a write whose esbuild fails** — that means the read was truncated. If a truncated commit
  already landed, revert it in GHD (History → right-click commit → *Revert changes in commit*) to
  restore prod, then redo via the git-object method.
- GitHub Desktop's window occasionally hard-crashes to a black screen — a PC restart fixes it. The
  sandbox cannot reach github.com, so pushes go through GitHub Desktop on the Windows side.
- Chrome stealing frontmost focus blocks clicks on GitHub Desktop (it's read-tier) — re-open GHD or
  use Ctrl+P. GHD may open on a different monitor — use `switch_display`.

## Design standard (UI consistency)
- Icons: lucide-react only — never emoji.
- Palette: neutral slate base + teal as the single accent; semantic green / red / amber
  only for meaning (money, status). (globals.css global accent is teal app-wide.)
- Cards: one style — `bg-white border border-slate-200 rounded-xl`.
- Use the shared primitives in `src/components/ui` (Card, SectionHeader, StatCard,
  ActionButton); see `src/components/ui/README.md`. Shared game grid: `src/components/GameGrid.tsx`.
- Sentence case; avoid heavy bold.
- Note: the BracketBuilder/scoring bracket views are intentionally their own visual style
  (CFP "rail" layout); the rest of the app follows the light slate/teal standard.

## Current state (as of Jul 23, 2026)

- **sunshineeventsgroup.com = Sunshine's public domain (LIVE Jul 23)** — hosted directly on the
  whistle-ready Vercel project (NOT a forward). How it works:
  - `ORG_DOMAINS` in `src/lib/orgDomains.ts` maps the host → org slug; middleware rewrites root
    paths to `/o/{slug}/*`, so `/`, `/gallery`, `/register/vendor` and info pages serve at the root.
    `/tournaments/*` passes through. `/register` passthrough is EXACT-match only (org register
    pages must rewrite).
  - `LEGACY_REDIRECTS` (same file) 301s the old WordPress slugs (monster-mash-lax-clash, rules,
    vendors, register-teams, …) to their new homes; junk-prefix 301s clean up SportsPress demo
    URLs. **Event-slug targets hardcode the CURRENT season's tournament ids — update annually.**
  - Canonicals/sitemap/JSON-LD emit the custom domain for mapped orgs (`orgAbs`/`tournamentAbs`
    in `src/lib/seo.ts`) so search credit accrues to the org's domain, not whistleready.app.
  - Vercel: apex = Production, www = 308 → apex. DNS at **Hostinger** (registrar GoDaddy):
    A @ → Vercel, MX/SPF/SendGrid records untouched (domain has Hostinger email service).
  - sunshinelax.com = GoDaddy **301** forward → sunshineeventsgroup.com (was 302 → whistleready).
  - GSC: domain property verified (TXT in Hostinger DNS), sitemap submitted.
  - Old WordPress site: intact on Hostinger hosting (cancel later); browsable reference at
    web.archive.org (May 2026 snapshot).

## Earlier state (as of Jun 18, 2026)

- **Public event page builder (LIVE)** — each tournament has a public **event page** (`/tournaments/[id]/event`)
  rendered from an ordered **block list**, edited at **Setup → Event page → Page builder**
  (`src/components/BlockBuilder.tsx`). Architecture:
  - Content lives in AppSetting `tournamentSite:{id}` (via `api/tournaments/[id]/site`). The block model is
    `src/lib/eventBlocks.ts`: `resolveBlocks(c)` returns an ordered `Block[]` (`{id,type,hidden?,props}`),
    migrating from the older `sectionOrder`/`hiddenSections`. **Built-in** types (overview, fees, locations,
    hotels, rules, contacts, sponsors) are singletons whose content comes from dedicated fields; **custom**
    types (`custom`, `cta`, `faq`, `countdown`) are repeatable with content in `props`. `src/lib/eventSections.ts`
    holds labels/default order.
  - Builder: drag/▲▼ reorder, eye = show/hide, custom blocks add/duplicate/delete + inline edit. `faq` is a
    generic **Collapsible sections** block (Heading/Content, content is rich-text Markdown via `MarkdownField`;
    renders with `FaqBlock`). `countdown` = `CountdownBlock` (live timer to start date).
  - **Per-block display mode** (`props.display` = `inline` | `page`) on custom/faq: `inline` renders in the page
    body; `page` keeps it OFF the body and gives it its own page at `/tournaments/[id]/p/[blockId]` linked from
    the **Event info** dropdown (`EventInfoNav`). The built-in **Rules** has its own page at `/tournaments/[id]/rules`.
  - **Shared chrome**: `src/app/tournaments/[id]/_eventChrome.tsx` (used via `layout.tsx` on register / player-waiver /
    vendor-request / rules / p) wraps those pages in the org site header + the same event hero (logo, dates,
    action buttons, Event info dropdown). Public routes are allow-listed in `middleware.ts` and rendered light by
    `ThemeShell` (regex includes `event|rules|p|register|player-register|player-waiver|vendor-request`).
  - **AI drafting**: `api/ai/generate` (Anthropic SDK, reuses `ANTHROPIC_API_KEY` like `api/chat`,
    model `claude-haiku-4-5-20251001`, staff-only) + `src/components/AiGenerateButton.tsx` — "Generate with AI"
    on Overview / Hotels / Rules and on custom + collapsible content fields.
  - Divisions on the event page read **live** from `registrationDivisions` (Setup → Divisions), not a typed copy.
  - Gotcha: hero/panels use `overflow-hidden` for rounded corners, which clips absolutely-positioned dropdowns —
    render such menus inline (see EventInfoNav fix / Add-block menu).

## Earlier state (as of Jun 16, 2026)
Core flow: tournaments → divisions → pools → pool games → brackets → scheduler → assigner →
scores → public. Highlights shipped to live:

- **Jun 15-16 batch (all LIVE on master; bracket work tagged `stable-2026-06-15-bracket-fixes`):**
  - **New Tournament form** (`src/app/page.tsx`): number-of-fields (auto-creates Field 1–N venue),
    daily start/end times (→ venues `defaultAvailability`), team registration fee (any amount,
    `step=any`; pre-filled $1,495), logo upload, **registration mode** (built-in vs CSV import — hides
    fee + routes to importer when importing), canonical lacrosse divisions **none preselected**, and a
    "change later in Settings" note. Fields are written as objects `{id,name,abbr}` (not strings) so
    the Setup Venues editor renders them.
  - **Setup wizard `builder/page.tsx`**: "Schedule rules" renamed **"Game Timing & Format"**; added
    **period format** (halves/quarters/periods/running) + **time between periods**, saved to
    `scoringConfig` (rules route) and shown on the live scorer.
  - **Scheduler**: fixed `makeSlots` (was resetting minutes each hour → overlapping rows); **Day
    start/Day end** now load from saved daily times and **persist** (and field-save no longer wipes
    them). Added a **Game Scheduler link** card on the Divisions sidebar.
  - **Org self-serve**: owner "Your team" page (`/dashboard/org`), org-scoped invites
    (`/api/org/users`), director first-run welcome. `/api/tournaments` no-org fallback tightened to
    `[]` (users with no org see nothing — so assign Sunshine staff + Bill to their orgs).
  - **Divisions page**: per-division **delete a team** (Teams tab; also clears it from pools + deletes
    the now-empty registration); sidebar shows **pool vs bracket** game counts; **Smart Defaults** got
    an editable Game-guarantee field + **Save as global default** checkbox (`/api/smart-defaults-default`).
  - **Bracket fixes** (`bracket/route.ts` + `BracketBuilder.tsx` + public): consolation auto-pairing
    no longer creates rematches (don't pair L-Bx vs L-By when one game's winner feeds the other —
    validated 4-16 teams); **inline ✎ edit** of consolation matchups; **de-conflated** "2-game
    guarantee" (loser-fed, any count) vs **"Both-ways consolation"** (the 8/16 mirror); the both-ways
    **mirror only renders when the bracket has a "Consolation Championship" game** (builder + public)
    so loser-fed/odd-count brackets show the clean standard layout instead of garbling.
  - Misc: removed Payroll from People dropdown; collapsible tournament header (shows logo when
    minimized, persisted); Schedulers added to Settings → Broadcast permissions; broadcast-roles save
    now allows `admin` (not just `director`); dark-mode fix for rose/red/pink-50 tints (division rows).
  - **Imports**: bulk import no longer requires contact email/phone (`source:'import'`); import UI
    genericized ("Import teams from a spreadsheet"; TourneyMachine as one example); Registrations page
    "Import" button now links to the import wizard.

- **Dashboard redesign (LIVE, Jun 14 — tag `stable-2026-06-14-dashboard-scheduler`)**: the tournament
  dashboard + header were de-cluttered. `TournamentNav` now groups everything into click-open
  dropdowns (mobile-friendly, close on outside-click/route change): **Dashboard · Setup
  (tournament setup/divisions/scheduler/assigner) · People (team regs/player rosters/staff
  roster/payroll) · Game Day (scores/assignments/ops/incidents/checklist/staff contacts/staff
  view/broadcast) · Financials · Settings** + persistent Register/Public buttons. The dashboard
  **body** (`dashboard/page.tsx`) was slimmed to: an **At a glance** KPI row (teams/games/assigned
  %/collected %), a **Game Day console** (live-tool cards, "Live now" badge when event date is
  today), an expandable **Registered teams** section (tap a division → lists its teams, fetched from
  `/api/registrations?tournamentId=`), and ONE compact **Money** snapshot linking to full
  Financials. The old 6-hub Admin grid + duplicated P&L/registration-financials sections were
  removed (nav covers them). Gotcha fixed: the tab bar must NOT use `overflow-x-auto` (clips the
  dropdowns) — use `flex-wrap`.
- **Scheduler role (LIVE, same tag)**: a schedule-builder role, peer to Assigner. In
  `role-permissions.json` it has broad access (dashboard, schedule, divisions, roster, availability,
  assignments, registrations, player rosters, settings, scores, staff pool) with **pay summary,
  financials, and time entries OFF**. Wired everywhere a role is referenced: middleware `ROLE_HOME`,
  login redirect, admin **Users** dropdown, admin **Permissions** matrix column, NavBar
  labels/colors + "View as" preview list, and a new role-home at `/dashboard/scheduler`
  (Schedule/Divisions/Manage/Ops cards). Role is a plain string (no enum/migration) — assign via
  admin Users. Fine-tune the rest on the Perms page.
- **On-field workers = the Staff role (convention)**: refs, field ops, scorekeepers, and trainers
  all log in as **Staff**; their specific job comes from Assigner assignments + per-game permissions
  (the **`game_scorekeeper`** "Scorekeeper (Live Game)" feature opens `/tournaments/[id]/games/[gameId]/scorekeeper`).
  There is deliberately NO separate Scorekeeper/Ref/Trainer account role or Perms column. Legacy
  `ref`/`scorekeeper`/`viewer` role values are remapped to `staff` in middleware.
- **Dark-mode polish**: zebra-striped tables using translucent `bg-*-50/50` rows were missed by the
  `gd-dark` overrides (only the un-suffixed `bg-*-50` was handled), leaving a muddy light band. Added
  `body.gd-dark [class*="bg-gray-50/"], [class*="bg-slate-50/"] { background:rgba(255,255,255,0.03) }`.

- **Divisions page** — tabs are **Teams & Pools / Games / Bracket**. Pools are merged into the
  Teams tab (inline pools bar: chips w/ live counts, add, delete, unassigned badge). A **List
  view / Assign Pools** toggle: "Assign Pools" opens a clean side-by-side **pool-column** view
  with drag-to-reassign + an **Auto-assign teams** button (the standalone assign-pools page was
  retired). The **Games** tab lists pool games (P#) AND bracket games (B#) with date/time/field
  (`pool-games?scope=bracket`). Team rows show team logo/initial badge.
- **Smart Defaults** (per tournament, localStorage): per team-count plan — games/team, pools,
  bracket format, advance, consolation. One-click **generate-all** (pools + pool games + brackets,
  with an "Include brackets" toggle).
- **Brackets — Stage 1 generator**: handles odd/in-between counts with byes + real consolation.
  Owes rule (guarantee − pool games): owes≤1 → top-N advance + seed-paired consolation (7v8, 9v10);
  owes≥2 → everyone-in + loser-fed consolation + "if needed". Full spec in `BRACKETS.md`.
- **Brackets — Stage 2 flighting**: a division can split into **Flight A / B** brackets, each with
  its own champion. `Bracket` has `flight` (default "A") + `numberOffset` (default 0) — every
  existing bracket = Flight A / offset 0, fully backward compatible. Bracket API **GET returns an
  array of flights**; POST has a **split** action (cutoff on the seed list → Flight A seeds 1..N +
  Flight B rest, continuous B# numbering via numberOffset); PATCH/DELETE scoped per flight
  (`?flight=A|B`). BracketBuilder has a "Split into flights" panel + a Flight A/B switcher. Migration
  = `/admin` "Migrate: Flights" (already run on Turso). Data model supports >2 flights (B2) already.
- **Bracket redesign (CFP "rail" style)** on the builder preview and the scoring `/bracket` page:
  each team on its own bar with a teal seed chip, team logo, and name; amber for byes/champion;
  feeder-graph layout drives straight right-angle connectors (byes offset to pair with their feeder).
- **Public bracket = light rail** (matches the builder, kept light for spectators): each team on its own
  bar with a seed chip, logo, scores and a date/time/field caption; feeder-graph layout fixed the old
  bye overlap; **orange seed chips** mark bye teams and bye games are offset so the winner-feeder lines
  up with its feeder; champion caps sit ABOVE the finals; a **Zoom** control shrinks it to fit.
- **Consolation (both-ways) tournament bracket** — the format formerly "2-Game Guarantee" is now
  **"Consolation (both-ways)"** (builder picker + Smart Defaults + template catalog). When chosen it
  renders as a MIRROR: round-1 down the centre, winners flow RIGHT to the **Champion**, first-round
  losers drop LEFT through a consolation bracket to the **Consolation Champion** (two champions). On the
  public view and the builder Preview (dark); the 3rd-place game shows as a separate "Placement" card;
  champion caps above their finals + zoom; the builder mirror supports per-game × delete + "+ Add game".
  Opt-in — only the 2gg format renders the mirror, everything else is unchanged. Detection ignores
  bracket placeholder names (Seed/W-B), which repeat across divisions.
- **Logos/crests**: `RegisteredTeam.logoUrl` (uploaded + client-compressed ≤512px on the Divisions
  Edit-Team and Registrations forms); `/teams` returns logoUrl; `team-logos` endpoint feeds crests
  on brackets and public pages.
- **Public page** (`/public`): division tiles, **standings** (W/L/GA/GF/GD/Last-3, division dropdown,
  advances-to-bracket cutoff, tiebreaker-aware sort), redesigned **schedule** (grouped-by-date cards,
  filters, by-time/by-field, up-next + .ics), and a full **SVG bracket tree** (multi-flight aware via
  numberOffset). The old `/results` page was deleted and consolidated into `/public`.
- **Configurable tiebreakers**: schema + `tiebreaker-default` endpoint (AppSetting `defaultTiebreakers`)
  + two-section Settings editor with save-as-default; `/public` standings read tournament tiebreakers.
  Spec in `TIEBREAKERS.md`.
- **Scores / scorekeeping**: `/scores` page (director/assigner) with role badge + scored/total;
  `/games/[gameId]/scorekeeper` view; `role-permissions.json` wired `tournament_scores` +
  `game_scorekeeper` (fixed scorekeeper role that had all perms false).
- **Staff hub + core workspace** already on the design standard: Financials, Roster, Availability,
  Time Entries, Pay Summary, Registrations, Settings, Scheduler, Assigner (drag staff to role-slots,
  per-game ref counts, lock-editing toggle, staffing-requirements panel), Scores, Assignments, Results.

- **Staff game-day app (LIVE, Jun 14 — tag `stable-2026-06-14-staff-ops`)**: the prototype staff
  features ported into the real app and merged to production from branch `staff-ops-messaging`. All
  AppSetting-backed (no schema migration), staff-only (external roles = coach/parent/club_director
  excluded via `isStaff`), mobile-first, slate/teal standard.
  - **Ops board** (`/tournaments/[id]/ops`, api `ops-messages`): ANY staff can send quick game-day
    messages ("ball to Field 5", "trainer to Field 7") with a field input + templates + group target
    (all/fieldops/medical/refs/scorekeepers/assigners); live feed polls ~15s; delete (director any,
    others own). Delivery is in-app for now (SMS later).
  - **Role home dashboards** rebuilt to standard: `/dashboard/director` and `/dashboard/assigner` —
    per-tournament cards with quick actions (Manage/Scores/Ops/Broadcast + public link; Schedule/
    Assign/Avail/Ops).
  - **Staff directory** (`/tournaments/[id]/directory`, reads `roster`): searchable, role-grouped,
    tap-to-call (`tel:`) / tap-to-text (`sms:`).
  - **Incidents** (`/tournaments/[id]/incidents`, api `incidents`): log medical/safety/facility/
    weather/other w/ severity + field; Open vs Resolved lists; resolve/delete.
  - **Setup checklist** (`/tournaments/[id]/checklist`, api `checklists`): a SINGLE SHARED
    tournament-setup list (not per-field) — any staff can check items off and ADD/REMOVE their own;
    GET returns stored items or seeded defaults, **PUT replaces the whole list** and stamps
    done-by/done-at for items that just flipped done; 100-item cap. Linked from the dashboard
    "Field Ops" hub as "Setup checklist".
  - **Sandbox badge** (`src/app/EnvBadge.tsx`, in `layout.tsx`): amber "SANDBOX PREVIEW" pill bottom-
    right on previews/local; auto-hides on production (`whistleready.app` / `www.` /
    `whistle-ready.vercel.app`, or `NEXT_PUBLIC_VERCEL_ENV==='production'`) so a test copy is
    never mistaken for live.

- **Scheduler — Auto-fill (assists the drag-and-drop)**: a teal **Auto-fill** button + a pure, tested
  engine in `src/lib/autoSchedule.ts`. Places parking-lot games (after your filters) onto the grid by
  the rules: no team/field double-book, bracket games after their feeders, max 3/team/day, **spread a
  division across fields** (parallel play + rest) while keeping each team on consistent fields, and
  **one-on-one-off** rest spacing (~2 slots; penalise back-to-back). A **day-split** dropdown by the Auto-fill
  button chooses how days are assigned: **Pool d1 / bracket d2** (default, unchanged), **Pool all days /
  bracket last** (overflow-spreads pool across days, brackets last day), or **All on this day**. The engine
  (`autoSchedule.ts`) is untouched — only day-assignment orchestration (`autoFillDay` via a `fillAcross`
  helper) changed. The Game-Type filter still lets you run pool/bracket separately. A **grid Zoom** shows more games.
  Placeholder names (Seed/W-B/L-B/TBD) are NOT real teams (`isRealTeam`) — they repeat across divisions;
  the scheduler's conflict checker uses the same filter. Refs/scorekeepers are scheduled LATER on the Assigner.
- **Scheduling memory**: `SCHEDULING-PATTERNS.md` records patterns learned from real manually-scheduled
  tournaments (CSV exports or TourneyMachine public links — any sport, rendered via Claude-in-Chrome and
  parsed). A Jun-12 batch crunch (8 events, 4 sports — lacrosse/volleyball/baseball/basketball — across
  TourneyMachine, AES and Summer Faceoff) **validated** the lacrosse weights (rest target 2 slots,
  spread-across-fields, max 3/day) and showed slot-length / games-per-day / rest-tolerance are
  **sport-specific**, and day-split varies even within lacrosse. Next work is structural (day-split as a
  choice = #1), not re-weighting. Full table + takeaways in `SCHEDULING-PATTERNS.md`.

## Open / next
- **Forms library (in progress on `org-forms-library`)**: org Admin → Forms = reusable **templates**;
  each tournament gets a working copy. Three planned: **Player Waivers** (built — editable waiver text +
  optional fields + confirmation + email; public per-tournament form at `/tournaments/[id]/player-waiver`
  with team dropdown from that tournament's registrations + a public-page button; staff entries list at
  `/tournaments/[id]/player-waivers`), **Team Registration**, **Vendor Request**. Submissions stored in
  AppSetting `orgFormSubmissions:{orgId}` tagged with tournamentId.
- **Post-submission email = invite to create a player profile (REMEMBER — requested Jun 17)**: Jotform emails
  registrants a formatted PDF receipt of their entry. We need to (a) email a receipt of the submitted details,
  and (b) **craft an invite letter prompting them to log into the app to create a Player Profile and more**.
  Ties to the future **player profiles + individual registration (with payment)** work — do that letter when
  player profiles exist. Current waiver email is plain confirmation text only.
- **Help & support (NEW — requested Jun 16)**: add a persistent **help icon** in the app chrome
  (likely in `TournamentNav`) that opens **support documentation** (in-app help center / docs), plus
  **some form of chat** (live support or an assistant chatbot). Scope TBD — could start with a docs
  drawer + a contact/chat widget and grow into in-product help. Note there is already a `ChatWidget`
  component in `tournaments/[id]` to build on or reconcile with.
- **Staff app — Phase 3**: two-way team/coach messaging (in-app + email). **Phase 4**: SMS/Twilio
  delivery for ops messages + push/PWA. (Done & live: ops board, role dashboards, staff directory,
  incidents, setup checklist, sandbox badge — see "Staff game-day app" above.)
- **Consistency pass — remaining pages**: Staff view, Returning teams. (Done: the full Staff hub,
  Registrations, Settings, Scheduler, Assigner, Divisions, Scores, Assignments, Results, Public.)
- **Scheduler auto-fill — next layers** (calibrate from `SCHEDULING-PATTERNS.md` as more examples land):
  make the day-split a CHOICE (pool/bracket-by-day vs pool-across-all-days — it varies); game-duration /
  slot-length per division; field designations (which divisions/formats a field allows, e.g. 7v7 fields)
  honoured in auto-fill; identify a team by **division+name** (club names repeat across divisions); then
  ref/scorekeeper auto-assignment on the Assigner.
- **Double-elim / 3rd flight (B2)**: data model already supports >2 flights via the `flight` column.

## Known cruft / cleanup
- `next.config.js` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`; ~40 pre-existing
  TS errors exist (e.g. Prisma model types not in schema) and are non-blocking.
- Some per-user settings (Assigner lock, games-per-ref, Divisions Smart-Defaults plan) persist in
  localStorage per tournament, not the DB.

## Build philosophy
- Diagnose before changing; verify after.
- Preview visual changes before deploying — keep Bo in the loop with a preview.
- Prefer shared components and conventions so the codebase stays consistent over time.
- Be careful with secrets and with irreversible actions (deletes, pushes, payments).
