---
title: Schedule games on fields (Scheduler and Auto-fill)
category: Setup
order: 50
routes: /tournaments/*/scheduler
keywords: scheduler schedule games place games drag drop grid board timeline teams view auto-fill autofill parking lot unscheduled swap games conflicts back-to-back issues day start day end zoom compact fields
---
The **Scheduler** puts every pool and bracket game on a field, date and time. Games that are not placed yet wait in the **Parking Lot**.

**Where:** **Setup → Scheduler**.

**Views:** use **View:** to switch between **Grid** (fields across, time down), **Board** (the grid with drop hints and an issues panel), **Timeline** (fields down, time across) and **Teams** (one row per team, so rest and conflicts show as a shape). Pick the date tab for the day you are working on.

**To place games by hand:**
1. Use the **Division:**, **Pool:**, **Team:** and **Game Type:** filters to narrow the Parking Lot.
2. Drag a game onto a field and time. Drag a placed game back to the Parking Lot to unschedule it.
3. **Scratch** holds up to 4 games while you rearrange.
4. To swap two placed games, tick **Swap Games**, then click both games.

Changes save as you go.

**To place games automatically:**
1. Click **Auto-fill**.
2. Pick the **Division** (or **All divisions**) and the **Games**: **Pool play**, **Bracket** or **Both**.
3. Under **Games per team, each day**, set how many games each team may play per day (0 skips the day).
4. Pick the **Fields** to use (**All** or **Clear**).
5. Click **Place** (it shows how many games).

Auto-fill saves a checkpoint first, so **Revert** undoes it, and placed games can still be dragged.

**Reading the warnings:** games are flagged **Double-booked**, **Field closed**, **Back-to-back**, **Bracket order** or **Long gap**. The **Issues** panel lists them; **Day health** summarizes the day.

**Handy controls:** set the day's start and end in the clock box at the top. **Zoom**, **Compact** (hides empty time rows) and **Show / Hide Fields** change what you see. Add a field with **+ Add Field**.

**Common problems:**
- **Auto-fill** is greyed out when nothing is in the Parking Lot.
- "No room to place games — add fields/time or clear some slots" means the chosen days, fields and hours are full.
- Moving games does not change the public page until you **Publish**.
