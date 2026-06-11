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

## Build philosophy
- Diagnose before changing; verify after.
- Preview visual changes before deploying — keep Bo in the loop with a preview.
- Prefer shared components and conventions so the codebase stays consistent over time.
- Be careful with secrets and with irreversible actions (deletes, pushes, payments).
