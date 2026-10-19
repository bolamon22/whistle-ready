---
title: Import, build or delete the games
category: Staff
order: 435
routes: /tournaments/*
keywords: build a schedule by hand delete games start over undo import grid field grid times down fields across import games schedule upload spreadsheet excel xlsx csv tourneymachine tourney machine schedule export game list add game head assigner replace games re-import update schedule map columns
---
Bring an event's games onto the **Assigner** board from a file, for example a schedule exported from TourneyMachine, then put refs and scorekeepers on them. The director (the **Head Assigner** on the Assigner plan) imports; assigners can't.

**Where:** **Setup → Assigner**, then the **⋯** button at the top right, then **Import schedule**.

**To import:**
1. Export the schedule as Excel (.xlsx or .xls) or .csv, one game per row.
2. Click **⋯**, then **Import schedule**, and pick the file.
3. In **Map Your Columns**, match **Game Number**, **Game Date**, **Start Time**, **Division**, **Location / Field**, **Team 1** and **Team 2**, and **Pool** if you have one. Columns whose names match are picked for you.
4. Click **Import Games →**. Each game gets the event's officials per game (see "Set staff pay rates and officials per game").

**A schedule laid out as a grid** (times down the left, field numbers across the top, each box the division or the matchup) imports too:
1. Click **⋯**, then **Import schedule**, and pick the file. **Field grid found** opens instead of the column list.
2. Check the count of games and fields, and pick the **Day** for each grid. A file with one grid per sheet, or one per day on the same sheet, shows each one.
3. Click **Import Games →**. Every filled box becomes a game on that field at that time. The teams are TBD unless the box names them ("Team A vs Team B"), and games are numbered 1, 2, 3 by time and field.
Times without AM or PM that come after noon, like 1:30 after 12:45, are read as afternoon.

**To lay the schedule out by hand** (for a schedule you were given on paper, in a picture, or in a file that didn't import well):
1. Click **⋯**, then **Build a schedule**.
2. Pick the **Day**, the number of **Fields**, the **First game** time, the **Minutes apart** and the number of **Time slots**. Rename a field (like **Field 2A**) or change one time (a slot that runs short) right in the grid.
3. Add your divisions in **Add a division** (several at once with commas, like K-2, JV, VAR).
4. Pick a division, then click or drag across the boxes. The arrow beside a time fills that row, and the arrow under a field fills that field. **Erase** clears boxes.
5. Click **Make games**. If the day already has games, choose **Replace them** or **Add to them** first. Teams are TBD and the games are numbered after the ones already there.

**To delete games and start over:** click **⋯**, then **Delete games**. Pick just the day you're on or the whole event. Their ref and scorekeeper assignments come off too, and officials aren't sent change alerts for it.

**To add one game:** click **⋯**, then **Add a game**.

**Common problems:**
- Importing again replaces every game on the board, and their assignments come off. The box says how many before you click **Replace games →**, so import the final schedule before you assign.
- Rows with no game number are skipped.
