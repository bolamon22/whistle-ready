---
title: Schedule games on fields (Scheduler and Auto-fill)
category: Setup
order: 50
routes: /tournaments/*/scheduler
keywords: filter day buttons uneven pool day hours, undo ctrl z put back move game reschedule change time change field scheduler schedule games place games drag drop grid board timeline teams view auto-fill autofill parking lot unscheduled swap games conflicts back-to-back issues day start day end zoom compact fields
---
The **Scheduler** puts every pool and bracket game on a field, date and time. Games that are not placed yet wait in the **Parking Lot**.

**Where:** **Setup → Scheduler**.

**Days and views:** the big day buttons under the top bar pick the day you're working on (the one you're on is solid teal, with its game count and open slots; **+** adds a day). Next to them, switch between **Grid** (fields across, time down), **Board** (the grid with drop hints and an issues panel), **Timeline** (fields down, time across) and **Teams** (one row per team, so rest and conflicts show as a shape). A **1 uneven pool** tag at the top means some teams have fewer games than the rest of their pool; click it for which pools and **Fix in Divisions**.

**To place games by hand:**
1. Click **Filter** and pick a **Division**, **Pool**, **Team** or **Game type** to narrow the Parking Lot. The number on **Filter** is how many are on; the dark tag next to it clears the division.
2. Drag a game onto a field and time. Drag a placed game back to the Parking Lot to unschedule it.
3. **Scratch** holds up to 4 games while you rearrange.
4. To swap two placed games, tick **Swap Games**, then click both games.

**To move a game to another time or field:** drag it from where it sits to the new field and time slot. To take it off the schedule, drag it back to the **Parking Lot**.

On the **Board** or **Timeline** you can also click a game to pick it up. A green bar shows its division, game number, teams and pool, and how many games each team has. Click a green **Place here** slot to put it there, or use **Swap** or **Unschedule**. **Done** puts the game down without moving it; it doesn't cancel the game.

Changes save as you go.

**To undo a move:** click **Undo** next to **Tools**, or press Ctrl+Z (Cmd+Z on a Mac). The last game you moved goes back where it was, and a swap comes back as one step. Keep going to step further back, up to 30 moves; the button shows how many are left. A game someone else has moved since, or whose old slot is now taken, stays where it is. Undo remembers your moves until you leave or reload the page, and covers moves made by hand: for **Auto-fill** and the bulk tools, use **Revert**.

**To place games automatically:**
1. Click **Auto-fill**.
2. Pick the **Division** (or **All divisions**) and the **Games**: **Pool play**, **Bracket** or **Both**.
3. Under **Games per team, each day**, set how many games each team may play per day (0 skips the day).
4. Pick the **Fields** to use (**All** or **Clear**).
5. Click **Place** (it shows how many games).

Auto-fill saves a checkpoint first, so **Revert** undoes it, and placed games can still be dragged.

**Reading the warnings:** games are flagged **Double-booked**, **Field closed**, **Back-to-back**, **Bracket order** or **Long gap**. The **Issues** panel lists them; **Day health** summarizes the day.

**Handy controls:** set the day's start and end under **Tools** → **Day hours**. **Zoom**, **Compact** (hides empty time rows) and **Show / Hide Fields** change what you see. Add a field with **+ Add Field**.

**Common problems:**
- **Auto-fill** is greyed out when nothing is in the Parking Lot.
- "No room to place games — add fields/time or clear some slots" means the chosen days, fields and hours are full.
- Moving games does not change the public page until you **Publish**.
