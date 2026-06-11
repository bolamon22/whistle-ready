# Bracket generation — spec

How SEG runs playoff brackets, and what the generator must produce. Replaces the old
behavior where only 4/8/16 had templates and everything else silently became single-elim.

## The one rule
Every team must reach the **game guarantee** (default 4). Pool play provides P games.
The bracket auto-adds loser-fed games (consolation / "3rd place" / if-needed) until
every team, in every outcome, has played at least (guarantee − P) bracket games.
"3rd place", "consolation", and "if-needed" are all the same mechanism — filling the guarantee.

## Inputs (per division; Smart Defaults preset, editable at generate)
- teamCount
- pools: sizes (e.g. 4,6) + pool games per team P (capped; partial round-robin if pool larger)
- gameGuarantee (default 4)
- advance: how many seeds go to the championship bracket (chosen so the consolation group is even)
- flights: 1+ contiguous seed slices, each with its own champion (Stage 2)

## Pool play (already built via Smart Defaults)
- Snake-seed teams into the specified pools; each plays P games (full RR if pool−1=P, else balanced partial).
- Seed all teams 1..N by pool record (tiebreak: goal differential, then goals for).

## Playoff — derived from (guarantee − P)
- **owes 1** (e.g. 3 pool games): top `advance` seeds -> single-elim bracket; the rest play one
  seed-paired consolation game each (adjacent: 7v8, 9v10 — competitive).
- **owes 2** (e.g. 2 pool games): ALL flight teams -> single-elim bracket (byes/play-ins as needed);
  first-round losers get a loser-fed 2nd game (a "3rd place" game in a 4-team flight; a consolation
  round in bigger ones); plus conditional **if-needed** games for any bye/upper seed that loses its
  first game and would finish short. If-needed opponent = loser of the strongest first-round game in
  the opposite half. If-needed games are only kept if that seed actually loses.

## Seeding
- Championship bracket: standard single-elim with byes to top seeds; R1 high-low (4v5, 3v6, 2v7 ...).
  DECISION PENDING: standard (U8 10-team) vs top-seed-protected (HS B 12-team) — default standard, optional toggle.
- Consolation pairing: adjacent seeds (competitive).
- Builder stays hand-editable; we standardize auto-generate and let Bo tweak.

## Flighting — 2+ champions (Stage 2)
Division splits into contiguous seed slices; each runs the playoff independently (B-Champion, B2-Champion).
Needs data-model support for multiple brackets per division + UI.

## Validated against real SEG brackets
- Boys U8 (10, 3 pool): advance 6; consolation 7v8, 9v10. matches generator.
- Boys U10 B (6, 3 pool): advance 4; consolation 5v6.
- Boys HS B (12, manual): advance 6 + 3 consolation games (top-seed-protected R1 seeding).
- Boys HS B2 (9, 3 pool): advance 5; consolation 6v7, 8v9.
- Boys U14 A (9, 2 pool): full bracket (8v9 play-in) + loser-fed consolation + if-needed game.
- Girls HS Open (13, 2 champions): Flight B (top 4, 3rd-place = guarantee filler) + Flight B2 (8-team + loser consolation).

## Current code state (after Bo's home work)
- BracketBuilder.tsx already: Seeds tab (rename teams per seed), Games tab (add/remove games with
  seed:/winner:/loser: sources + labels), advance count (top N) + consolation slots, reads Smart Defaults.
- generateSEGames (bracket route) already: single-elim any size w/ byes, champion-only, seed-paired
  adjacent consolation. = the "owes 1" mode.

## Build stages
- Stage 1: (a) auto-generate the "owes 2" games — loser-fed consolation + conditional if-needed — from
  the guarantee rule (today these are built by hand); (b) inline editing on the Preview tab
  (rename teams, add/remove games — wire existing actions onto the visual).
- Stage 2: flighting (multiple champions per division) — data model + UI wrapper running Stage 1 per flight.
