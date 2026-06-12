# Scheduling patterns — learned from real tournaments

This file is the durable memory for the auto-scheduler. As Bo provides real,
manually-scheduled tournaments (CSV exports preferred), record the observed
patterns here AND fold the rules into `src/lib/autoSchedule.ts`. Both live in git,
so they're remembered across sessions and computers.

## How to feed examples
- Best format: a game-by-game CSV with columns like:
  `Game Number, Game Date, Start Time, Division, Pool, Location, Team 1, Team 2, [scores]`.
- Plus, per division: team count, # pools, whether it has a bracket and which format.
- Screenshots are a useful supplement for the visual "feel" but the CSV is what
  lets us measure patterns precisely.

## Analysis method
`Game Date`+`Start Time` → minutes; group by team (per day) for rest gaps; group by
(day,time) for parallelism; per division track fields-per-day for spread; detect bracket
games by placeholder team names (W-/L-/Seed/#). NOTE: club names repeat across divisions,
so identify a team by (division + name), not name alone.

## Findings

### Sunshine State Summer Kick-Off '26 (sample #1)
292 games · 2 days (5/16–5/17) · 17 divisions · 14 fields.
- **Rest gap between a team's consecutive games:** distribution (in slots) ≈ {0:54*, 1:121, 2:191, 3:20, 4:16, 5:1}. Mode = **2 slots ("one on, one off")**. Back-to-back (1) still occurs ~25% when forced. (*0s/some 1s inflated by club-name reuse across divisions.)
- **Games per team per day:** mostly **2–3** (1:30, 2:49, 3:52); higher counts are cross-division name collisions.
- **Spread:** divisions use **4–7 fields per day**; parallelism avg **12.2** games at once (up to 14). → spreading a division across many fields is correct; cramming onto one is not.
- **Slot increment:** **50 min** between games on a field (game length + buffer).
- **Day split:** pool play ran across **BOTH days** (day1 173 pool/8 bracket, day2 107 pool/4 bracket). Only 12 bracket games total; most divisions had no bracket. → "pool→day1, bracket→day2" is NOT universal; it must be a per-tournament CHOICE, not a hard rule.
- **Field designation:** 7v7 divisions play on dedicated "Field 2A (7's)" fields → confirms need for field→division/format restrictions.
- **Staggered hours:** divisions don't all play the same window; older divisions run later (HS B2 to 6pm), younger earlier-ish but not strict. → keep age-time a faint nudge only.

## Open implications for the auto-scheduler (to act on)
1. Make the **day assignment a choice**: "pool day 1 / bracket day 2" OR "spread/round-robin across all days". Don't hard-code.
2. Add a **game-duration / slot-length** notion (so a division's slot = duration + buffer), not just the global increment.
3. **Field designation** (divRestrictions: which divisions/formats a field allows) — surface in settings and honor in auto-fill.
4. Identify teams by **(division + name)** to avoid conflating same-named club teams across divisions.

_Confirmed by sample #1: spread across fields ✓, one-on-one-off rest target ✓, max ~3/day ✓._

### Monster Mash 2025 (sample #2 — via TourneyMachine public link)
Lacrosse · Oct 25–26 · 8 divisions. Source: tourneymachine.com public results (rendered in-browser, parsed per-division Division.aspx pages — confirms public links are analyzable, incl. other sports on the same platform).
- **Day split:** pool day 1 (Sat), bracket day 2 (Sun) — e.g. Boys 12U: P1–P6 Sat, B1–B3 Sun. **Opposite of sample #1**, which pooled both days → confirms day-split must be a per-tournament CHOICE.
- Small divisions (4 teams) = 6 pool games (round-robin, 3 each) on ~2 fields; bracket = 4-team single-elim (2 semis + final) next day.
- Bracket times: semis same slot (1:00), final later (2:40) — feeders before dependents (matches our bracket-order rule).
