# GameDay Staff — project guide & working philosophy

This file is read automatically at the start of any Claude / Cowork session that has
this repo connected. It is the project's memory: what the app is, how we work, and the
standards to follow. Keep it updated as things evolve — editing this file is how you
"teach" future sessions, on any computer. Keep it lean: fold old session notes into
"Current state" rather than stacking dated handoffs forever.

## The app
GameDay Staff — tournament management for Sunshine Events Group (lacrosse and other
sports): tournaments, divisions, pools, brackets, team & player registration, staff
assignment, payroll, financials, public schedule/standings, and live scorekeeping.

- Stack: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
  Prisma + Turso (libSQL) · NextAuth · Stripe · hosted on Vercel.
- Repo: github.com/bolamon22/gameday-staff5 (public). Live: gameday-staff5.vercel.app.

## How we ship (workflow)
- Local working copy: `C:\Users\lacro\Downloads\gameday-staff5` — connect this folder in Cowork.
- Edit/verify in a sandbox copy, then copy changed files into the Downloads working copy.
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

## Current state (as of Jun 12, 2026)
Core flow: tournaments → divisions → pools → pool games → brackets → scheduler → assigner →
scores → public. Highlights shipped to live:

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

- **Scheduler — Auto-fill (assists the drag-and-drop)**: a teal **Auto-fill** button + a pure, tested
  engine in `src/lib/autoSchedule.ts`. Places parking-lot games (after your filters) onto the grid by
  the rules: no team/field double-book, bracket games after their feeders, max 3/team/day, **spread a
  division across fields** (parallel play + rest) while keeping each team on consistent fields, and
  **one-on-one-off** rest spacing (~2 slots; penalise back-to-back). Pool games → day 1, bracket → day 2
  automatically (Game-Type filter lets you run them separately). A **grid Zoom** control shows more games.
  Placeholder names (Seed/W-B/L-B/TBD) are NOT real teams (`isRealTeam`) — they repeat across divisions;
  the scheduler's conflict checker uses the same filter. Refs/scorekeepers are scheduled LATER on the Assigner.
- **Scheduling memory**: `SCHEDULING-PATTERNS.md` records patterns learned from real manually-scheduled
  tournaments (CSV exports or TourneyMachine public links — any sport, rendered via Claude-in-Chrome and
  parsed). Samples #1 (Sunshine State) + #2 (Monster Mash) confirm spread + one-on-one-off rest and show
  the day-split varies. Feed more → fold findings into that doc AND the autoSchedule weights.

## Open / next
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
