---
title: Generate pool games and brackets for all divisions
category: Setup
order: 42
routes: /tournaments/*/divisions
keywords: generate games pool games round robin games per team game guarantee smart defaults bulk generate generate all divisions renumber clear games add game change matchup delete game
---
Pool games are built per division from the teams in each pool. You can build one division at a time or every division at once.

**Where:** **Setup → Divisions & teams**.

**To build every division at once:**
1. In the **Bulk Generate** box on the left, set the **Game guarantee** (games each team is promised).
2. Click **Smart defaults** to fill in games per team for each division from its team count. The pencil (**Edit smart defaults**) opens your plan by team count: **Games/team**, **Pools**, **Bracket**, **Adv** and **Consol.**; click **Save**.
3. Tick **Pool games**, **Brackets**, or both.
4. Click the button (**Generate all divisions**, **Generate pool games** or **Generate brackets**, depending on the ticks).

**To build one division:**
1. Pick the division and open the **Games** tab.
2. Set **Games per team** and click **Generate games**.

**To fix games by hand (Games tab):**
- Change a matchup with the pencil, or delete a game with **Delete this game**.
- Add a game: pick the **Home team…** and **Away team…**, then click **Add game**.
- **# Renumber** renumbers the games. **Clear all** deletes all pool games after **Delete all games?**.
- **Filter by team** narrows the list.

Pool games are numbered P#; bracket games are B#. Set dates, times and fields on the **Scheduler**, where new games wait in the parking lot.

**Common problems:**
- If games are already scheduled, you see **Scheduled Games Will Be Replaced**. Regenerating removes them from the scheduler grid; the new games go to the parking lot.
- Unticking **Pool games** rebuilds brackets only, leaving a schedule you have worked on alone.
- "These two already play each other in this division" means the matchup already exists.
