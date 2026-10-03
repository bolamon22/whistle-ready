---
title: Build a bracket, seeds and flights
category: Setup
order: 44
routes: /tournaments/*/divisions
keywords: bracket playoff playoffs single elimination double elimination consolation both-ways 3rd place seeds seeding flights flight A flight B champion reset bracket add bracket game rename label
---
Each division can have a playoff bracket. Pool standings feed the seeds, and bracket games go to the Scheduler as B# games.

**Where:** **Setup → Divisions & teams**, pick a division, open the **Bracket** tab.

**To create a bracket:**
1. Pick a **Format**: **Single Elimination**, **Double Elimination** or **Both-ways consolation**.
2. Set **Teams in bracket** (the top N seeds advance) and **Consolation games** (extra consolation game slots).
3. For divisions with only two pool games, tick **2-game guarantee · every team plays a 2nd game** and set **Teams in bracket** to the full team count.
4. Click **Generate Bracket**.

**To seed the bracket:**
1. Open **Seeds**.
2. Click **Seed from standings ↓** to fill seeds from **Pool standings**, or pick teams by hand.
3. Click **Save Seeds**.

**To review and edit:** open **Preview**. Click a game label to rename it, use the pencil (**Edit matchup**) to change who plays, or **×** to remove a game. **+ Add game** adds one (pick the **Section**, **Round**, **Team 1 source** and **Team 2 source**, such as seed:1 or winner:3, plus an optional **Label** like 3rd Place). **Zoom** resizes the tree.

**To split into two flights:** click **Split into flights (2 champions)**, set the **Cutoff** (top seeds go to **Flight A**, the rest to **Flight B**) and confirm. **Cancel split** undoes it.

In **Both-ways consolation**, winners move right to the **Champion** and first-round losers move left to a **Consolation Champion**.

**Common problems:**
- **Reset** deletes the bracket and all its games after a confirmation. This cannot be undone.
- Splitting into flights needs at least 3 ranked teams. With no pool standings yet, finish pool play or seed by hand first.
- Dates, times and fields are set on the **Scheduler**; unplaced bracket games show **Not scheduled**.
- The public **Bracket** tab shows bracket games once pool play concludes.
