# GameDay Staff — project guide & working philosophy

This file is read automatically at the start of any Claude / Cowork session that has
this repo connected. It is the project's memory: what the app is, how we work, and the
standards to follow. Keep it updated as things evolve — editing this file is how you
"teach" future sessions, on any computer.

## The app
GameDay Staff — tournament management for Sunshine Events Group (lacrosse and other
sports): tournaments, divisions, pools, brackets, team & player registration, staff
assignment, payroll, and financials.

- Stack: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
  Prisma + Turso (libSQL) · NextAuth · Stripe · hosted on Vercel.
- Repo: github.com/bolamon22/gameday-staff5 (public). Live: gameday-staff5.vercel.app.

## How we ship (workflow)
- Local working copy lives at `C:\Users\lacro\Downloads\gameday-staff5` — connect this
  folder in Cowork to work on it.
- Verify before shipping: type-check (`tsc --noEmit`) and/or an esbuild parse; preview
  UI changes before deploying.
- Deploy: commit -> push to `master` in GitHub Desktop -> Vercel auto-builds and redeploys.
- Make small, reviewable changes. Fix root causes, not symptoms.
- Secrets live in `.env` (gitignored) and Vercel env vars — never in the repo or in chat.

## Design standard (UI consistency)
- Icons: lucide-react only — never emoji.
- Palette: neutral slate base + teal as the single accent; semantic green / red / amber
  only for meaning (money, status).
- Cards: one style — `bg-white border border-slate-200 rounded-xl`.
- Use the shared primitives in `src/components/ui` (Card, SectionHeader, StatCard,
  ActionButton) instead of ad-hoc markup. See `src/components/ui/README.md`.
- Sentence case; avoid heavy bold.

## Consistency pass — progress
Rolling the design standard across every page (replace emoji with lucide icons, unify
palette and cards), in this order:
1. Core workspace — Assigner, Scheduler, Divisions, Registrations, Financials, Settings,
   Scores, Roster, Assignments, Results, Pay summary, Staff view, Availability,
   Returning teams, Time entries.
2. Public / registration — Public, Register, Individual register, Join, Invite.
3. Role dashboards — club-director, parent, coach, ref, scorekeeper, director, viewer.
4. Admin / system pages.

Done: shared UI components, Dashboard redesign, TournamentNav header, UTF-8 encoding
fixes, builder year-regex fix, the full Staff hub — Financials, Roster, Availability,
Time Entries, Pay Summary — Registrations (lucide icons, slate/teal palette,
sentence case; team + individual tabs, import panel, pricing/payment modals), and
Settings (lucide SectionCard icons, slate/teal palette, sentence case; venues/fields,
fees, divisions, pay rates, ref rules, registration types, copy-tournament modal), and
Scheduler (lucide icons for toolbar + status badges, blue→teal accent, sentence case;
drag-drop grid, parking lot, swap mode, publish/diff, conflict/back-to-back/bracket badges),
and Assigner (drag staff onto game role-slots via shared GameGrid mirroring the Scheduler;
staff tray sorted + color-coded by type with key; per-game ref-count -/+ and tournament
default; lock-editing toggle persisted per-tournament; staffing-requirements panel —
min officials vs current roster, scorekeepers = one per field). Shared component:
src/components/GameGrid.tsx — and Divisions (sky→teal accent, lucide icons, sentence case;
divisions list, teams/pools/pool-games/bracket tabs, swap mode, generate flows; editable
Smart Defaults plan per team count — games/team, pools, bracket format, saved per tournament,
applied on generate). Also
flipped the GLOBAL accent in globals.css from sky to teal (btn-primary, .input/.select
focus, .card-hover) so primary buttons + inputs are teal app-wide.
Next up: Scores, Assignments, Results, Staff view, Returning teams.
Tracking: Roadmap #57 (consistency pass) and #58 (page consolidation review).

## Session handoff (Jun 11, 2026)
What shipped to live this session (all deployed):
- Restyled to the design standard: Registrations, Settings, Scheduler, Divisions. Flipped the
  GLOBAL accent in globals.css from sky to teal (btn-primary, .input/.select focus, .card-hover)
  so primary buttons + inputs are teal app-wide.
