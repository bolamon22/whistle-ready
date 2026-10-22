// Narration scripts for every training and how-to video, generated from the
// video-making scripts (tools/videos). Read-only here: the Video library shows them,
// and a change means re-recording the video (see tools/videos/README.md).
// Do not edit by hand -- run tools/videos/genscripts.js.
export type VideoScript = { title: string; intro: string; lines: string[]; outro: string }
export const VIDEO_SCRIPTS: Record<string, VideoScript> = {
  "ref-games": {
    "title": "Your games as a ref",
    "intro": "Your games as a ref, in Whistle Ready.",
    "lines": [
      "When you sign in, your home page has everything for your games. My events shows the events you are working.",
      "Up next is your next game: the teams, the time, the field, and your spot on the crew. On game day, it counts down to the start.",
      "When you get to your field, tap Check in.",
      "These totals show how many games you have, and what they pay.",
      "Below that, My games lists every game you are on, day by day.",
      "When a team's coach is on file, you'll see the coach's name under the teams. Not every team has one listed, so it won't always be there.",
      "Each game also shows who you're working with: the other official, and the scorekeeper.",
      "Tap the phone to call them, or the message button to send a text. It makes finding your partner easy.",
      "Games that are already over move to Show past games, at the bottom."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "ref-find": {
    "title": "Find your name\non the schedule",
    "intro": "Find your name on the schedule, in Whistle Ready.",
    "lines": [
      "Want to see the whole schedule? On your home page, tap All games.",
      "Every game for the event is listed by day, with the officials and the scorekeeper on each one.",
      "Tap Find my name. Every game you are on turns green, and your name is highlighted.",
      "The search box works for any name, team, coach, or field. Here is everything on Field 3.",
      "Or type a team, to see who is reffing their games.",
      "Working more than one event? Pick the event from the list.",
      "Tap My games to go back to just your games."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "ref-gameday": {
    "title": "Game day as a ref",
    "intro": "Game day as a ref, in Whistle Ready.",
    "lines": [
      "Your game day tools are on your home page.",
      "Need water, balls, or a trainer at your field? Open Field Request.",
      "Type your field number, then tap what you need. It goes to the right staff, and buzzes their phones.",
      "Staff contacts lists everyone working the event, with buttons to call or text.",
      "If a scorekeeper is missing, you can run the game clock and score with Live scoring, then post the final with Post scores.",
      "Rules has the tournament rules. Incidents is where you log an injury or a problem, so the tournament director can follow up.",
      "For any emergency, call 9 1 1 first. Then let the tournament director know."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sign-up": {
    "title": "Sign up and get\nthe app on your phone",
    "intro": "How to sign up for Whistle Ready, and get it on your phone.",
    "lines": [
      "Open the signup link we texted or emailed you. It's the same link for every new staff member.",
      "Type your name, your cell phone, and your email.",
      "Pick your role. If someone told you about us, put their name in, so we can pair you with people you like working with.",
      "Tick the events you can work. You can add more later from your staff home page.",
      "Choose how you'd like to be paid. Fill in every way you have, and we'll use the next one if the first doesn't work.",
      "Add a photo of your face for your staff ID, then make a password.",
      "Tap Join the Staff. You're in, and you'll get a welcome email with your sign-in link.",
      "Last step: put Whistle Ready on your home screen. On an iPhone, open it in Safari, tap Share, then Add to Home Screen. On Android, tap the menu, then Install app."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "home": {
    "title": "Your staff home page",
    "intro": "Your staff home page in Whistle Ready.",
    "lines": [
      "When you sign in, you land on your staff home page. My events shows every event this season.",
      "Want to work an event? Tap Sign up to work. Its days open right away, so you can tell the assigner which days you can work.",
      "Until every day has an answer, a To do card stays at the top of this page. Tap Answer now, then answer each day, or tap I can work both days, all day.",
      "Can't work the event after all? Tap Take me off it, any time before you're put on games.",
      "If you haven't sent your W-9 yet, upload it here. We need it before your first paycheck.",
      "Game day tools are here: field requests, live scoring, staff contacts, incidents, and the emergency plan.",
      "Up next shows your next game: the time, the field, and the teams. Tap Check in when you get to your field.",
      "Scroll down for every game you are on. As a scorekeeper, tap Open scorer to start keeping score.",
      "Tap All games to see the whole schedule for the event."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "staff-id": {
    "title": "Your staff ID",
    "intro": "Your staff ID in Whistle Ready.",
    "lines": [
      "Your staff ID has your photo, your role, and the events you are working. Wear it all day at the fields.",
      "To open it, tap My staff ID on your staff home page.",
      "Tap Add to Apple Wallet to keep it on your iPhone, next to your boarding passes and tickets.",
      "Or tap Print my ID. It prints at real badge size. Cut along the edge and punch the hole for a lanyard.",
      "The codes on the back let the site lead check you in and confirm you are on staff. Keep it with you."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "keep-score": {
    "title": "Keep score live",
    "intro": "Keep score live in Whistle Ready.",
    "lines": [
      "Open your game from your staff home page. The live scorer shows both teams, your field, and the game clock.",
      "When the referee starts play, tap Start. This is the unofficial game time. The refs keep the official time on the field.",
      "When a team scores, tap the blue plus under that team. Every goal goes live to families right away, so enter it as it happens.",
      "Tapped the wrong team? Tap minus to take it back, then add it to the right one.",
      "When the clock stops for a timeout or an injury, tap Pause. Tap Start again when play resumes.",
      "At halftime, tap the plus next to Half to move to the second half, and reset the clock.",
      "Tap Save at the top any time. If your phone dies or you leave the page, the score is safe."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "penalties": {
    "title": "Penalty time",
    "intro": "Keep penalty time in Whistle Ready.",
    "lines": [
      "Penalty time only counts down while the game clock is running, so make sure the clock is started.",
      "When a referee calls a penalty, tap Penalty under the team that got it.",
      "Type the player's number, pick how long the penalty is, and tap Start Penalty.",
      "The penalty counts down under that team, right along with the game clock.",
      "When the game clock stops, penalty time stops with it. Start the clock again and the penalty picks back up.",
      "Off by a few seconds from the referee? Tap minus or plus fifteen seconds to match.",
      "When the time is up, the phone beeps and a red banner shows. Tell the player they can go back on, then tap OK."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "scorer-settings": {
    "title": "Scorer settings",
    "intro": "Set up the scorer in Whistle Ready.",
    "lines": [
      "Tap the gear at the top of the live scorer to open Settings.",
      "If the site lead wants to track who scored, turn on Ask for player number.",
      "Now every goal asks for the scorer's jersey number. It's optional, so skip it if you missed it.",
      "Keep Sound and vibrate turned on, so you never miss the end of a penalty. Tap Test to hear it.",
      "Keep screen on stops your phone from locking while the clock runs. Only turn it off if your battery is low.",
      "The rest, like no ties, the game format, and notes, are set for the whole tournament. Leave those alone unless the site lead asks.",
      "To change the length of a period, tap Set time under the clock, pick the minutes, and tap Set time."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "post-final": {
    "title": "End the game and\npost the final",
    "intro": "End the game and post the final score in Whistle Ready.",
    "lines": [
      "Before you post anything, check the score with the head referee. They have the final say.",
      "If the game is tied and this tournament doesn't allow ties, the button turns yellow. Tell the referee the game goes to overtime.",
      "Keep scoring through overtime. Once a team scores, the button turns green again.",
      "Tap End Game and Post Score, check the teams and the score, and tap OK.",
      "The final posts right away to standings, brackets, and every family following either team.",
      "Posted the wrong score, or it's a forfeit? Don't post a guess. Send a field request or call the site lead, and they'll fix it."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "field-request": {
    "title": "Send and answer a field request",
    "intro": "Send and answer a field request in Whistle Ready.",
    "lines": [
      "Need something at your field? On the live scorer, tap Request.",
      "Your field number is already filled in. Tap what you need. Here, a trainer.",
      "For a trainer, pick how urgent it is, and type what happened.",
      "It's already set to go to Medical. Tap Send request.",
      "The trainer gets a phone alert, and the request shows up on the Field Request board.",
      "They tap Respond, so you know help is coming.",
      "Back on your scorer, you'll see who's on the way. Keep the game going.",
      "No answer in a few minutes? Don't wait. Open Staff contacts, and text or call Field Ops or the trainer straight from your phone."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "incidents": {
    "title": "Log an incident",
    "intro": "Log an incident in Whistle Ready.",
    "lines": [
      "For an emergency, call 911 first. Then log what happened, so the site lead can follow up.",
      "Open Incidents from your staff home page. Pick the type, like medical, safety, or facility, and how serious it is.",
      "Add the field, and say what happened in a sentence or two. Stick to the facts: who, where, and when.",
      "Tap Log incident. It shows under Open for the whole staff until someone handles it.",
      "Complaints from a coach or a parent work the same way. Stay calm, don't argue the call, bring in the site lead, and log it here.",
      "Once it is handled, the site lead taps Resolve, and it moves to the resolved list."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "checklist": {
    "title": "The setup checklist",
    "intro": "Use the setup checklist in Whistle Ready.",
    "lines": [
      "The setup checklist is one shared list for the whole crew. Open it from Setup checklist on your staff home page.",
      "Finished something? Tap it to check it off. Everyone sees who did it, and when.",
      "Something missing from the list? Type it in and tap Add.",
      "Tapped the wrong one? Tap it again to uncheck it.",
      "The bar at the top shows how close setup is. The site lead checks it before the first game."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "directory": {
    "title": "Find and call\nany staff member",
    "intro": "Find and call any staff member in Whistle Ready.",
    "lines": [
      "Need to reach someone on staff? Open Staff contacts from your staff home page.",
      "Everyone working the event is listed by job: field ops, trainers, scorekeepers, assigners, refs, and directors.",
      "Type a name in the search box to find someone fast.",
      "Tap the green phone to call them, or the message button to send a text.",
      "For anything a group needs to see, like a trainer or more balls, send a field request instead. It reaches the right people at once."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "injury-report": {
    "title": "Log an injury",
    "intro": "Log an injury report, in Whistle Ready.",
    "lines": [
      "Care for the player first. For an emergency, call 9 1 1. Then log the injury while it is fresh.",
      "Open Incidents from your home page. Medical, injury, is already picked, so the injury report opens.",
      "Tap who was hurt, then add their name and jersey number.",
      "Start typing the team, and it fills in from the schedule. If the team has two divisions, pick one. Add the game number too.",
      "Pick the injury, and check the time.",
      "Any sign of a concussion? Check Suspected concussion. No return today without written clearance from a doctor.",
      "Add the field, what happened, and the treatment you gave.",
      "Pick the outcome, and whether a parent was told. If yes, add their name and phone.",
      "Tap Save injury report. Only trainers, directors, and the person who logged it can see the details.",
      "Later, tap Follow-up to add what happened next, like a doctor visit, and update the outcome.",
      "At the end of the day, tap Injury log to download every injury for the event."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "trainer-call": {
    "title": "Answer a trainer call",
    "intro": "Answer a trainer call, in Whistle Ready.",
    "lines": [
      "First, turn on game-day alerts, so a call for a trainer buzzes your phone. They are on the Field Request board.",
      "Medical is already on for trainers. Tap Turn on alerts. On an iPhone, the app first shows you how to add it to your Home Screen.",
      "Tap Send a test, and make sure it pops up on your phone.",
      "When a field needs you, your phone buzzes with the field, how urgent it is, and what happened.",
      "Tap the alert to open the Field Request board.",
      "Tap Respond. Whoever asked gets a buzz that you are on the way.",
      "Everyone on staff can see who is responding. Tapped it by mistake? Tap it again to undo.",
      "If your alerts are off, the request comes by email instead, but alerts are much faster.",
      "Once the player is cared for, open Incidents and log the injury. There is a video for that too."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "game-day-prep": {
    "title": "Game day prep\nfor scorekeepers",
    "intro": "Game day prep for scorekeepers, in Whistle Ready.",
    "lines": [
      "Start with your first game. It is at the top of your home page, under Up next.",
      "Plan to be at the park at least 30 minutes before that first game.",
      "Be at your scorer table, set up and ready, at least 10 minutes before the game starts.",
      "Then check your field has game balls, a flip score chart, and everything else your field needs to get it going.",
      "Flip score chart or anything else missing? Open your scorer, tap Field request, tap Flip score chart, and send it. Field Ops will bring one.",
      "You are at your field for long stretches. Need a bathroom break? Ask someone nearby to cover, or send a field request for a sub.",
      "Never leave your field uncovered. Wait until someone is there before you step away.",
      "And if the app ever gives you trouble, keep the score in your phone notes, and let the site lead know.",
      "You are outside all day, so pack for it. Lunch is provided, but bring snacks, and a water bottle or a small cooler.",
      "Bring a portable phone charger if you have one. Scoring live all day uses a lot of battery.",
      "Pack rain gear, sunscreen, a hat, and sunglasses.",
      "And keep an eye on the weather leading up to the event, so you show up with the right gear. Thanks for helping run a great event."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "availability": {
    "title": "Set your availability",
    "intro": "Set your availability, in Whistle Ready.",
    "lines": [
      "Working an event? Until every day has an answer, a To do card sits at the top of your home page. Tap Answer now.",
      "Under the event, tap one answer for each day. It saves right away, and the assigner sees it. Each day locks 48 hours before it starts, so answer early.",
      "Working the whole event? I can work both days, all day answers every day at once.",
      "Or answer each day: All day, Morning, or Afternoon. Morning means games that start before noon.",
      "Can't work a day? Tap Can't work. You won't be put on any games that day.",
      "Only free part of a day? Once the schedule is posted, tap Pick your times, tick the times you're free, then Save. The assigner still decides which games you work.",
      "When every day has an answer, the card says You're all set. You can change a day until 48 hours before it starts. After that, call or text the assigner."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-home": {
    "title": "Your assigner home",
    "intro": "Whistle Ready assigner training. Your assigner home.",
    "lines": [
      "Sign in to Whistle Ready on your computer, and you land on your assigner home. You assign officials for Sunshine Events Group tournaments from here.",
      "Up next is your next tournament: the dates, the venue, and how many games already have a full referee crew.",
      "Six buttons take you everywhere you need. Assign opens the Assigner board, where you put officials on games.",
      "By official shows every game, or every person, with their pay. Staff roster is who is working this event. Availability shows who can work each day, and who hasn’t answered.",
      "And Staff pay totals what each official earned, so you can mark them paid.",
      "Your other events are listed below, with the same buttons. Use Find a tournament to search, or switch to past events."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-crew": {
    "title": "Build your crew",
    "intro": "Whistle Ready assigner training. Build your crew in the Staff Pool.",
    "lines": [
      "The Staff Pool is every official and scorekeeper Sunshine Events Group works with. Open it from Staff at the top of the page.",
      "Search by name, or filter by role, by boys or girls, and by whether they have set up the app.",
      "The App column shows who is registered. Invited means they have a link but have not signed up yet. Resend nudges them again.",
      "To add someone, click Add Staff and fill in their name, email, phone, roles, and whether they referee boys, girls, or both.",
      "Have a list already? Bulk Import takes a spreadsheet of referees or other staff.",
      "Recruiting link copies a sign-up link you can post or text. New officials fill it out and land right in your pool.",
      "Invite letter has a ready-made letter for assigners to forward to their officials. Edit it if you like, then copy it or send it."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-roster": {
    "title": "Your tournament roster",
    "intro": "Whistle Ready assigner training. Your tournament roster.",
    "lines": [
      "The roster is who is working this tournament. Only people on the roster show up on the Assigner board.",
      "Confirmed is your crew for this event. Available to add lists people from your pool who are not on it yet. Click Add to bring them in.",
      "Each row shows their role, certification, games assigned, training videos watched, how they get paid, and how to reach them.",
      "Click Edit to change someone. Set whether they referee boys, girls, or both, their certification, a pay rate override, and Also serves as assigner.",
      "Filters help you find gaps: people with no games yet, or missing a phone, email, or pay details.",
      "Invite Staff emails someone a link to join. Copy signup link gives you a link to share yourself.",
      "Exhibit A lists every official’s background check date for the county, and flags any older than twelve months."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-out": {
    "title": "Who can work, and\nwho hasn’t answered",
    "intro": "Whistle Ready assigner training. Who can work, and who hasn’t answered.",
    "lines": [
      "Availability shows who can work each day of the event, and who hasn’t answered yet. It’s a tab on the staff roster.",
      "The tiles count who answered every day, and who hasn’t. Ref coverage compares the refs who can work against the ref spots at the busiest game time.",
      "Filter to the people with no answer yet, or to anyone who can’t work a day, or only part of one. You can pick a job, or find a person.",
      "Someone texted you instead? Click their answer for that day and set it. They’ll see it on their staff home.",
      "To chase the rest, click Remind on a row, or email everyone who hasn’t answered. Untick anyone to skip, check the preview, and send.",
      "Their email has a button that opens their days. Auto-assign only puts people on games they said they can work, and anyone who hasn’t answered is still treated as available."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-board": {
    "title": "Tour the Assigner board",
    "intro": "Whistle Ready assigner training. A tour of the Assigner board.",
    "lines": [
      "The Assigner board is where you staff every game. Each column is a field, and each row is a start time.",
      "Pick a day with the day buttons. Each one shows how many games it has.",
      "Narrow the board by division, or to just the boys or girls games.",
      "Needs crew shows only the games still missing someone. Conflicts shows anyone booked on two games at once.",
      "The counter shows how many slots are filled, and the red tag flags anyone double-booked.",
      "Card size makes the cards bigger or smaller. Compact fits a whole day on one screen.",
      "Refs, or Scorekeepers, shows just those slots, so each assigner sees their own crew, and what is still missing.",
      "Layout folds the time rows that are already staffed, and sets how many refs every game needs that day.",
      "Staffing opens your people. Its Needs tab shows how many boys refs, girls refs, and scorekeepers your busiest day takes.",
      "Other views: List shows one game per row. Division groups games by division. And Staff shows one person’s whole day.",
      "Games are the scheduler’s job, so the board doesn’t let you move or edit them. If a game needs to change, ask the scheduler."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-manual": {
    "title": "Assign officials manually",
    "intro": "Whistle Ready assigner training. Assign officials manually.",
    "lines": [
      "Every game card has a slot for each referee, plus one for the scorekeeper. Dashed slots are still open.",
      "Click Staffing to open your people. The number after a name is how many games they have that day, so you can spread games evenly.",
      "Drag a name onto an open slot to assign them.",
      "Or click an open slot, type a name, and pick it.",
      "Referee slots only list referees who work that kind of game: boys referees on boys games, girls referees on girls games.",
      "Anyone already on a game at that time shows as busy, so you can’t put one person on two fields at once.",
      "Scorekeeper slots work the same way, and list your scorekeepers first.",
      "Need three referees on a game, or just one? Hover the game and use the plus and minus.",
      "Colors show each game at a glance. Green is a full crew, amber has an open slot, and red means nobody is on it, or someone is double-booked."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-auto": {
    "title": "Auto-assign and Clear",
    "intro": "Whistle Ready assigner training. Auto-assign, and clearing a day.",
    "lines": [
      "Auto-assign fills every open slot for the day you are on in seconds. It never touches assignments you already made.",
      "Tick what to fill. Nothing is ticked at first, so you only fill your own crew: scorekeepers, boys refs, or girls refs. The open count is under each.",
      "Keep scorekeepers on one field all day is on by default, so each scorekeeper stays put.",
      "Click Preview to see every pick before anything is saved. It gives each game to whoever has the fewest so far, and skips anyone who is out.",
      "Untick any pick you don’t want, then click Save.",
      "If games are still short, it tells you which ones, and how many more officials you need. Then close it and check the board.",
      "To start a day over, open the more menu, and click Clear assignments. Pick boys referees, girls referees, or scorekeepers, and optionally which fields.",
      "Type your name for the record, and confirm. Clearing can’t be undone, so use it carefully."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-notify": {
    "title": "Notify your officials",
    "intro": "Whistle Ready assigner training. Notify your officials.",
    "lines": [
      "Assigning a game doesn’t tell anyone by itself. When your schedule is ready, click Notify officials.",
      "Send every day of the event, or just the day you are on.",
      "Add a note if you like, such as where to check in.",
      "Ask them to confirm their games is on, with a date to confirm by. Officials tap Confirm in the email, and a check shows next to their name on the board.",
      "The box shows how many officials will get it, and anyone missing an email, so you can fix their roster entry first.",
      "Click Send. Each official gets an email with only their games: the day, time, field, teams, and whether they referee or keep score. Anyone with Whistle Ready alerts on gets a phone alert too.",
      "Made changes since? Open it again. Only officials whose games changed is ticked for you, so everyone else isn’t emailed twice.",
      "Officials always see their latest games under My games in Whistle Ready."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-check": {
    "title": "Check your work",
    "intro": "Whistle Ready assigner training. Check your work.",
    "lines": [
      "By official lists every game with its crew, and shows how many slots are filled overall.",
      "Each game shows its count in color: green is full, amber is partly filled, and red has nobody.",
      "Pick a day, or a division, to narrow the list.",
      "Switch to By staff to see each person’s games and what they will earn. It is a quick way to spot anyone with too many games.",
      "The x on a name removes them from that game right away. To put someone else on, go back to the Assigner board."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-swaps": {
    "title": "Game-day swaps",
    "intro": "Whistle Ready assigner training. Game-day swaps.",
    "lines": [
      "Someone can’t make it? Click their slot and pick the replacement. The new person shows right away.",
      "To empty a slot, click it and choose unassigned.",
      "A red warning means someone is on two games at the same time. Click Conflicts to see just those games.",
      "Fix it by giving one of those games to someone else.",
      "When the board is the way you want it, open the more menu, and click Lock editing. That stops accidental drags until you unlock it.",
      "Then use Notify officials, with only changed officials ticked, so just the people you moved hear about it."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-refneeded": {
    "title": "Ref needed alerts",
    "intro": "Whistle Ready assigner training. Ref needed alerts on game day.",
    "lines": [
      "On game day, field staff send a Ref needed request from their phones when a game is short an official.",
      "Assigners get it as a phone alert, with an email as a backup. It opens the Field Request board.",
      "Send someone, then tap Respond, so the person who asked knows help is on the way.",
      "Turn on phone alerts in Whistle Ready, and choose the Assigners and Refs groups, so you hear about these right away."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-pay": {
    "title": "Paying your officials",
    "intro": "Whistle Ready assigner training. Paying your officials.",
    "lines": [
      "Staff pay totals what everyone earned at this event, what has been paid, and what is still outstanding.",
      "Each official shows their total and how they want to be paid, like Zelle, Venmo, or check. Click a row to see each game and its pay.",
      "Pay rates come from the event’s setup. A rate override on someone’s roster entry changes their pay for new games.",
      "Once you pay someone, click Mark Paid, check the amount and method, and confirm.",
      "Made a mistake? Unpay reverses it.",
      "CSV downloads the whole list for your records."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-send": {
    "title": "Send training videos to your refs",
    "intro": "Whistle Ready assigner training. Send training videos to your refs.",
    "lines": [
      "On your assigner home, click Training.",
      "These are the training videos for your officials. Click Ref training to see the ref videos.",
      "Click Send all to send the whole set at once. You can also tick just the videos you want.",
      "Pick the event. Only people working it are included.",
      "Then pick your group: Boys refs, or Girls refs. Refs who do both are in both groups.",
      "The message is written for you, with the event and the dates. Change anything you like. First name fills in for each ref.",
      "On the right is the exact email they will get.",
      "Check who it is going to, then click Send. You will see every name once more before it goes.",
      "Afterward, open Who’s watched. You can see who finished, who is in progress, and remind anyone who has not started."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-print": {
    "title": "Print the schedule",
    "intro": "Whistle Ready assigner training. Print the schedule.",
    "lines": [
      "To print the schedule, or save it as a PDF, click the printer at the top of the Assigner board.",
      "A day as a grid looks like the board: times down, fields across, and every game with its officials.",
      "Every day puts each day on its own page. You can also print a day as a list, sorted by time, or grouped by field.",
      "It prints what the board is showing. Pick Girls, or Refs, first, and only those print.",
      "Click the day. Your browser’s Print opens. Choose Save as PDF, and click Save.",
      "Each game shows its number, division, teams, and officials. Short field names and division codes keep it easy to read.",
      "For more choices, open More print choices. Pick the day, the games, refs or scorekeepers, and the layout. Then click Print.",
      "Bring the printout to the fields, so everyone knows who is working each game."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "asg-checkpoints": {
    "title": "Checkpoints: who had each game",
    "intro": "Whistle Ready assigner training. Checkpoints: who had each game.",
    "lines": [
      "If the schedule changes after your officials are on games, Whistle Ready saves a checkpoint first, with who had each game.",
      "The note on the board tells you how many games moved. Click See who had them.",
      "Each changed game shows where it was then, and where it is now, with its officials. So you know who to move, and who to tell.",
      "Pick an older checkpoint from the list. Or click Save a checkpoint now, before you make big changes yourself.",
      "Print it opens the schedule exactly as it was, with the officials it had. Click Print to save it as a PDF.",
      "You can also open Checkpoints any time from the more menu on the Assigner board."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-create": {
    "title": "Create a tournament",
    "intro": "Whistle Ready tournament director training. Create a tournament.",
    "lines": [
      "Your Tournaments page lists every event, upcoming and past. To start a new one, click New Tournament.",
      "Give it a name, and pick the start and end dates.",
      "Add the park, and how many fields you have. Whistle Ready sets up Field 1 through 8, so your schedule grid is ready.",
      "Set the daily start and end times, and the schedule increment, which is how long each game slot is.",
      "Teams register and pay right in Whistle Ready. Enter your base team fee. Discounts and other pricing can be added later.",
      "Upload your tournament logo, or pick one from your library.",
      "Open Divisions, and check the ones you are offering. You can add your own, too.",
      "Click Create Tournament. Your new event shows up in the list, with buttons for its schedule, staff, registrations, and the builder.",
      "Running an event again next year? Click Copy on last year's tournament, and give it a new name and dates.",
      "The copy brings its fields, divisions, pay rates, staff roster, and registration settings. The schedule and registrations start fresh."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-setup": {
    "title": "Tournament setup:\nthe basics",
    "intro": "Whistle Ready tournament director training. Tournament setup, the basics.",
    "lines": [
      "Each tournament has one setup page. Open Setup, then Tournament setup.",
      "The sections are grouped: the basics, money, how games are played, and the public page. A check mark means that section is done.",
      "General info has the name, sport, location, dates, and the tournament logo.",
      "Divisions shows how many teams have registered in each one.",
      "Getting full? Mark a division Almost full, or Full. It is a badge on your public page. It never stops a club from registering.",
      "Below that, check the divisions you are running, add your own, and drag them into the order teams will see.",
      "Venues and fields. Set the hours you can play each day. One field only open part of the day? Use its Availability button.",
      "The park address shows on your public page with a map. Using more than one park? Add another venue.",
      "Game Timing and Format sets the schedule increment, game length, and break. The period format and halftime show on the scorekeeper app.",
      "Click Next to move through the sections, and Save Changes when you are done."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-money": {
    "title": "Tournament setup:\nfees, pay and standings",
    "intro": "Whistle Ready tournament director training. Tournament setup, fees, pay, and standings.",
    "lines": [
      "In Tournament setup, open Team fees. This is the price clubs see on your registration form.",
      "Set the per-team rate by how many teams a club brings. Here, a club with three or more teams pays less for each one.",
      "Need a different price for some divisions, like the youngest ages? Add a division rate for divisions with that name in them.",
      "You can also offer an early-bird discount until a date.",
      "Under that is the confirmation letter clubs get after they register. Leave it blank to use your standard letter, or write your own and preview it.",
      "Registration types turns on team registration, individual player registration, or both.",
      "Staff pay rates sets what you pay each role, per game or per hour. It feeds Staff pay, for you and your assigners.",
      "Officials per game sets how many refs each game needs, with exceptions for divisions that use more or fewer.",
      "Standings tiebreakers decides how tied teams are ranked, and how teams advance to the bracket.",
      "Click Save Changes when you are done."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-divisions": {
    "title": "Divisions, pools\nand brackets",
    "intro": "Whistle Ready tournament director training. Divisions, pools, and brackets.",
    "lines": [
      "Setup, then Divisions and teams, lists every division with its teams and pools. Click one to open it.",
      "Teams and Pools shows every registered team, its club, and whether the club has paid.",
      "Add your pools. Type a name, and press Enter.",
      "Click Assign Pools, then Auto-assign teams to spread them evenly. Drag a team to move it to another pool.",
      "On the Games tab, set the games per team, and click Generate games. They wait in the Scheduler, ready to place on fields and times.",
      "On the Bracket tab, pick the format and how many teams advance. The summary shows how many games each team is guaranteed. Then click Generate Bracket.",
      "Running a lot of divisions? Bulk Generate builds the pools, games, and brackets for all of them at once, from your Smart defaults.",
      "When the pools are final, turn on Teams and pools to show them on your public page. The schedule gets published from the Scheduler."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-schedule": {
    "title": "Build and publish\nthe schedule",
    "intro": "Whistle Ready tournament director training. Build and publish the schedule.",
    "lines": [
      "The Scheduler puts every game on a field and a time. Use the Board view. Games that still need a spot wait on the left, in the Unscheduled list.",
      "Click a game, and every open slot lights up. Click one to place it. You can also drag a game straight onto the board.",
      "The next game is picked up for you. Amber means a team would play back to back. Striped means a team is already busy.",
      "To place a lot of games at once, click Auto-fill.",
      "Pick the division and the type of games, how many games each team plays each day, and which fields to use.",
      "Click Place games. Anything that doesn’t fit stays in the Unscheduled list. It saves a checkpoint first, so Revert undoes the whole fill.",
      "The Issues panel flags problems as you go. Day health shows how full each time slot is, and how many back-to-backs you have.",
      "To check each team’s day for a long wait, switch to Teams, then back to the Board.",
      "Rain delay? Under Tools, Weather pushes the rest of the day back, or tightens the time slots. To close a field, hover its name and click the closed sign. Close it for the whole day or part of it.",
      "The schedule stays a draft until you click Publish. That puts it on your public page, and can alert the phones of parents who follow those teams.",
      "Change something later? Publish again. Only the teams whose games moved get an alert."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "dir-registrations": {
    "title": "Team registrations\nand payments",
    "intro": "Whistle Ready tournament director training. Team registrations and payments.",
    "lines": [
      "People, then Team registrations, lists every club that registered, its teams, and what it owes.",
      "The totals up top show clubs, teams, what you have invoiced, what you have received, and the balance still out.",
      "Each club shows its contact, whether they have a login, and Invoiced, Paid, and Balance.",
      "Filter by payment status to see who still owes, or search a club, team, or coach.",
      "Paid by check? Click Payment. The balance fills in. Pick the method, add the check number, and click Record Payment.",
      "Club still owes? Pay link copies a secure link you can send them to pay the balance by card.",
      "Email clubs sends a letter to every club, or just the ones you pick, like a payment reminder. Send yourself a test first, or schedule it for later.",
      "Add entry adds a club by hand, Import teams brings them in from a spreadsheet, and Public form opens the page clubs register on."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sch-home": {
    "title": "Your scheduler home",
    "intro": "Whistle Ready scheduler training. Your scheduler home.",
    "lines": [
      "Your home page lists each tournament. Schedule opens its games, Divisions its pools and brackets, Manage its dashboard, and Setup its basics.",
      "Setup holds what every schedule is built from: divisions, venues and fields, game timing, and standings tiebreakers. Fees and staff pay stay with the director.",
      "The Setup menu at the top gets you around. Divisions and teams holds the pools and brackets. The Scheduler puts games on fields and times.",
      "Under Live, Post scores enters results. Scores drive the standings, and the standings set the bracket seeds.",
      "The next videos take each part in turn: tiebreakers, pools and brackets, building the schedule, and game-day changes."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sch-timing": {
    "title": "Game timing and\ntiebreakers",
    "intro": "Whistle Ready scheduler training. Game timing and tiebreakers.",
    "lines": [
      "Game Timing and Format sets the rhythm of the day. The schedule increment is the time from one start to the next. Fifty minutes fits a 40-minute game and a 10-minute turnover.",
      "The period format and halftime length show on the scorekeeper’s app.",
      "Standings tiebreakers decide who ranks higher when teams finish level. They set the seeds too.",
      "First, choose how teams advance. By division ranks every team in the division together. By pool seeds the pool winners first, then the runners-up.",
      "Then set the order. Record gives three points for a win and one for a tie. Head to head, goal difference and goals scored break the ties that are left.",
      "Divisions get their own list, used to rank teams across pools. Save as default carries your order into every new tournament. Then click Save Changes."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sch-brackets": {
    "title": "Brackets and seeding",
    "intro": "Whistle Ready scheduler training. Brackets and seeding.",
    "lines": [
      "Each division builds its bracket on its own Bracket tab. Open the division, then click Bracket.",
      "Pick the format: single elimination, double elimination, or both-ways consolation. Then set how many teams advance, and any extra consolation games.",
      "For a division with only two pool games, the 2-game guarantee gives every first-round loser a second game, and adds If needed games for you.",
      "Click Generate Bracket. Its games join the Unscheduled list in the Scheduler, waiting for a spot after pool play.",
      "The seed order follows your standings tiebreakers. Once every pool game has a score, click Seed from standings to fill every seed, or type a team into any seed yourself. Then click Save Seeds.",
      "Preview shows the bracket with the seeds in place. Click a team to change it, or the pencil to change a matchup.",
      "A big division? Split into flights makes two brackets, each with its own champion. Set the cutoff, pick each flight’s format, and click Split.",
      "Switch between the flights at the top. When pool play ends on game day, come back, click Seed from standings again, and save. The public bracket updates."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sch-fixes": {
    "title": "Bracket games\nand fixes",
    "intro": "Whistle Ready scheduler training. Bracket games and fixes.",
    "lines": [
      "Bracket games wait in the Unscheduled list after pool play. Pick the day, choose the division under Filter, then switch the list to Bracket.",
      "Click a seeded game. Seeding time marks the slots before pool play ends, plus one slot to set the seeds.",
      "Click the first green slot after that to place it. The next game is picked up for you.",
      "A game fed by another has to wait for that game to end. Before B1 ends marks the slots that are too early.",
      "To move a placed game, drag it to an open slot. Drop it on another game, and the two trade places.",
      "For an exact time, click the game, then Time. Type the day, the start time, and the field.",
      "Drag a game back to the Unscheduled list to take it off the board. Undo reverses your last change."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "sch-weather": {
    "title": "Weather delays and\nfield closures",
    "intro": "Whistle Ready scheduler training. Weather delays and field closures.",
    "lines": [
      "Lightning or a storm on game day? Open the Scheduler on that day, click Tools, then Weather delay or shorten.",
      "Delay pushes back every game from the time you pick. Choose how long, and when the delay starts. Games with a score, and canceled games, stay put.",
      "Shorten keeps the end of the day, and tightens the rest into shorter time slots instead.",
      "Click Apply delay. Every game from 12:10 on moves at once. It saves a checkpoint first, so if it was a mistake, Revert puts the day back.",
      "Lost a field to standing water? Hover its name, and click the closed sign. Close it for the whole day, or from a time on.",
      "Nothing new can go in a closed window. Games already there show in Issues, so you can move them to an open slot.",
      "Then click Publish. It lists every game that moved, and only the teams whose games changed get an alert."
    ],
    "outro": "Get Whistle Ready! Game day, run from the palm of your hand."
  },
  "waiver": {
    "title": "Your player's waiver\nand parent account",
    "intro": "Sunshine Events Group. Completing your player's waiver, and setting up your parent account.",
    "lines": [
      "Every player is required to have a signed waiver before they can play at Sunshine Events Group tournaments. Open the waiver link from your club, or from the event page.",
      "Add a photo or action shot if you like. It goes on your player's card, which builds itself as you type.",
      "Type the player's name, email, USA Lacrosse number, and birthday.",
      "Pick the gender and grade, then your club and team.",
      "Add the jersey number and position if you know them.",
      "Then the parent's name, email, and cell phone, and your home town.",
      "Add an emergency contact. If your family is staying at a hotel, tell us which one.",
      "Read the waiver, check the box, and type your full name to sign. Then tap Submit registration.",
      "You're done. You'll get a confirmation email, and your club director sees the signed waiver right away.",
      "Next, create a password to save your info. Your parent account is set up for you.",
      "Now you can add a brother or sister, or sign up for another event, in just a few clicks."
    ],
    "outro": "Sunshine Events Group. There from registration to the final whistle, so you can focus on the game."
  },
  "club-portal": {
    "title": "Your club director's portal",
    "intro": "Sunshine Events Group. Here's your club director's portal.",
    "lines": [
      "Your club portal shows everything for your teams at Sunshine Events tournaments. Open it from the link in your confirmation email.",
      "What's left before game day is your checklist: confirm your teams, pay your balance, and get every player and coach waiver in.",
      "Tap Pay to pay your balance online. A bank transfer has no fee, and you can download your invoice any time.",
      "Your teams, divisions, and coaches are listed here. Request team changes or additions right from here, and they go straight to the tournament office.",
      "Copy the waiver form link and send it to your families. Each team shows how many waivers are in.",
      "Open Player waivers to see every player who has signed, team by team.",
      "Coach waivers shows which coaches are done, and who still needs to sign.",
      "When the schedule is posted, your games and pools show up here too. Check back the week of the event.",
      "Track your tournament history, and register for future events with just a few clicks."
    ],
    "outro": "Sunshine Events Group. From registration to the final whistle, so you can focus on the game."
  },
  "coach-waiver": {
    "title": "Coach waiver\nand credential",
    "intro": "Sunshine Events Group. Signing your coach waiver, and getting your credential.",
    "lines": [
      "Every coach, assistant coach, and team manager on the sideline signs this once per event. Open the coach waiver link from your club, or from the event page.",
      "Your credential builds itself as you fill in the form. It stays gray until the waiver is signed.",
      "Add your name, email, and mobile phone.",
      "Tick every team you will coach this weekend. You get one credential that covers all of them.",
      "Your club fills in for you. Pick your role, and add an emergency contact.",
      "Answer the hotel question. A photo and your certifications are optional.",
      "Read the three agreements, and check each one.",
      "Type your full name to sign. It has to match the name at the top. Your credential goes live.",
      "Tap Submit and get my credential. We email you a link to your credential, and a link to create a coach login.",
      "Open your credential from the email. Save it to your phone, add it to Apple Wallet, or print it.",
      "You do not need to bring it. Your signed waiver is what gets you on the sideline. Coaching another team later? Tap Add another team."
    ],
    "outro": "Sunshine Events Group. There from registration to the final whistle, so you can focus on the game."
  },
  "parent-dashboard": {
    "title": "Your parent dashboard\nand team alerts",
    "intro": "Sunshine Events Group. Your parent dashboard, and alerts for your teams.",
    "lines": [
      "Once you sign the waiver, you have a parent dashboard. Your next game is right at the top, with directions to the field.",
      "Games being played right now show the live score.",
      "Before game day, check that each player has a waiver on file.",
      "Tap Schedule to see your teams' games for each day.",
      "Tap Follow on a team to get phone alerts for it.",
      "The first time, tap Turn on alerts. You hear when the schedule posts, if a game moves, and the scores, and nothing else. On an iPhone, add the site to your Home Screen first.",
      "Follow each team you care about.",
      "Want to see every game at the event? Tap All games.",
      "Players and Events have your players and the events coming up."
    ],
    "outro": "Sunshine Events Group. There from registration to the final whistle, so you can focus on the game."
  }
}