- Assigner: full redesign — drag staff onto game role-slots, staff tray sorted/color-coded by
  type with a key, per-game ref-count -/+ and a tournament "Refs per game" default, a
  Lock-editing toggle (persists per tournament, disables drag/assign/ref/score edits), and a
  staffing-requirements panel (min officials vs roster; scorekeepers = one per field).
- Retired the old ref machinery: removed Settings "Ref Count Rules" and the Staff Roster
  "Game Target" column. Ref counts now live per-game on the Assigner; pool-game generation
  defaults to 2 refs; Assigner grid + List/Division read each game's own refCount.
- Divisions Smart Defaults: editable per-tournament plan (team count -> games/team, pools,
  bracket format), saved in the browser. Generate-all creates the planned # of pools and splits
  teams; the chosen bracket format pre-selects on each division's Bracket tab.

Open / next:
- Consistency pass remaining: Scores, Assignments, Results, Staff view, Returning teams.
- BRACKETS (next project, not built): templates in src/lib/bracketTemplates.ts only cover 4/8/16
  for single / single+3rd / double / 2-game-guarantee. Odd/in-between counts (5,6,7,9...) fall
  back to single-elim and do NOT honor the labeled guarantee (a 7-team "2GG" gives first-round
  losers only one game). In lacrosse the guarantee normally comes from POOL PLAY (2-3 pool games)
  with single-elim on top. Need: proper byes for odd counts + real consolation/playback
  structures. Bo is filling in a per-division planning sheet (team count -> pool play?/#pools,
  advance count, bracket format, placement/guarantee); build templates from that. A one-page
  "Tournament Bracket Formats - Reference & Planning" .docx was generated to capture this.

Working notes: writes to this folder via the editor tool can truncate (write via shell instead);
the sandbox can't push to GitHub (push via GitHub Desktop on master). Some per-user settings
(Assigner lock, games-per-ref, Divisions smart-defaults plan) persist in localStorage per
tournament, not the DB.

## Session handoff (Jun 11, 2026 - afternoon)
Shipped (deployed to master):
- BRACKETS Stage 1 complete: generator handles odd/in-between team counts with byes + real
  consolation/playback; owes rule (guarantee - pool games): owes<=1 -> top-N advance + seed-paired
  consolation (7v8, 9v10); owes>=2 -> everyone in bracket + loser-fed consolation + "if needed"
  games. Smart Defaults recommends advance/consolation per team count. One-click "generate all
  divisions" (pools + pool games + brackets) with an "Include brackets" toggle. Bracket Preview
  supports inline rename/add/remove and a pool-standings table on the Seeds tab.
- Consolidations: (1) Bracket builder slimmed to TWO tabs - Seeds + Preview; the old Games tab is
  gone, its add/remove panel now toggles from the Preview's "+ Add game". (2) Divisions page merged
  Pools INTO the Teams tab - now "Teams & Pools": an inline pools bar (chips w/ live counts, add,
  delete x, unassigned badge, Auto-assign) + a "Group by pool" toggle on the table. Tabs are now
  Teams & Pools / Pool Games / Bracket.

Open / next:
- Stage 2 flighting (2 champions in one division): needs a data-model change - currently ONE bracket
  per tournamentId+division (bracket route + DB assume this). To support Flight B/B2: store multiple
  brackets per division + UI to define flights + run the generator per seed-slice.
- Bracket games schedule on the Preview: bracket games ARE already created as schedulable Game rows
  (gameNumber B1, B2...) and the Scheduler surfaces them (type 'bracket', parking lot, drag to
  field/time, out-of-order check). But the Bracket Preview only reads the bracket STRUCTURE
  (BracketGame), so it shows no times/fields. Plan: fetch the division's B-games and show each game's
  date/time/field on its preview card (read-only; "Not scheduled" when blank). May need a tiny
  endpoint to expose B-game times to the builder.
- Consistency pass remaining pages: Scores, Assignments, Results, Staff view, Returning teams.

## Build philosophy
- Diagnose before changing; verify after.
- Preview visual changes before deploying — keep Bo in the loop with a preview.
- Prefer shared components and conventions so the codebase stays consistent over time.
- Be careful with secrets and with irreversible actions (deletes, pushes, payments).

<!-- redeploy nudge: 2026-06-11T21:51Z -->
