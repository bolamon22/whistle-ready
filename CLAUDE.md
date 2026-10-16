# Whistle Ready — project guide & working philosophy

This file is read automatically at the start of any Claude / Cowork session that has
this repo connected. It is the project's memory: what the app is, how we work, and the
standards to follow. Keep it updated as things evolve — editing this file is how you
"teach" future sessions, on any computer. Keep it lean: fold old session notes into
"Current state" rather than stacking dated handoffs forever.

## The app
Whistle Ready (formerly "GameDay Staff") — tournament management for Sunshine Events Group
(lacrosse and other sports): tournaments, divisions, pools, brackets, team & player registration,
staff assignment, payroll, financials, public schedule/standings, and live scorekeeping.

- Stack: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS ·
  Prisma + Turso (libSQL) · NextAuth · Stripe · SendGrid (email) · hosted on Vercel.
- Repo: github.com/bolamon22/whistle-ready (public; auto-redirects from the old
  gameday-staff5 name). Live: **whistleready.app** (Vercel project `whistle-ready`).
- The local folders are still named `gameday-staff5` — intentional, don't rename.

### Email (SendGrid)
ALL transactional email goes through ONE wrapper: **`src/lib/email.ts`** (`sendEmail()` /
`emailEnabled()`). Routes must never import an email provider directly — that keeps the
provider swappable in one file and is the seam for per-org senders + future channels.
- Provider: **SendGrid** (`@sendgrid/mail`). Resend was fully removed Jul 16 2026.
- Env: `SENDGRID_API_KEY`, `EMAIL_FROM` (noreply@whistleready.app), `EMAIL_FROM_NAME`.
  `INVITE_FROM_EMAIL` is read only as a legacy fallback.
- `sendEmail()` **never throws** — it returns `{ok, error}` and logs. Email is best-effort so a
  failed receipt can't break a registration. **Tradeoff: a bad key fails SILENTLY** — after any
  email change, confirm a real send in SendGrid's Activity feed, don't trust config alone.
- Send sites: staff invite, staff onboarding (claim) invite, org user invite, org-forms submit,
  registration confirmation, returning-teams invite, payment-recorded alert.
- **Staff/ref invites send AS the org via `orgSender()`** — the org is the employer (Bo, Aug 28
  2026). Platform account mail (password reset, org-user login invites) stays Whistle Ready-branded.
- `whistleready.app` is domain-authenticated in SendGrid (3 CNAMEs at **GoDaddy**, which hosts
  this domain's DNS; `_dmarc` already existed). The SendGrid account is SHARED with
  Lacrossewear/lwops.com but uses a SEPARATE key ("Whistle Ready", Mail Send only) and a separate
  authenticated domain — only the plan quota is shared.

### Payments (Stripe)
- Every card / ACH payment surface uses `src/components/StripePayPanel.tsx`: the /pay link (the club
  portal's Pay button opens it) and the team registration payment step.
- **Apple Pay** (Oct 8 2026, ecc6275) rides on the card option: Stripe's Express Checkout Element on
  the same card PaymentIntent, so the 3% fee and the recording are the card path's. It only appears
  on domains registered in Stripe > Settings > Payment method domains (whistleready.app and
  sunshineeventsgroup.com). **A new domain that shows the pay page must be added there too**, or
  Apple Pay silently doesn't show on it.

### Apple Wallet passes
Credentials can be added to Apple Wallet. ONE wrapper — **`src/lib/wallet.ts`** (`buildApplePass()` /
`walletEnabled()`); routes must never import `passkit-generator` directly, same rule as `email.ts`.
- `buildApplePass()` **never throws** — it returns `{ok,error}`. A wallet pass is a convenience on top
  of the printed card and the public verify page; neither may break when a cert expires.
- Passes are `generic` style (identity documents outlive one weekend), themed from the shared `ROLES`
  palette in `credentialCard.tsx`, so the pass matches the printed card.
- Serial numbers are stable (`staff-{workerId}`) so re-downloading REPLACES the pass instead of
  stacking duplicates in Wallet.
- The QR points at the same public `/verify/[workerId]` page as the printed card. **A Wallet pass can
  only show a small thumbnail, not a photo-ID portrait** — the photo check lives behind the QR.
- Live-updating passes (webServiceURL + APNs) are NOT built. Re-download to refresh.

**Setup (Bo does this — it's credentials, the agent must not handle them):**
1. Join the Apple Developer Program ($99/yr) → Identifiers → **Pass Type IDs** → create e.g.
   `pass.app.whistleready.credential`.
2. Generate a CSR in Keychain Access, upload it, download the `.cer`, and export cert + key as PEM.
3. Download the **WWDR G4** intermediate from Apple's certificate page.
4. base64 each PEM (`base64 -w0 file.pem`) into the Vercel env vars listed in `.env.example`:
   `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM`,
   `APPLE_WWDR_PEM` (+ `APPLE_PASS_KEY_PASSPHRASE` if the key is encrypted).

Missing vars = `walletEnabled()` false = the button is hidden and the route 503s. Nothing else breaks.

**Verified Sep 17 2026** with a throwaway self-signed chain in the sandbox: bundle contained
pass.json + manifest.json + signature + icon/logo, all 5 manifest SHA1s matched, no files outside the
manifest, and `openssl smime -verify` returned "Verification successful". Only Apple's real cert can
prove device trust.

**Coach passes** are live too: `/coach/<token>` is the printable credential (PNG at
`/coach/<token>/card.png`, CR80), `/api/wallet/coach/<token>` is the Wallet copy. Token-authorized,
not session-gated — a coach signs the waiver without ever making an account. Both are hidden/503 until
the certificate exists. The coach role themes itself crimson from the shared `ROLES` map.

**Not built yet:** venue coordinates. Lock-screen relevance (the pass surfacing when someone arrives
at the fields) needs lat/lng, and neither `Tournament` nor the locations config stores any — only a
`location` string. Cheapest fix is optional lat/lng fields on the venue editor that Bo pastes from
Google Maps; no geocoding key needed. Media and player passes also still need public verify endpoints
(staff already has `/verify/[workerId]` + `/api/verify-staff`), and the media application collects no
photo at all.

## How we ship (workflow)
- **Working clone (use this one): `C:\Users\bo\GitHub\gameday-staff5`.** There is a second, OLD
  clone at `C:\Users\bo\OneDrive\Documents\GitHub\gameday-staff5` — do NOT commit there. Both show
  as "whistle-ready" in GitHub Desktop; hover to check the path before committing.
- Verify before shipping: `npx tsc --noEmit` (grep the files you touched) and/or an
  esbuild parse; preview UI changes before deploying.
- Deploy: commit → **push to `master` via GitHub Desktop** → Vercel auto-builds and redeploys.
  After pushing, confirm with `git fetch origin` + `git rev-list --left-right --count master...origin/master`.
- Make small, single-file commits where possible. Fix root causes, not symptoms.
- Secrets live in `.env` (gitignored) and Vercel env vars — never in the repo or in chat.
- **DB migrations run in-app**, not via prisma migrate: hit an admin migrate route (e.g. the
  `/admin` page "Migrate: Flights" button → `api/admin/migrate-flights`; the main
  `api/admin/migrate` route creates core tables). Some API routes also self-heal with a
  guarded `ALTER TABLE ... ADD COLUMN` in a try/catch. Migrations use the app's own Turso
  connection — no secrets needed by the agent.

### Tooling gotcha — git index corruption
The Windows-mounted `Downloads/.git` index can corrupt when CLI git and GitHub Desktop write
`.git/index` at the same time (symptom: "bad signature"/"index file corrupt", or a commit that
phantom-deletes hundreds of files). Mitigations: prefer single-file commits; if it corrupts,
`rm .git/index` then `git reset --mixed origin/master` (or `--hard` if the tree is clean) to
rebuild, and commit through GitHub Desktop itself for multi-file/dir changes. A broken
`ORIG_HEAD` ref blocks `merge --ff-only`; `rm .git/ORIG_HEAD` then `git reset --hard origin/master`.

### Tooling gotcha — editor tool truncates; GitHub Desktop can crash
- The Read/Edit/Write file tools can TRUNCATE files in this Downloads folder (and their view can
  diverge from what git/bash see). **Write/patch files via the shell** (python / sed / cat heredoc);
  restore a clobbered file with `git show HEAD:path > path`. Verify with `wc -l` + esbuild after.
- **Stale-mount truncation (Jun 16 — caused a broken prod deploy):** the sandbox mount can serve a
  *stale, truncated* copy of a large file (hit on the ~95 KB `divisions/page.tsx`) — `stat`/`wc -c`
  agree on size yet the content ends mid-component — while git/GHD hold the full, correct file. A
  python read→write then persists the truncation and the build fails (`Unexpected end of file`).
  **Safe edit / recovery:** read the REAL file from git, not the working tree —
  `SHA=$(cat .git/refs/heads/master); git cat-file -p "$SHA:path" > /tmp/x` (use the SHA, **not**
  `HEAD` — the index is often corrupt so `HEAD` won't resolve). Edit the /tmp copy, **guard before
  writing** (assert it ends with the closing `}` AND esbuild is CLEAN), then write it back. **Never
  commit a write whose esbuild fails** — that means the read was truncated. If a truncated commit
  already landed, revert it in GHD (History → right-click commit → *Revert changes in commit*) to
  restore prod, then redo via the git-object method.
- GitHub Desktop's window occasionally hard-crashes to a black screen — a PC restart fixes it. The
  sandbox cannot reach github.com, so pushes go through GitHub Desktop on the Windows side.
- Chrome stealing frontmost focus blocks clicks on GitHub Desktop (it's read-tier) — re-open GHD or
  use Ctrl+P. GHD may open on a different monitor — use `switch_display`.

### Tooling gotcha — line endings (CRLF)
Bo's Windows checkout turns most files' LF into CRLF in the working tree, but the repo itself keeps
them LF; only about ten files (`git ls-files --eol src | grep i/crlf`: games/[id], ref/assignments,
registration-payments, staff/[id] page, ...) are CRLF in git. Write a file with the line endings
the INDEX has (`git ls-files --eol <file>`: `i/lf` or `i/crlf`), never the working tree's: a CRLF
copy of an `i/lf` file commits as a whole-file rewrite (Oct 16 2026, admin/org route, redone
before push). Python text-mode edits turn CRLF into LF, so edit `i/crlf` files byte-safe.

### Tooling gotcha — raw-query column types (Prisma 5.22 + libSQL)
The libSQL adapter picks a type for each column of a raw query, and one value that doesn't fit it
fails the WHOLE query with "Raw query failed. Code: `N/A`. Message: `N/A`", not just that row:
- **A column declared `INTEGER` is read as a 32-bit integer.** One value above 2,147,483,647 fails
  it. Oct 7 2026: a 10-digit jersey number emptied the Player waivers tab in every Monster Mash
  club's portal and broke the staff waiver list (6ab57e6 keeps jerseys to 0-999 and clears bad
  ones). Don't store epoch milliseconds, phone numbers or other big numbers in an INTEGER column
  read this way: keep them as TEXT, or bound them on write.
- **A computed column (`CASE …`, `MAX(…)`, anything without a declared type) is typed from its first
  non-null value, and a number type there rejects NULL.** Oct 8 2026: reading `jersey` through
  `CASE … END` (dd0f597) emptied every club's waiver tab at every event until 0e73b6f put the plain
  column back. Don't use a computed column that can hold both numbers and NULLs. `COUNT(*)` is fine.
- Check a raw-query change on the live site as soon as it deploys: a local test through the adapter
  alone skips Prisma's engine, which is where both of these fail (its download is blocked in the
  Cowork sandbox).

### Help pages (Chirp's manual)
Any change to what a page does, what its buttons are called, or where it lives
updates that feature's help page in the same commit. A new feature gets a new
page, tagged with the roles and routes that can open it. If no page clearly
covers it, add a line to the closest one and say so in your summary to Bo.
- Pages live in `src/help/*.md`, one topic each, with front matter `title`,
  `category`, `order`, `routes` (pages it is about, `*` = tournament id; a role
  sees the page when it can open one of them) and `keywords`. Bold the exact
  on-screen labels; never describe a button the code doesn't have.
- `node scripts/build-help.mjs` regenerates `src/lib/helpArticles.generated.ts`
  (it also runs automatically as `prebuild` on Vercel). Commit both.
- Coverage: `npx -y esbuild@0.21.5 scripts/help-coverage.ts --bundle --platform=node --outfile=/tmp/hc.js && node /tmp/hc.js --list`
  prints, per role, the pages with no help page.
- Renamed a button or menu? grep `src/help` for the old words.

## Design standard (UI consistency)
- Icons: lucide-react only — never emoji.
- Palette: neutral slate base + teal as the single accent; semantic green / red / amber
  only for meaning (money, status). (globals.css global accent is teal app-wide.)
- Cards: one style — `bg-white border border-slate-200 rounded-xl`.
- Use the shared primitives in `src/components/ui` (Card, SectionHeader, StatCard,
  ActionButton); see `src/components/ui/README.md`. Shared game grid: `src/components/GameGrid.tsx`.
- Sentence case; avoid heavy bold.
- Note: the BracketBuilder/scoring bracket views are intentionally their own visual style
  (CFP "rail" layout); the rest of the app follows the light slate/teal standard.

## Current state (as of Sep 30, 2026)

- **One login, several organizations; plans (Oct 16).** Bo: an assigner who works Sunshine's events "wants to use
  it for his own. So he would have the same login, but I would give him access to our events, and then he would
  create his own events", and admins "turn feature on or off if they want to be like a tournament director".
  **Memberships** (`lib/orgMembers.ts`, server only): a login's home stays `User.orgId` + `User.role`; every other
  organization is a row in raw table `OrgMember` (id, userId, orgId, role, createdAt, by; TEXT; unique
  userId+orgId; created lazily). `addToOrg` (Your team POST, Admin → Organizations team POST and new-org owner):
  admin login → refused; already home here → role changes; staff login with no org → this becomes home (as
  before); anyone else → membership (their home is never moved: Your team used to `UPDATE "User" SET orgId, role`
  on any login by email, admins included, and new-org owners were moved too). `setRoleIn` / `removeFromOrg` never
  touch admins. `orgPeople(orgId)` = home people (admins included, shown without controls) + members; used by Your
  team, Admin org team, `/api/field-director-events` (a director sees and sets only their own org's events of a
  field director; the rest of the list is kept) and `/api/assigner-pay`. **Token** (`lib/auth`): `activeOrgId` is
  set by `useSession().update({ activeOrgId })` (trigger 'update', checked against memberships, fresh read);
  `orgId`/`role` are the active org's (`pickActive`: picked, else home, else first), `orgs` = every org id,
  `switchable` when there are 2+, `planOff` = the active org's off groups; the per-instance cache is keyed
  user+active org; admins unchanged. Session adds `switchable` and `planOff` only. **Switcher**:
  `components/nav/OrgSwitcher.tsx` (`useMyOrgs` → GET `/api/me/orgs`; the logo becomes a button with
  **Your organizations**; the phone menu lists them on top), `lib/switchOrg.ts` (`switchOrg`, `safeNext`), then a
  full reload to `/`. `/api/admin/org` now returns the session's (active) org, and for non-admins only id, name,
  slug, logoUrl, contact fields and the Zelle/PayPal/check instructions (it returned `o.*`, bank details included,
  to every signed-in login). **Isolation**: `ORG_SCOPED` roles in middleware (director, scheduler, assigner,
  field_director) work one org at a time: `/api/tournaments/<id>/...` of an event in another org goes through
  without the cookie (as field directors' other events always did), and its staff pages redirect to
  `/switch-org?to=<org>&next=<path>` (a client page that switches, then opens the page) when the login is a member
  there, else to the role's home. The event's org comes from public GET `/api/event-org?id=` (CDN 60 s, plus a
  60 s per-isolate map in middleware); an event with no org is open as before; a failed lookup lets the request
  through. Staff (refs, scorekeepers), club and family logins and admins are not limited by this. A scoped login
  with no org gets no org's events. **Plans** (`lib/orgPlans.ts`, pure; `lib/orgPlanStore.ts` server): Whistle
  Ready Tournament (all on; also no record) and Whistle Ready Assigner (officials only); switch groups
  registration, scheduling (setup + event dashboard), scores, gameday, money, tasks, website, each a set of
  role-permissions.json features plus extra routes (`/dashboard/org/clubs` is registration; site, forms, assets,
  rules, photographers are website). Officials, Staff Pool, Your team, event settings and documents are never
  switched off. Stored in AppSetting `orgPlan:<orgId>` = { plan, features, by, at }; admin UI on
  `/admin/orgs/[id]` (Plan section, saves each click via GET/PUT `/api/admin/orgs/[id]/plan`), the plan picker on
  New Organization (`plan` in POST `/api/admin/orgs`), and the Plan column (`planLabel`, e.g. "Assigner + Scores")
  on the list; the Tier select is gone from the UI (the column stays). `roleCanAccess(role, path, planOff?)`: a
  page in an off group is closed for every role; middleware passes `token.planOff` (an admin's View as of an
  organization: its `preview-plan` cookie, see View as below),
  and every client caller passes `useRole().planOff` (IfCanOpen, TournamentNav, navConfig `visibleMenus` /
  `eventHref`, NavBar, GlobalSearch, EventSwitcher, TournamentsDashboard, EventBackLink, the event dashboard).
  Plans are page-level: API routes don't check them (it's the org's own data). Routes that reach an event
  through another id call `orgGate(gate, tournamentId)` / `orgGateRegistration(gate, regId)` / `orgGateFor(gate,
  orgId)` (lib/apiAuth; roles from `lib/orgScope`, shared with middleware; admins (unless viewing one org), staff,
  clubs and families pass; 404 like a missing record): games/[id] (GET falls back to the public answer), assignments
  (+ the worker must be this org's), assignments/[id], time-entries (+ worker), time-entries/[id], workers/[id]
  and its W-9 (a director of any org could read any W-9), registrations/[id] (travel, edit, delete), its
  confirm resolve, invoice POST, merge (both), restore, send-pay-link, registrations export / deleted /
  pending-transfers, GET /api/registrations (another org's director gets the public answer),
  registration-payments (+[id], refund), payment-records (+[id]; a director must ask by event or person),
  availability, venues/[id] (the id is the event), comm-send and comm-schedule. Payment reconcile and the
  payments audit are now money roles only (they were any staff login) and a director sees only gaps/events of
  their org (`PaymentGap.orgId`: the event's, or the vendor form's). Costs, tasks and contacts were already
  org-scoped (tasksGate). Tests: 42 more real-Prisma checks (scratch isotest). Not yet: one staff home for an
  official in two orgs (staff-portal, ref/assignments, availability answers, check-in, W-9 and training all take
  the first Worker for the login email), Chirp's page list ignores the plan. Tests: 73 real-Prisma checks
  (orgMembers, auth token, Your team, admin org routes, plans, field directors, assigner pay, event-org) and 35
  middleware checks on a built Next app (scratch). Help: switch-organization, org-your-team, admin-organizations,
  top-bar.
- **View as an organization (Oct 16).** Bo: "view it as an outside organization, just so I can see what they see
  ... so I can just switch between them. And have both open up on my screen". An admin's View as is an
  organization plus a role, all in cookies (`lib/previewView.ts`): `preview-role` (set in the browser by
  `lib/role-context`), `preview-org` and `preview-plan` (that org's off groups, comma list), the last two written
  by POST `/api/admin/preview-org` (every org picker uses it; a malformed id clears them) and `preview-plan`
  refreshed by the plan PUT when the org being viewed changes plan. 8 hours each; honored only for a real admin
  and a role in `PREVIEW_ROLES`. With an org: middleware (`previewOf`) applies `preview-plan` as planOff and holds
  pages and `/api/tournaments/<id>` to that org like its own people (another org's event → the role's home, no
  switcher); `lib/apiAuth` gives the gate that org as `orgId` plus `viewing: true`, and the org gates apply to a
  viewing admin. With **All organizations**: the role alone, as before (no plan, no org limit). `useRole()` adds
  `previewOrgId` and `setPreview(orgId, role)` (null role = Back to admin, back to the org viewed before, kept in
  localStorage `wr-view-before`); it reads the cookies on first render, and the browser's other tabs reload on
  `wr-view-stamp`, so no tab shows one view's menus over another's data. UI: `components/nav/ViewAsMenu.tsx` (chip
  at 2xl+, a row in the account and phone menus, the amber bar with **Switch view** / **Back to admin**), an eye per
  org in SuperAdminBar's Viewing list (which shows plans now, not tiers). TournamentsDashboard hides the admin
  tools in View as; Your team (`/api/org/users` now goes through `requireStaff`) and GlobalSearch follow the viewed
  org. Two views side by side = two cookie jars (a private window signed in as admin). Routes that read the real
  session role themselves (`/api/tournaments` GET, `/api/workers`) still answer as admin, scoped by the `viewOrgId`
  the client sends from the cookie. Tests: 38 real-Prisma (vatest) and 30 middleware checks (scratch). Help:
  view-as, top-bar, admin-organizations.
- **Head Assigner (Oct 16).** Bo, about the assigner who runs his own officials business: "we don't call them a
  tournament director". On the Assigner plan the director role is called **Head Assigner**: names only, same role
  key and powers (create events, import games, Your team, staff pay), and the plan already limits the pages. A
  separate role would have meant touching 84 `'director'` checks in 61 files (25 `requireDirector`). `PLANS[k].owner`
  + `ownerTitle(plan)` (lib/orgPlans), `roleTitle(role, plan)` (navConfig). `/api/admin/org` returns `plan` (the
  shown org's key, so `useOrg().plan`, View as included) and `/api/me/orgs` adds `planKey`. Renamed in: View as
  (role list by the picked org's plan, the bar, the chip), account and phone menus, org switcher, Your team,
  Admin → Organizations (new-org owner note, team list and role menu). Not renamed yet: Logins, Chirp's role
  line, Who's on, other pages' own role maps. Tests: 7 more in vatest (45).
- **Head Assigner setup gaps (Oct 16).** Setting one up (Bo: "he would need to have the payroll for the official
  scorekeepers and possibly any miscellaneous staff") showed what the Assigner plan still sent through Event setup &
  scheduling. Pay rates and officials per game lived only in Tournament setup: now also **Pay rates** on Staff pay
  (`components/PayRatesPanel`, directors and admins), and Setup and the panel both load with `staffPayOf()` and save
  with `staffPayBody()` (lib/staffPay). Event cards on home and `/dashboard/director` opened the event dashboard
  ("not allowed" on the Assigner plan, and that page is where "not allowed" sends a director): they use `eventHref`
  (navConfig), and the director page shows only buttons the plan opens. The event header's Register shows only
  with Registration on. The board's Import gives each game `refsLookup` (it ignored the standard officials count)
  and says how many games and assignments it replaces. Still open: a re-import that keeps assignments, a short New
  event form for the Assigner plan. Misc staff are paid through Time Entries (Staff Pool role Field Operations or
  Athletic Trainer, the person's Hourly Rate); roles added in the rate editor are saved but payroll reads only the
  standard role ids (`parsePayRates`). Help: import-games (new), staff-pay-rates, staff-pay-summary,
  admin-organizations (the setup recipe), assigner. Tests: 30 (scratch).
- **Event pages list only the event's organization's Staff Pool (Oct 16).** In View as of an Assigner-plan org,
  its event's roster offered Sunshine's 121 staff: event pages called `/api/workers` with no org, and an admin got
  everyone on the platform. `/api/workers` now holds View as to the viewed org (`gate.viewing`) and takes
  `?tournamentId=` (an admin gets that event's org; others keep their own); the board, roster, Exhibit A and time
  entries send it. Roster POST refuses a worker from another org (a worker with no org is still allowed). Pages that
  send `viewOrgId` (Staff Pool, search) work as before. Tests: 18 (scratch).
- **Training videos follow the plan (Oct 16).** Bo: an Assigner-package org should get only what pertains to refs,
  scorekeepers and the assigning grid. `VIDEO_NEEDS` (lib/training) maps a video to the plan groups its pages need
  (scores, gameday, scheduling, money, registration; unlisted = officials, always on); `videoOnPlan(id, planOff)`,
  `trainingGroups(planOff)` and `groupsFor/videosFor(roles, planOff)`. `/api/training` counts each person against
  their org's plan (report, profile, roster) and returns `planOff` on the self call (View as: the viewed org); sends
  drop off-plan ids. The Video library filters by `useRole().planOff` (an admin sees all). Assigner plan: 19 of 42
  (Start here basics, R1-R3, the assigner series minus A11 Ref needed), plus live scoring with Scores on. Chirp's
  video list still ignores the plan. Tests: 22 pure + 14 real-Prisma (scratch).
- **Availability: every day gets an answer (Oct 14).** The head assigner said refs and staff had trouble listing
  availability (the staff link opened a page they can't see, fixed Oct 13 a3876ea; then everyone counted as available
  until marked out, so All day saved nothing and nobody could tell who had looked). Bo picked Morning / Afternoon,
  exact game times once the schedule is posted, every answer saved, Answered / No answer yet with a filter, and an
  email to the ones who haven't answered. Answers live in raw table `AvailabilityAnswer` (one per worker, event and
  day; all TEXT; `lib/availability`): `all` | `am` (games starting before noon) | `pm` | `times` (start times they
  CAN work) | `no`. Saving one deletes that day's old `Availability` record; an old record still standing wins.
  `effectiveUnavailability()` turns answers into the old "out at these start times" records against the game times
  of the moment, and GET /api/availability (Assigner board warnings) and Auto-assign read it, so a schedule change
  never strands an answer; no answer = available, as before. Pure helpers and labels: `lib/availabilityAnswers`.
  API: GET/POST `/api/availability/answers` (staff answer only for themselves, by login email, and must be on the
  roster; managers set anyone's, a field director only their jobs) and POST `/api/availability/remind` (org sender,
  skips answered / no email / not theirs; an assigner only their pay groups; logged in AppSetting
  `availReminders:<tournamentId>`). The staff portal returns each working event's days (`avail`; game times only
  once the schedule is published). Staff home: a To do card until every day is answered, the day picker inline in
  each event (`components/MyAvailability`, `ExactTimesSheet`), `?avail=<id>` (the email's link) scrolls to that event,
  "Can't work it" is now **Take me off it**. `/tournaments/[id]/availability` is the head assigner's page (tiles, ref
  coverage at the busiest start time per half day using Game.refCount, filters, set for someone, Remind, email
  dialog). Dark mode: scoped `[data-avail]` rules in globals.css. Tests: 45 real-Prisma checks. The training videos
  that show availability need re-recording (claude/staff-training-videos.md).
- **Person profile: events and training (Oct 14).** Bo: list which tournaments a person is doing, add them to a
  roster from the Staff Pool ("I had to go to multiple spots to add someone"), send the staff videos from their
  profile and see whether they watched. The profile panel on the Staff Pool and the Staff roster now holds
  `components/staff/PersonEvents` (GET `/api/workers/[id]/events`: roster events plus events where they have games
  but no roster spot, games per event, `canAdd` = their org's events that haven't ended; add/remove through the
  roster route) and `components/staff/PersonTraining` (GET `/api/training?workerId=`: assigned videos, watched,
  the last logged send that reached their email; Send = POST /api/training/send with `workerIds: [id]` only, never
  roles or eventId, which pick groups). Staff Pool: Training column (from `?report=1`) and bulk **Add to event…**.
  The roster POST no longer resets gameTarget/notes that weren't sent, and returns `added`. Every training count
  (report, roster column, person) goes through `watchedBy()` in `api/training`, so the roster column now includes
  views saved under `user:<id>`; assigners get roster counts for their pay groups. Send videos window: `everyone`
  (Everyone working it) is its own pick, and an event with no role no longer means everyone on it (Bo's send to
  Nicole listed every athletic trainer); the preview returns `people` (everyone matched, with hasEmail) and the
  send takes `exclude` ids from the Who gets it checklist; the send log records everyone and excluded.
- **Own club's games: someone else posts the score (Oct 13).** Bo, on Terry Crowley (club director who works
  events as a field director): one login, both hats, and "have someone else post the scores ... if we set the role
  up for someone else in the future, it will already be that way." `lib/ownClub.ts`: a login that can open a
  club's registration at the event (ClubRegAccess, lib/clubAccess) can't post, change or clear the score of a game
  where either team's nameKey is one of the club's RegisteredTeam names or its club name, whatever its staff role;
  admin and director are exempt. Enforced in PATCH /api/games/[id] (only when score1/score2 actually change, so a
  scheduler's game form that echoes the score still saves), POST live-scores (now `requireStaff`; also refuses a
  game id from another event, 400) and POST import-results. Answer: 403 `{ error, ownClub: true }`. The staff game
  reads (GET /api/tournaments/[id]/games, GET /api/games/[id]) mark those games `ownClub: true`; Post scores shows
  the score without boxes plus a banner, Live scoring lists them without a link, the scorekeeper shows a "Your club
  plays in this game" screen, and the schedule grid's score boxes are disabled. Not checked: the old division
  Bracket page (/tournaments/[id]/divisions/[division]/bracket, linked from nowhere) PATCHes bracket games with
  score1/score2, which BracketGame doesn't have, so every save there fails with a 500 (real Prisma client, Oct 13).
  Two hats: any role but parent gets **Clubs** on Logins (and counts under Clubs & coaches when linked);
  `/api/club-director/permissions` gives a staff login with an openable registration club_director's cd_* tabs on
  its own portal; `/api/club-director/data` shows the draft schedule only to admin/director (`viewerRole`), so
  other staff with a club see it when every club does; Club portal link in AccountMenu and the phone menu (NavBar
  asks `/api/club-director/links` once, the first time a menu opens; not for club_director/coach/parent) and a
  **Your club portal** card on RoleHome (field director, scheduler, assigner homes).
- **Field Director role (Oct 13).** Login role `field_director` runs game day at the events assigned to them
  (Bo: Jamie Wolf "is just going to be working the event"; several can share an event). Their events: AppSetting
  `fieldDirectorEvents:{userId}` = { events, by, at } (`lib/fieldDirector.ts`), picked with the **Works** pills
  on Logins and Your team (`components/FieldDirectorEvents.tsx`, `GET/PUT /api/field-director-events`, admin any,
  director own org). The list rides in the login token: the `lib/auth` jwt callback now re-reads role, orgId and a
  field director's events from the database at most once a minute (cached per server instance), so role changes
  no longer need a sign-out; `session.user.events` exists for field directors only. Middleware sends a field
  director's staff pages of other events home, and passes their `/api/tournaments/<id>/...` calls for other
  events through with the cookie header removed (they get the public answer). Routes that take the event from
  the body or query use `eventGate(gate, tournamentId)` (lib/apiAuth; `gate.events` is null for everyone but a
  signed-in field director, so admin View as is not limited). Features: tournaments_list, roster, availability,
  staff_applications, staff_gameday, scores, game_scorekeeper and the new `tournament_vendors` (vendor list,
  moved out of tournament_people; approving, declining and deleting still need tournament_people). Staff they see:
  `FIELD_DIRECTOR_JOBS` = scorekeeper, athletic_trainer, field_ops (`roleScope.fieldDirectorSees`) on roster,
  workers, availability, staff applications (ref-only applicants dropped) and training; `redactWorker` keeps those
  people's email and phone for them (never pay, notes or mailing address); the games list hides refs' contacts
  from them. They can't create, edit or delete Staff Pool records, create events, or change a game beyond
  score1/score2/provisional. The vendor list strips amountDue, paymentStatus, paidAt, stripeRef, passToken,
  data.boothFee and data.webSponsorFee for roles without money and returns `canManage`. Home
  `/dashboard/field-director` (RoleHome; its action buttons now go three to a row on phones), videos
  `/dashboard/field-director/videos` (the org video page in field-director mode). Fixed on the way: `/api/invite`
  and `/api/availability` took no login; only directors and admins may rotate the signup link (`regenerate`);
  the roster POST answer is redacted; Your team invites now keep the picked login role (raw column
  `StaffInvite.loginRole`); the game-day pages' back link (`components/EventBackLink`) goes home for roles
  without the event dashboard.
- **Header redesign (Oct 13).** `src/app/NavBar.tsx` composes `src/components/nav/`. `navConfig.ts` (pure; not `navMenus.ts`, which a case-insensitive disk confuses with `NavMenus.tsx`):
  `NAV_MENUS` = Events / People / Organization / Admin; `visibleMenus(role)` keeps each link only if
  `roleCanAccess` allows it (plus an optional `roles` list) and drops empty menus, so adding a page to the header
  is one item in NAV_MENUS gated by role-permissions.json. Event helpers: `currentEvent` (the event whose
  `/tournaments/<id>` page you're on, else the next upcoming, else the latest), `dateRange`, `whenLabel`,
  `eventHref` (dashboard, else board, else scheduler, by role). `NavMenus` = the xl+ dropdowns; `EventSwitcher` =
  the pill in the bar and the card in the phone menu (`+ New tournament` → `/?new=1`, which TournamentsDashboard
  opens through useSearchParams; page.tsx wraps it in Suspense); `GlobalSearch` (Ctrl/Cmd K) loads /api/workers,
  /api/admin/users (admins) and /api/org-clubs on first focus, with the same role gates as those pages; login hits
  go to `/admin/users?q=` and clubs to `/dashboard/org/clubs?q=`, and both pages prefill their search from `q`.
  `AccountMenu` holds Profile, Game-day alerts, Appearance, View as and Sign out. One popover open at a time:
  NavBar's `open` key matches the `data-nav-pop` value on each popover root; a mousedown outside it, Escape or a
  page change closes it. Below xl one phone menu holds everything (Organization and Admin fold). The floating
  Light/Dark button is gone (ThemeShell only sets the body class). SuperAdminBar is light Admin tabs (Users is
  called **Logins** everywhere now) plus the org switcher; its ← Back link and `wr-last-app-path` are gone. Dark
  mode: globals.css recolors teal-700/red-700 text and role badges inside `[data-app-chrome]` and
  `[data-admin-tabs]`. Help: `src/help/top-bar.md`, and "top bar → X" wording updated across the help pages.
- **Users page filters and the admin header (Oct 13).** `GET /api/admin/users` adds per login: `staff` (the
  Staff Pool record with the same email: oldest record's id, jobs merged across duplicates, gender, count),
  `clubs` (club names from ClubRegAccess), `players` (ParentWaiverLink count). The page shows those under the
  name and has Who chips (Office = admin/director/scheduler/assigner; Staff = staff and any other role; Clubs &
  coaches; Parents), Job chips under Staff (including No staff record), a Last on filter (visits recorded from
  Oct 12) and sort; search matches jobs and club names. NavBar no longer hides on /admin (only /o/), so admin
  pages keep the app header with SuperAdminBar (the Admin tabs) under it.
- **Refs who signed up as Parents; Logins → Staff Pool (Oct 14).** Every Register / Create account / Create one
  link went to /register, which can only make a Parent login, so refs "signing up to officiate" got Parent logins
  with no Staff Pool record, and changing the role to Staff on Logins still left them off every staff list (Steve
  Newell). One rule now: `lib/staffLogin.ts giveStaffAccess(email, orgId, role = 'staff')` raises a role in
  `STAFF_PROMOTABLE` ('', viewer, parent, coach, club_director) to `role`, leaves office roles and the old
  scorekeeper alone, and fills an empty `User.orgId` from the record. Callers: `/api/admin/users/staff-pool`
  (Logins' **Add to the Staff Pool** dialog, `components/StaffPoolDialog`: GET login + every Worker + orgs;
  POST `link` sets a Worker's email to the login's, `create` makes a Worker for one job), `/api/join` (an email
  with a login joins with that login's password; a wrong one is a 409 with `existingAccount` and creates
  nothing) and both invite paths. Changing a role to Staff on Logins opens the dialog. `GET /api/admin/users`
  adds `staffMatch` (exactly one same-name Worker under an email no login uses); its PATCH no longer returns
  the password hash. `/register` is a server page (each organizer's Work with us link) around `RegisterForm`,
  which asks who the account is for; self-signup still never makes a staff login. The signed-out NavBar button
  says Create account, and `/login?portal=1` opens the club portal-link form.
- **Officials confirm their games (Oct 15).** The referee assigners asked to have officials confirm the games
  they're given when the schedule is released, like teams confirm. Notify officials (`confirm: true`, `confirmBy`,
  on by default in its dialog) saves the event's ask (AppSetting `officialConfirmAsk:{tid}`: confirmBy, who, their
  email) and gives each official with games left to answer a "Confirm my games" button to `/confirm-games/[token]`:
  no login, the token (raw table `OfficialConfirmLink`, one per official per event) is the key, like `/confirm/[regId]`.
  Answers are raw table `OfficialConfirm` (TEXT only; one row per gameId + role + workerId): `yes` with `sig` (the
  game's day~time~field~number when they answered; a moved game reads as "changed" and needs confirming again) or
  `no` with a note. A `no` deletes their Assignment on the spot (the slot opens, pay never counts it), keeps the
  row so the board and `/tournaments/[id]/confirmations` show who couldn't and why, and emails + pushes the asker.
  No `no` within 48 hours of the game's day (`availLocked`, as for availability). `lib/officialConfirm.ts` (server),
  `api/official-confirm/[token]` (public GET/POST), `api/tournaments/[id]/official-confirm` (GET board data, POST
  `confirm` = marked by phone; admin/director/assigner). Reminders are Notify officials with `workerIds` +
  `reminder: true`. The staff portal returns `confirm` per event for the To do card on My games; the board shows a
  ✓ per confirmed slot, "open · Name can't" on declined open slots, Confirmed N/N in its toolbar, and opens `?day=`.
  Merge moves answers and links. Middleware lists `/confirm-games` (public via `/confirm` too).
- **Ref levels (Oct 15).** The ref assigners' own 1-3 ranking of their refs (1 lowest, red; 2 yellow; 3 green),
  separate from `certLevel` (youth/HS/college, which sets pay). `lib/refLevel.ts` (pure: `REF_LEVELS`,
  `refLevelOf`), `components/RefLevelPill.tsx` (solid "L1"-"L3", unlike the board's tinted game-count pills),
  `lib/refLevelDb.ts` (server: raw INTEGER `Worker.refLevel`, NULL = not ranked, column made on first use;
  `setRefLevel`, `refLevelsFor`). It follows the pay rule: `refLevel` is in roleScope's `WORKER_PAY_KEYS`, so
  `redactWorker` blanks it and `stripWorkerUpdate` drops it for anyone who doesn't see that person's pay
  (`canSeeRefLevel` = admin, director, assigner; an assigner only for their pay groups). Refs never see their own:
  nothing they read returns it. Set in the Staff Pool and Staff roster edit forms and bulk bars (PATCH/POST
  `/api/workers`); shown on the Staff Pool (Level column, sort, filter), roster, the Assigner (staff bar, slot
  pickers, compact chips), Availability (`level` from `/api/availability/answers`) and `/staff/[id]`. Merge keeps
  the kept record's level, else the other's. Not used by Auto-assign.
- **Training-video emails to one person (Oct 15).** Bo's send to Haylee Lamon from her profile sent nothing: her
  two Staff Pool records were the only ones with no `orgId`, and `/api/training/send` reads only the sender's org
  ("Nobody with an email matches"). An admin's sends and the Who's watched report now include records with no
  org; everyone else stays in their org. A send that picked people who all fail to match is a 400 instead of
  mailing the sender's copy alone (a copy with nobody picked is still the sender's own test). Every recipient of
  every send is a row in raw table `TrainingEmail` (`lib/trainingSends.ts`: sentAt, email, workerId, byName,
  byUserId, videoIds JSON, ok 0/1, error); `GET /api/training?workerId=` returns them as `sends` plus `email`, and
  `PersonTraining` lists them under "Emailed to …", asks inline (no browser confirm) with "Send me a copy" (the
  copy is the recipient's own email marked "Copy:"), and shows exactly who it went to or why not. `watchedBy`
  counts views under every record with the same email (views are keyed by the oldest record), and
  `/api/workers/merge` moves StaffTraining views (plays added on overlap) and TrainingEmail rows to the kept
  record and fills an empty `orgId` from the other record or the merging director's org.
- **Sponsors & partners (Oct 14).** Rows in AppSetting `orgSite:{orgId}.sponsors` carry `eventIds` (dated picks)
  and `series` (event labels from `seriesLabelOf`, "Every year"); both empty = every event. Public pages filter with
  `sponsorsForEvent(list, tournamentId, tournamentName)` in `lib/sponsors.ts`: pass the NAME or every-year picks don't
  match (event page and `_eventChrome` do). Admin editor: `components/site/SponsorsEditor.tsx` (one row per sponsor,
  presenting and grid groups, logo-wall check) over `lib/sponsorPicker.ts` (client-safe: rows per event, past year +
  upcoming, older behind Show older events, summaries). The home page shows every sponsor. Tests: 43 lib checks + 36
  browser checks on Sunshine's real event list (scratch).
- **Assigner pay groups (Oct 13).** Staff pay is split into groups (`lib/payGroups.ts`, pure): `boys` and
  `girls` (ref slots, by the game's division through `gameGender`; a division that says neither follows the
  ref's own gender), `scorekeepers`, and `ops` (field ops, trainers, hourly time). Each assigner's groups are
  AppSetting `assignerPay:{userId}` = `{ groups, by, at }` (`lib/payScope.ts`, server only); unset = boys +
  girls; all four = `scope.all`, which also shows event-wide pay totals. `payScopeFor(role, userId)`: admin and
  director all, assigner their groups, everyone else none ("View as" an assigner gets the default). Applied in
  pay-summary (`scope` in the answer, `partial` per person), payment-records (a record shows only when that
  person's pay at the event is in scope, amount null when partial; POST and DELETE need all of it, and an
  assigner's POST amount is the server's total), assignments and games GET (`payRate` null outside scope; the
  games list no longer hands rates or payout handles to schedulers or staff), workers, roster and time entries
  (`redactWorker(w, role, scope)`, `stripWorkerUpdate(body, role, scope, stored)`), the dashboard's pay totals
  (scope.all only) and the auto-assign preview (no payRate). Set on Users (admin) and Your team (director)
  with `components/AssignerPayAccess.tsx` -> `GET/PUT /api/assigner-pay` (a director only for their own org;
  User.orgId is raw). Tests: 60 checks on the real Prisma engine over SQLite (scratch).
- **Vendor invoices (Oct 12).** An approved vendor with a fee has an **Invoice** box on Vendor requests
  (`vendor-requests/VendorInvoicePanel.tsx`, money roles only; the GET adds `canMoney` and `invoices`). PDF:
  `lib/vendorInvoice.ts` (pure) builds an `InvoiceDoc` drawn by `buildInvoicePdf` (booth type line, web
  sponsorship as its own line when approved as quoted, products in a DETAILS column, "Approved" date, no card
  fee); public `GET /api/vendor/[token]/invoice` (token = auth, like the booth page, which links it). Office
  actions: `POST /api/tournaments/[id]/vendor-requests/invoice` `email | pay | unpay | qbo`. Payments by hand
  live on the row as JSON (`vendorPayments`, `lib/vendorInvoiceStore.ts`, written only if unchanged since read);
  paid in full by hand sets `paymentStatus = 'paid'` like the webhook. The booth page's Stripe payment has no
  amount on the row: `lib/vendorMoney.ts` counts it as what was left after the hand payments, and checkout
  charges exactly that. New OrgFormSubmission columns (all TEXT '') are made by `ensureVendorInvoiceColumns`,
  not `ensureSubmissionsTable`. QuickBooks (`lib/qboSync.ts` `syncVendor`, `pendingVendorsFor`,
  `syncVendorsNow`): same number sequence and lock as the clubs, vendor company as customer (name clash ->
  "(booth)"), per-event top-level item "Vendor Booth - <event> <year>" with the team fees' income account
  (`settings.vendorItems`), payments into Undeposited Funds; the cron runs vendors after the clubs. Email
  invoice syncs first when the sync is on. Decline/Undo refused once money is in; Delete refused while in
  QuickBooks. Approving with a blank fee now adds the web sponsorship to the type's price (it was dropped).
  Tests: 64 checks on the real Prisma engine over SQLite with a fake QuickBooks (scratch).
- **Club letters you write + AI writer (Oct 12).** The Email clubs dialog (registrations page) has **Your
  letter**: saved letters live in AppSetting `commLetterCustom:{orgId}` = `{ letters }` (`lib/customLetters.ts`,
  pure and client-safe; 40 per org; name 40 / subject 200 / body 4000 chars), `GET/POST/PUT/DELETE
  /api/registrations/comm-custom`. Sends reuse `runCommSend` with `kind: 'custom'` + `custom: {id,name,button}`;
  a letter whose button is **Pay balance** runs as `payment` (same recipients, pay link and receipt as the
  payment reminder). No built-in text, so an empty letter is refused (400). Send log key `custom:{id}`
  (`custom:oneoff` when unsaved); scheduled sends carry `payload.custom` to the cron. `{countdown}` joined the
  merge fields. AI: `POST /api/registrations/comm-ai` (staff, same key + model as `api/ai/generate`, forced
  `letter` tool, prompt in `lib/letterAi.ts`) writes words only; the send fills the `{fields}`. Unknown
  `{fields}` block Send/Save (red), a rewrite that drops a field shows an amber warning, and **Undo the AI
  change** restores the letter. Both AI boxes take dictation through `DictateButton`.
- **Read / edit a scheduled club letter (Oct 15).** Each SCHEDULED row in Email clubs opens a reader: subject +
  body editable, `AiRewriteBar`, the unknown-`{field}` check and a preview for the row's first club. Unsaved
  wording is kept per send (`schedDrafts`). `PATCH /api/registrations/comm-schedule` `{id, tournamentId, subject,
  body}` → `updateScheduled` (queued rows only, else 404; refuses over 200/4000 chars and unknown fields;
  `type: 'returning'` refused, no editor yet). `claimDue` re-reads the row after claiming, so an edit saved
  mid-claim can't go out as the old wording. Only that send changes; saved letters stay as they are.
- **Staff W-9 upload (Oct 11).** W-9 card on the staff portal (`components/StaffW9Card.tsx`, `/dashboard/staff`),
  `GET/POST /api/staff-portal/w9` (worker from the session email, oldest record, never from the request). All W-9
  storage goes through `lib/staffW9.ts`: encrypted data URL in AppSetting `w9:{workerId}`, `w9meta:{workerId}`
  for the portal's date/name, `Worker.w9OnFile` for the pool's W-9 check. Type is sniffed from the bytes (PDF,
  JPEG, PNG, WebP; 2 MB); refuses without `ENCRYPTION_KEY` (lib/encrypt has a public fallback key). Viewer
  `/api/workers/[id]/w9` is director/admin only and serves the sniffed type with nosniff. Staff merge moves it.
- **Division notes + bracket format before the schedule (Oct 11).** "Notes on the public schedule" above a
  division's tabs (`divisions/DivisionNotes.tsx`): one per division, one for all divisions. AppSetting
  `divisionNotes:{tournamentId}` = `{ all, divisions: { [name]: note } }` (`lib/divisionNotes.ts`, 600 chars,
  `nameKey` match); `GET/PUT /api/tournaments/[id]/division-notes`, public only once Teams & pools is on.
  Public DivisionView shows the division's note then the all note at the top. The bracket GET gives
  non-staff a format-only bracket (`preview: true`, `seeds: {}`, games stripped to number/round/section/
  sources/label) when Teams & pools is on but Schedule & brackets is not; the page draws it under the pools
  as **Bracket format** (`BracketView preview`). Not the event page's `divisionsNote` (Tournament setup).
- **Pool play only / no bracket (Oct 11).** A division's **Bracket** tab opens with a **No bracket: pool
  play only** checkbox (`BracketBuilder.tsx`, `PUT /api/tournaments/[id]/divisions/[division]/no-bracket`).
  Stored per event in AppSetting `noBracket:{tournamentId}` as `{ [division]: { at, by } }`, matched by
  `nameKey` (`lib/divisionPlan.ts`). On: the bracket POST refuses with 409 `noBracket: true` (any page,
  including split into flights), Generate all skips the division and counts it in its summary, the
  divisions GET returns `noBracket`, the rail shows **Pool play only**. Turning it on is refused (409)
  while the division has a Bracket row or any B# game. Division rename carries it; delete clears it.
- **Parent accounts from the waiver (Oct 9).** The player waiver's thank-you screen asks **Save your
  info for next time?** (`components/ParentAccountOffer.tsx`). The submit response carries `account`
  from `accountOffer()` in `lib/parentWaivers.ts`: a 3-hour HMAC token (NEXTAUTH_SECRET, prefix
  `parentacct.`) naming the waiver, org and parent email (`existing` when that email has a login), or
  `linked` when the signed-in user IS the parent or parent 2. Anyone else signed in (office at
  check-in, club director, coach) gets nothing. `POST /api/parent/account {token, password}` makes a
  `parent` login on the token's email (8+ chars), or for an existing login needs that login's own
  password (never overwritten); 8 tries per waiver per 15 min (`overLimit`). Waivers join logins ONLY
  through raw-SQL table `ParentWaiverLink` (userId, submissionId, orgId; created lazily), never by email
  match. **My Players** on `/dashboard/parent` (`components/ParentWaiverList.tsx`, `?tab=players`)
  lists them (`GET /api/parent/waivers`); `PATCH /api/parent/waivers/[id]` edits only the fields in
  `lib/parentWaiverFields.ts` (pure; not name, DOB, gender, team, parent email or signature), refuses
  once the event's last day has passed (hotel answers feed the room-night reports), and records
  `parent: <name>` in the waiver's edits. Which fields show follows the org's waiver switches
  (`shownParentFields`; its defaults copy DEFAULT_FIELDS in `tournaments/[id]/player-waiver/page.tsx`).
  **Auto-fill:** `components/WaiverPrefillBar.tsx` above the waiver's `<form>` (never inside it: it has
  its own sign-in form). Signed out: inline sign-in. Signed in: one chip per player from
  `GET /api/parent/prefill?event=` (`prefillFor`: newest-touched waiver per name+DOB; player + family
  keys only, never club/team/hotel/signature; grade only in the same school year, Aug 1; photo only
  `/api/img/`). **New player** = family only, for siblings; `?sibling=1` picks it (the thank-you card's
  **Add a brother or sister** and My Players link there). **Parent dashboard** reads
  `/api/public/tournaments` (`/api/tournaments` returns [] for logins with no org, i.e. every parent),
  derives the players' teams from waivers as (division, team) via `teamRefKey`, and its Schedule
  filters to them (**My teams' games** / **All games**), games from `?view=public`, sorted by minutes,
  not clock text. Device follows (TeamFollow2, phone alerts) stay on the public page.
  Not built: adding a waiver filed before the account existed.

- **Org site header shows the next events (Oct 7).** Cross-promotion on every page that renders
  `OrgHeader` (org pages + each event's pages): `headerEvents()` in `o/[slug]/_chrome.tsx` = the
  org's next 4 by start date, kept through the last day in Eastern time; the reg badge comes from
  `json_extract` on the 4 `tournamentSite:` blobs, not the whole blobs. `OrgHeader` is now async and
  loads them from `orgId` (falls back to `org.id`); tournament pages pass `orgId` + `currentId`
  (that event gets a teal ring). `OrgNav` shows the logos beside **Tournaments** from `xl`, with a
  hover card (`EventLogos`); below `xl` a pill row (logo + first day) sits under the header. Fit
  measured at 1280 with Sunshine's longest menu: 247px free before, about 83px after.
- **Tasks (Oct 4).** Bo's to-do list per event: `/tasks` (every event + General), each tournament's
  **Tasks** tab (`/tournaments/[id]/tasks`), a card on the tournaments page and a box on the tournament
  dashboard. Red badges (top bar, Tasks tab) count OVERDUE only (Bo: overdue+this-week was always lit).
  Raw-SQL table `OrgTask`, created lazily in `lib/tasks.ts` (not in schema.prisma), org-scoped like
  follows; `lib/tasksGate.ts` = feature `tasks` (director yes, everyone else no) + admin preview org.
  The template is `STARTER_TEMPLATE` in `lib/taskTemplate.ts` (pure, client-safe): due dates are offsets
  from the first game day, `only`/`suggest` decide what's ticked per event. Tracked items read live data
  (`lib/taskSignals.ts`); publish/payrem/unpaid/refs check themselves off ONCE (`autoDoneAt`), so a
  reopen sticks. The shared setup checklist is NOT copied into OrgTask: it stays AppSetting
  `checklists:{id}` (staff check it off), shown as one virtual row `setup:<id>` due the day before.
  No assignees on purpose ("just me for now").

- **Event contacts (Oct 5).** Everyone an event gets something from or owes something to (venues,
  counties, sports commissions, rentals, food/vendors, officials, insurance, housing). `/contacts`
  (directory: stat tiles, event + category filters, detail panel/sheet) and each tournament's
  **Contacts** tab (`/tournaments/[id]/contacts`: this event's Tasks as a setup checklist + its
  contacts). On phones there is no 7th tab: the contacts sit at the bottom of the Tasks tab
  (`NavGroup.wide`). Same feature switch and scope as Tasks (`tasks`, `tasksGate`). Raw-SQL
  `OrgContact` (lazy, soft delete) in `lib/contacts.ts`; `lib/contactTypes.ts` is the client-safe
  half. A task links to one contact via `OrgTask.contactId` (guarded ALTER); the checklist IS the
  Tasks list, never a second one. `/api/contacts/import` takes a JSON file written with event
  NAMES (matched to the org's next tournament with that name), skips duplicates, and turns its
  open items into linked Tasks. Contact details never go in the repo (it is public): the Gmail-scan
  seed lives outside it. Nothing here emails a contact; the pages only open Bo's mail app.
- **Event costs + vendor emails (Oct 5).** Each vendor's quote, item by item, per event, so a budget
  starts from last year's real prices and a rise shows on the line that rose (Bo thought Sunrise's
  tent prices climbed every year; item by item 2023→2026 only chairs did, $1.99→$3). Raw-SQL
  `EventCost` (lazy, soft delete) in `lib/eventCosts.ts`; `lib/costTypes.ts` is the client-safe half
  (`priceHistory`, `itemKey`, `lastOrder`, `costTotal`). Same switch/scope as Tasks (`tasksGate`).
  A line for a past event not in Whistle Ready has `tournamentId ''` + `eventLabel`/`eventDate`
  (history only). **Money paid on a tournament line IS one `TournamentTransaction` expense**
  (`syncExpense`): the deposit (`paid`, entered while Booked) until the line is Paid, then the
  full total; nothing paid or a delete removes it. Never also add it by hand on Financials > Other. UI: Financials **Budget** tab (`components/costs/EventBudget`:
  this event's lines vs the same vendor last time, "Budget from last time"), and a **Costs**
  section on every contact card (`VendorCosts`, price history table). **Write an email** on a
  contact (`VendorEmailDialog`, `lib/vendorEmails.ts`): ask for a quote (lists the last order's
  non-fee items), approve, confirm delivery, ask for the invoice; opens a Gmail compose window or
  copies. **Their usual email (Oct 8):** a contact can keep the email Bo sends them every year
  (`OrgContact.emailSubject`/`emailBody`, tokens {event} {dates} {year} {teams} {place} {first} {me};
  `fillTemplate`/`toTemplate` in `lib/vendorEmails.ts`, an unknown value shows as `[token]`). "Save
  as their usual email" tokenizes what's in the box. **Send** / **Email it to me** go through
  `/api/contacts/send` with `plain=1` (no attachment; org sender, cc + reply-to the signed-in user,
  a dated note on the contact) — the only sends from this dialog; Gmail/Copy still never send.
- **Staff training videos (Oct 13).** 11 narrated how-to MP4s (~1 min, 18 MB total) in
  `public/training/<id>.mp4` + `<id>.jpg` poster; catalog and role groups in `lib/training.ts`
  (client-safe). Page `/dashboard/staff/training` (role groups first, "More videos" folded,
  `?v=<id>` opens one); a video counts as watched at 85% (`POST /api/training`, raw table
  `StaffTraining` keyed by Worker id matched on session email, else `user:<id>`). Staff home card
  shows "X of Y watched"; Staff roster has a **Training** column (`GET /api/training?tournamentId=`,
  directors). `components/TrainingLink` = "Watch how" links on the scorer (settings, penalty form,
  overtime sheet, bottom), Field Request, Incidents, Checklist and Directory; help articles link
  them too. Middleware lets `.mp4/.webm` through like other static files. The videos were filmed
  from the real components with mocked data (project doc `claude/staff-training-videos.md`);
  re-film when those screens change.
- **Parent dashboard redesign (Oct 13).** `/dashboard/parent` is phone-first: tabs Home /
  Schedule / Players / Events (bottom bar on phones, `?tab=` still takes the old teams/discover).
  Home = next game (their teams' first upcoming game, `liveScores` decide Live/Final), Live now,
  Before game day, players, events, website + how-to links. Follow on Schedule is the SAME
  device-keyed follow as `/public` (`/api/tournaments/[id]/follows` + `FollowAlertsSheet`), so it
  drives the phone alerts. Directions / Field map come from the event's venues via
  `GET /api/public/event-info?ids=` (public; also returns the org slug for the SEG logo).
  Live scores poll every 30s while the tab is visible. Mockup: "Parent Dashboard Redesign" canvas.
- **Family & club how-to videos (Oct 13).** Public, branded "Sunshine Events Group, powered by
  Whistle Ready", so `lib/howToVideos.ts` gates everything on `hasHowTo(orgSlug)` (SEG only).
  Files `public/how-to/<id>.mp4` + `.jpg` (ids `waiver`, `club-portal`). Page `/o/[slug]/how-to`
  (= sunshineeventsgroup.com/how-to, `?v=<id>` opens one). `components/HowToVideoLink` plays in a
  modal, no sign-in: on the player waiver form (`howTo` prop), the event page's "For players &
  parents" box, and the club portal header + a first-visit "New here?" card (portal gets the
  slug from `/api/club-director/links` -> `tournaments[].orgSlug`). Emails: registration
  confirmation links row, every club letter (commSend) and the pay reminder (`videoHtml`) carry
  `howToEmailLinks`. Scripts live in the "Family & Club Video Scripts" doc; re-film when screens change.
- **Financials redesign (Oct 5).** `/tournaments/[id]/financials` tabs: **Overview**
  (`components/financials/OverviewTab`), **Budget** (`BudgetTab`), **Other entries** (hand-typed
  transactions only; a bill's synced expense is hidden there). All money math is in `lib/finance.ts`
  (`buildFinance`, `projectPL`, client-safe). Rules: income = billed (teams, players, approved
  booths, typed income); a cost counts once **committed** (cost line past Budgeted, staff schedule,
  typed expense). "Profit when everything is collected and paid" = billed − committed; "Cash in hand"
  = collected − paid. Never mix (the old page counted staff when owed but vendors when paid).
  `EventCost.payments` (JSON list) is the record of each payment; `addPayment`/`removePayment` on
  PATCH recompute `paid`, date, method, and set Paid when the total is covered; older lines with only
  `paid` read as one payment (`paymentsOf`). `EventCost.planned` = the Budget tab's plan for that
  line. Income plan + the staff plan live in raw-SQL `EventPlanLine` (`lib/eventPlan.ts`,
  `/api/plan` GET/PUT replaces the event's lines). A blank planned box projects billed (income) or
  committed (costs). `components/costs/EventBudget.tsx` is superseded by BudgetTab (unused).

- **Club portal access is per registration, by email (Oct 4).** `src/lib/clubAccess.ts`: raw-SQL
  table `ClubRegAccess (userId, registrationId)`, created lazily; the first call carried every old
  `ClubDirectorLink` over as the registrations its club name had at that moment. Every
  club-director route asks `canOpen` / `openableRegistrations`; **never grant or check by club
  name**. Grants come only from registering (the password on the public form,
  `lib/claim setUpPortalLogin`), the claim link, register-again, a director's invite
  (`lib/clubInvites`, `/api/club-director/directors`, opened on `/claim/<token>`), staff on the
  Users page (`grantByClubName`), and merges (`copyAccess`). `ClubDirectorLink` rows are still
  written next to each grant (rollback safety, listings) but grant nothing. Waivers are filed by
  club name, so `sharedClubKeys` hides a name's waivers from a login that can't open every live
  registration of that name at the event. Club mail (`lib/clubDirectorLinks`) is keyed by
  registration id. The public form also offers a returning director's login on file
  (`lib/loginHint`, masked email only) and their past teams (`/api/registrations/my-teams`).
- **Follow your team + schedule alerts (Sep 30) — all 5 steps built.** Instagram-style Follow on
  every team on `/public` (grid, names, standings, game rows, search, My Teams) with follower counts;
  a device can follow up to 40 teams per event. Follows are **anonymous and device-keyed**
  (localStorage `wr-device` UUID) in raw-SQL tables `TeamFollow2` + `FollowerDevice` (created lazily,
  deliberately NOT in schema.prisma — same precedent as ClubDirectorLink): `src/lib/follows.ts`.
  **A team is a (division, name) pair everywhere in this feature** — `teamRefKey(division, team)` in
  `lib/names.ts` is the key for follows, counts, reach, digests and final tags, because the same club
  fields "Miami Reign" in HS A, HS B and U14 B (Bo, Oct 1: one tap was following all three). The
  day-one name-only table `TeamFollow` is left in place as a backup; its rows were carried into
  `TeamFollow2` once (a name in several divisions → one follow per division). `renameTeamRefs` /
  `removeTeamRefs` in `lib/teamRename.ts` take the division too — deleting one club's HS B team must
  not delete its HS A games.
  Alerts = web push (shared VAPID in `lib/push.ts`, browser side `lib/pushClient.ts`, `public/sw.js`);
  the first Follow offers the alerts opt-in (`FollowAlertsSheet`; iOS must Add to Home Screen first).
  - **Publish is the only gate for schedule alerts** (Bo: slots get shuffled all week, most moves must
    stay quiet). The Scheduler's Publish stops at the review dialog *only when a follower of an affected
    team has alerts on*, with a "Tell followers" toggle (on by default); otherwise it publishes at once.
    The route (`publish/route.ts`) diffs the OLD snapshot → `affectedTeams()` (first publish = every
    scheduled team) → **one push per team** with that team's current schedule (`lib/scheduleDigest.ts`,
    tag `sched:{tournamentId}:{teamRefKey}` so a republish replaces the earlier alert). Never one per game.
  - **Broadcast reaches followers too** (`announcements/route.ts` + `GET follows/reach`): a broadcast for
    Everyone / a division / a team can alert the phones following those teams, same on-by-default toggle,
    reach shown as distinct people and phones (`lib/follows.followerReach`, `teamDivisions`). Coaches and
    staff are not followers — banner only. It is one messaging system with one more delivery target, not a
    second one (Bo does not want the two to overlap).
  - **Finals are automatic** (`lib/finalAlerts.ts`, called from `PATCH /api/games/[id]` and the bracket
    page's game PATCH): when both scores land or change, followers of both teams get "Final: Ghost 8, H44 6"
    — only during the event's dates (test scores the week before reach nobody), never for placeholder teams
    or canceled games, tag `final:{tournamentId}:{divisionKey}:{gameNumber}` so a corrected score REPLACES
    the alert and a game scored on both the Scores page and the bracket page shows once. The scorekeeper's
    top-bar Save sends `provisional: true` (keeps the running score without announcing it); only
    "End Game & Post Score" is the final. **Gotcha fixed here:** the game PATCH turned a null score into 0
    (`Number(null)`), so the Scores page's first box made the public page show a phantom 8-0 final.
  - **Follower counts** show under team names on `/public` (pool tiles, list, standings, search) via
    `FollowCountsContext`; hidden at zero; optimistic bump, server count wins.
  - Renames/deletes flow through `lib/teamRename.ts` (`renameFollowRefs` / `removeFollowRefs`).
  - Test harness pattern that worked for all of this: bundle the real lib/route with esbuild, alias
    `@/lib/db` to a `node:sqlite` stand-in for the raw-SQL tables (Prisma model calls return fixtures),
    alias `next/server` / `next-auth` to tiny shims, and drive the real client pages in Playwright with
    `window.fetch` mocked. Lives in `.harness/` on the sandbox side only (not committed).

- **Public page reads the roster, not the schedule; a deleted team leaves everywhere (Sep 29–30).**
  `/public` used to derive divisions/pools/teams from games, so nothing showed before the schedule and a
  deleted team lingered in standings. Now: `GET /api/tournaments/[id]/pools` serves pools from
  `Pool.teamNames` filtered through `src/lib/poolMembership.ts` (`keepRegistered`; `pruneOrphanPoolNames`
  on registration delete/edit — `Pool.teamNames` is a JSON name list with no FK). Pre-schedule the page
  shows just the teams per pool, alphabetical, no tab bar. Deleting a team (`lib/teamRename.removeTeamRefs`)
  removes its games, blanks bracket slots and follows, and the Scheduler/Divisions show `ShortTeamsBanner`
  (`lib/gameBalance.findShortTeams`, pool MAX games as the yardstick) so nobody ends up short unnoticed.
  This is for BEFORE play; a team that withdraws mid-event is not deleted from registration. One shared
  `EventHero` (`_eventHero.tsx` + `lib/eventHero.ts`) now heads every public event page, including `/public`.

- **Registration status badges + waiting list (Sep 29)** — per-event and per-division "how full
  are we" signalling, and the billing rule that came with it.
  - Content lives in the `tournamentSite:{id}` AppSetting blob (no migration): `regStatus` /
    `regStatusText` / `regClosesOn` for the event badge, `divisionStatus` / `divisionSpots`
    per division. Edited at **Setup → Divisions** (dropdown + editable badge text + live preview
    + each division's current team count, so status is set against a real number).
  - Helpers are centralized in **`src/lib/regStatus.ts`** — `regBadge()`, `divisionBadge()`,
    `isDivisionFull()`, `TONE_CLASS`. Amber = still taking teams, navy = Full; never red (red is
    the required-field color). The default event label counts what is **open**, never what is
    gone. Rendered on the event hero, the org tournament cards, and the division pills.
  - **⚠ Marking a division "full" MOVES MONEY.** A team registering into a full division is
    stored `waitlisted` (new `RegisteredTeam.waitlisted`, guarded ALTER + in schema.prisma) and
    left OFF the invoice — but it still **counts toward the volume tier**, so a club that waited
    keeps its multi-team rate (Bo, Sep 29: "if they waited this long they should get the
    discount"). See `calcFee()` in `src/lib/regPricing.ts`. A division left marked full after it
    reopens silently under-bills every club that registers into it.
  - Registration is never blocked: a full division is picked on the same form, and the club
    submits one registration with one invoice covering the teams that are playing.

- **Payment double-write closed (Sep 29)** — four Stripe write paths each did findFirst-then-create;
  two interleaved on Sep 18 and left LaxManiax a duplicate credit. `src/lib/paymentGuard.ts` now owns
  the write (`recordTeamPayment()`, returns false when the row already existed so the alert isn't sent
  twice) behind a **partial unique index** on `stripeIntentId` (`WHERE "stripeIntentId" <> ''`, so
  check/cash rows don't collide). `/api/payments/audit` checks Stripe→DB, the direction the old
  reconcile never did. Monster Mash (9 payments, $26,755) and Fall Classic (4, $8,970) both reconcile
  exactly against Stripe as of Sep 29.

- **Staff portal + self-signup + ID cards (Sep 4)** — the staff-side experience Bo asked for:
  - `/api/staff-portal` + "My events" on `/dashboard/staff` (aliased to `/dashboard/ref`): staff
    sign themselves up for upcoming org events (creates the SAME RosterEntry the Staff Roster and
    Assigner read — self-signup IS roster membership; leaving is blocked once games are assigned).
    Game-day tools are role-filtered via the TOOLS map (setup checklist = field_ops only).
  - `/join` rebuilt to Bo's approved mockup: benefits strip, event checkboxes (self-signup at
    signup), optional headshot (client-compressed ≤512px data URL → Worker.photoUrl), welcome
    done-page, and a welcome email sent AS the org (orgSender). GET /api/join returns upcoming
    events; POST takes tournamentIds + photo.
  - **Printable staff ID card** at `/dashboard/staff/id-card` ("Credential" layout, role-themed:
    teal ref / amber scorekeeper / rose trainer / slate field ops): true CR80 print size via
    print-CSS visibility trick, photo/initials, cert line, working events, staff ID
    ({ORG}-{year}-{last4 of worker id}), QR → PUBLIC `/verify/[workerId]` (+ `/api/verify-staff`)
    exposing ONLY name/roles/org. `/verify` added to PUBLIC_ROUTES. New dep: `qrcode`
    (client-side dynamic import).
  - Design mockups live on the Claude artifact "Staff Signup + ID Card" (canvas with the three
    card directions; Bo approved Credential + per-role theming).

## Earlier state (as of Aug 28, 2026)

- **Ref recruiting link + duplicate merge (Aug 28)** — Staff Pool "Recruiting link" button copies a
  shareable signup URL (`/join?org=&code=`); the secret code lives in AppSetting `joinCode:{orgId}`
  (rotate via POST `/api/workers/recruit-link` `{regenerate:true}` — kills previously shared links).
  `/join` + `/api/join` (code-gated + honeypot) create Worker + STAFF login in one shot — the old
  join flow minted PARENT accounts (Jul bot-hardening role allowlist) and never linked records; now
  a signup email already in the org's pool LINKS to that Worker (fills only empty fields).
  Duplicates: the pool shows an amber "possible duplicates" chip (same email / phone / normalized
  name; "different people" dismissals persist in AppSetting `workerDupeDismissed:{orgId}`) with a
  side-by-side panel — `/api/workers/merge` repoints roster/availability/assignments/time/pay to the
  kept record (dropping unique-constraint collisions), unions roles, fills gaps, deletes the loser.
  SECURITY: POST `/api/workers` and all of `/api/workers/[id]` are now requireStaff-gated (they were
  fully public — anyone could read pay handles or edit/delete workers).


- **Staff Pool → app-login onboarding (Aug 27)** — the pool now shows whether each Worker has
  actually registered in the app. Worker ↔ User are matched by EMAIL (no FK); `/api/workers` GET
  merges `appStatus` per row: registered / invited / none / no_email (+ `appRole`, `invitedAt`).
  - **Claim invites for EXISTING pool members**: `/api/workers/onboard` (requireStaff-gated) creates
    a StaffInvite carrying a raw `workerId` column (guarded ALTER), 30-day expiry, and REUSES a
    pending token so previously sent links stay valid. `mode:'send'` emails via SendGrid (platform
    sender); `mode:'link'` just returns the URL — the pool's "Copy link" for texting staff with no
    email on file.
  - Accepting at `/invite/[token]`: claim invites are handled 100% in raw SQL and LINK the existing
    Worker (no duplicate) — prefilled name/roles, staff just set a password (+ email when none was
    on file; it's saved back to the Worker so status matching works). Plain invites (no workerId)
    keep the original create-new-Worker flow.
  - **Root cause found:** the StaffInvite TABLE has existed since Jun 2026, but the model was never
    in schema.prisma — so `prisma.staffInvite` was undefined at runtime and EVERY invite accept
    500'd. That's why no staff (or org-user) invite was ever completed. Model added to the schema
    (compile-time fix only; no DB migration needed).
  - Staff Pool UI: App column (status badges + Invite / Resend / Copy link), App filter,
    registered/invited counts by the search bar, bulk "Send app invites" on selection (client sends
    chunks of 15 to stay under serverless timeouts). Remember: SendGrid fails silently — verify a
    real send in the Activity feed after deploying.


- **Grants & county paperwork toolkit (LIVE-pending-push, Aug 4)** — built for the annual city
  sports-tourism grants (Play Treasure Coast etc.) and venue permits:
  - **Travel & hotels** (`/tournaments/[id]/travel`, nav People → Travel & hotels): room-night tracking.
    Register form asks hotel/rooms/nights when a club needs rooms; stored as RAW TeamRegistration columns
    (`hotelName`/`hotelRooms`/`hotelNights` — like `instagramHandle`, deliberately NOT in schema.prisma;
    guarded ALTERs in the registrations routes; GET merges them in). Staff page has inline edits via a
    `{travel:true}` PATCH branch (staff-gated, never touches the team list), totals + room-nights-by-hotel
    (the grant post-event report table).
  - **Exhibit A generator** (`/tournaments/[id]/roster/exhibit-a`, button on Staff Roster): fills the county
    "ISA Background Check Results" affidavit table from the roster. `Worker.bgCheckDate` raw column (set via
    workers [id] PATCH); flags missing/>12-month-stale screenings; print-ready.
  - Grant/venue facts (FEIN, PTC contacts/deadlines, Martin County permit specs) live in the agent's private
    memory, NOT this public repo.

- **Public game pages + live ticker (Aug 4)** — Regystra-inspired game-day presentation:
  - `/tournaments/[id]/public/games/[gameId]` (public via existing middleware regex): shareable per-game
    page — crests + big score, Live (polls live-scores, period label) / Final / Upcoming badge, meta chips,
    share + .ics. Schedule cards' game-number chips link to it.
  - `src/components/LiveTicker.tsx` on `/public`: horizontal strip of live games (pulsing) + recent finals,
    linking to game pages; hidden when empty. Next tier (per Regystra analysis): scorekeeper EVENT logging
    (goal/assist/penalty + jersey #) → box scores, timelines, player leaderboards; then team/venue pages.

- **Club database / returning teams (Aug 11)** — org Admin → Club database (`/dashboard/org/clubs`): every club
  that has registered, deduped across name variants + shared emails, with per-event/year history (teams brought,
  \$ paid, divisions) + returning/win-back flags; search/filter, expandable record, one-click "draft win-back
  email" (mailto with the club's history). **Import** parses Cognito-style exports (first sheet = club-level,
  `TeamInformation` sheet = per-team divisions) fully IN-BROWSER via SheetJS (cdnjs) and rebuilds — repeatable each
  season. Stored per-org in AppSetting `orgClubs:{orgId}`; API `/api/org-clubs` (admin/director write, coach/parent
  get []). Seed data: 14 Cognito exports (MonsterMash/FallClassic/SummerKickOff/JingleBrawl 2022-26) → 484 regs,
  1154 teams, 127 clubs; master workbook also in session outputs.

## Earlier state (as of Jul 23, 2026)

- **sunshineeventsgroup.com = Sunshine's public domain (LIVE Jul 23)** — hosted directly on the
  whistle-ready Vercel project (NOT a forward). How it works:
  - `ORG_DOMAINS` in `src/lib/orgDomains.ts` maps the host → org slug; middleware rewrites root
    paths to `/o/{slug}/*`, so `/`, `/gallery`, `/register/vendor` and info pages serve at the root.
    `/tournaments/*` passes through. `/register` passthrough is EXACT-match only (org register
    pages must rewrite).
  - `LEGACY_REDIRECTS` (same file) 301s the old WordPress slugs (monster-mash-lax-clash, rules,
    vendors, register-teams, …) to their new homes; junk-prefix 301s clean up SportsPress demo
    URLs. **Event-slug targets hardcode the CURRENT season's tournament ids — update annually.**
  - Canonicals/sitemap/JSON-LD emit the custom domain for mapped orgs (`orgAbs`/`tournamentAbs`
    in `src/lib/seo.ts`) so search credit accrues to the org's domain, not whistleready.app.
  - Vercel: apex = Production, www = 308 → apex. **DNS moved to GoDaddy (Aug 4 2026)** — registrar
    GoDaddy now also hosts the zone (ns21/ns22.domaincontrol.com) after Hostinger twice reset the zone
    to its own CDN (old WP showed). Full zone recreated at GoDaddy: A @ 76.76.21.21, www CNAME
    cname.vercel-dns.com, MX mx1/mx2.hostinger.com (5/10), SPF, google-site-verification TXT, DKIM
    CNAMEs (SendGrid s1/s2 + em784, Hostinger a/b/c, mlsend litesrv), autodiscover/autoconfig.
    _dmarc = GoDaddy default p=quarantine (was p=none; fine — all DKIM aligned). Hostinger's zone
    still exists but is inert. Hostinger can no longer break the site.
  - sunshinelax.com = GoDaddy **301** forward → sunshineeventsgroup.com (was 302 → whistleready).
  - GSC: domain property verified (TXT in Hostinger DNS), sitemap submitted.
  - Old WordPress site: intact on Hostinger hosting (cancel later); browsable reference at
    web.archive.org (May 2026 snapshot).

## Earlier state (as of Jun 18, 2026)

- **Public event page builder (LIVE)** — each tournament has a public **event page** (`/tournaments/[id]/event`)
  rendered from an ordered **block list**, edited at **Setup → Event page → Page builder**
  (`src/components/BlockBuilder.tsx`). Architecture:
  - Content lives in AppSetting `tournamentSite:{id}` (via `api/tournaments/[id]/site`). The block model is
    `src/lib/eventBlocks.ts`: `resolveBlocks(c)` returns an ordered `Block[]` (`{id,type,hidden?,props}`),
    migrating from the older `sectionOrder`/`hiddenSections`. **Built-in** types (overview, fees, locations,
    hotels, rules, contacts, sponsors) are singletons whose content comes from dedicated fields; **custom**
    types (`custom`, `cta`, `faq`, `countdown`) are repeatable with content in `props`. `src/lib/eventSections.ts`
    holds labels/default order.
  - Builder: drag/▲▼ reorder, eye = show/hide, custom blocks add/duplicate/delete + inline edit. `faq` is a
    generic **Collapsible sections** block (Heading/Content, content is rich-text Markdown via `MarkdownField`;
    renders with `FaqBlock`). `countdown` = `CountdownBlock` (live timer to start date).
  - **Per-block display mode** (`props.display` = `inline` | `page`) on custom/faq: `inline` renders in the page
    body; `page` keeps it OFF the body and gives it its own page at `/tournaments/[id]/p/[blockId]` linked from
    the **Event info** dropdown (`EventInfoNav`). The built-in **Rules** has its own page at `/tournaments/[id]/rules`.
  - **Shared chrome**: `src/app/tournaments/[id]/_eventChrome.tsx` (used via `layout.tsx` on register / player-waiver /
    vendor-request / rules / p) wraps those pages in the org site header + the same event hero (logo, dates,
    action buttons, Event info dropdown). Public routes are allow-listed in `middleware.ts` and rendered light by
    `ThemeShell` (regex includes `event|rules|p|register|player-register|player-waiver|vendor-request`).
  - **AI drafting**: `api/ai/generate` (Anthropic SDK, reuses `ANTHROPIC_API_KEY` like `api/chat`,
    model `claude-haiku-4-5-20251001`, staff-only) + `src/components/AiGenerateButton.tsx` — "Generate with AI"
    on Overview / Hotels / Rules and on custom + collapsible content fields.
  - Divisions on the event page read **live** from `registrationDivisions` (Setup → Divisions), not a typed copy.
  - Gotcha: hero/panels use `overflow-hidden` for rounded corners, which clips absolutely-positioned dropdowns —
    render such menus inline (see EventInfoNav fix / Add-block menu).

## Earlier state (as of Jun 16, 2026)
Core flow: tournaments → divisions → pools → pool games → brackets → scheduler → assigner →
scores → public. Highlights shipped to live:

- **Jun 15-16 batch (all LIVE on master; bracket work tagged `stable-2026-06-15-bracket-fixes`):**
  - **New Tournament form** (`src/app/page.tsx`): number-of-fields (auto-creates Field 1–N venue),
    daily start/end times (→ venues `defaultAvailability`), team registration fee (any amount,
    `step=any`; pre-filled $1,495), logo upload, **registration mode** (built-in vs CSV import — hides
    fee + routes to importer when importing), canonical lacrosse divisions **none preselected**, and a
    "change later in Settings" note. Fields are written as objects `{id,name,abbr}` (not strings) so
    the Setup Venues editor renders them.
  - **Setup wizard `builder/page.tsx`**: "Schedule rules" renamed **"Game Timing & Format"**; added
    **period format** (halves/quarters/periods/running) + **time between periods**, saved to
    `scoringConfig` (rules route) and shown on the live scorer.
  - **Scheduler**: fixed `makeSlots` (was resetting minutes each hour → overlapping rows); **Day
    start/Day end** now load from saved daily times and **persist** (and field-save no longer wipes
    them). Added a **Game Scheduler link** card on the Divisions sidebar.
  - **Org self-serve**: owner "Your team" page (`/dashboard/org`), org-scoped invites
    (`/api/org/users`), director first-run welcome. `/api/tournaments` no-org fallback tightened to
    `[]` (users with no org see nothing — so assign Sunshine staff + Bill to their orgs).
  - **Divisions page**: per-division **delete a team** (Teams tab; also clears it from pools + deletes
    the now-empty registration); sidebar shows **pool vs bracket** game counts; **Smart Defaults** got
    an editable Game-guarantee field + **Save as global default** checkbox (`/api/smart-defaults-default`).
  - **Bracket fixes** (`bracket/route.ts` + `BracketBuilder.tsx` + public): consolation auto-pairing
    no longer creates rematches (don't pair L-Bx vs L-By when one game's winner feeds the other —
    validated 4-16 teams); **inline ✎ edit** of consolation matchups; **de-conflated** "2-game
    guarantee" (loser-fed, any count) vs **"Both-ways consolation"** (the 8/16 mirror); the both-ways
    **mirror only renders when the bracket has a "Consolation Championship" game** (builder + public)
    so loser-fed/odd-count brackets show the clean standard layout instead of garbling.
  - Misc: removed Payroll from People dropdown; collapsible tournament header (shows logo when
    minimized, persisted); Schedulers added to Settings → Broadcast permissions; broadcast-roles save
    now allows `admin` (not just `director`); dark-mode fix for rose/red/pink-50 tints (division rows).
  - **Imports**: bulk import no longer requires contact email/phone (`source:'import'`); import UI
    genericized ("Import teams from a spreadsheet"; TourneyMachine as one example); Registrations page
    "Import" button now links to the import wizard.

- **Dashboard redesign (LIVE, Jun 14 — tag `stable-2026-06-14-dashboard-scheduler`)**: the tournament
  dashboard + header were de-cluttered. `TournamentNav` now groups everything into click-open
  dropdowns (mobile-friendly, close on outside-click/route change): **Dashboard · Setup
  (tournament setup/divisions/scheduler/assigner) · People (team regs/player rosters/staff
  roster/payroll) · Game Day (scores/assignments/ops/incidents/checklist/staff contacts/staff
  view/broadcast) · Financials · Settings** + persistent Register/Public buttons. The dashboard
  **body** (`dashboard/page.tsx`) was slimmed to: an **At a glance** KPI row (teams/games/assigned
  %/collected %), a **Game Day console** (live-tool cards, "Live now" badge when event date is
  today), an expandable **Registered teams** section (tap a division → lists its teams, fetched from
  `/api/registrations?tournamentId=`), and ONE compact **Money** snapshot linking to full
  Financials. The old 6-hub Admin grid + duplicated P&L/registration-financials sections were
  removed (nav covers them). Gotcha fixed: the tab bar must NOT use `overflow-x-auto` (clips the
  dropdowns) — use `flex-wrap`.
- **Scheduler role (LIVE, same tag)**: a schedule-builder role, peer to Assigner. In
  `role-permissions.json` it has broad access (dashboard, schedule, divisions, roster, availability,
  assignments, registrations, player rosters, settings, scores, staff pool) with **pay summary,
  financials, and time entries OFF**. Wired everywhere a role is referenced: middleware `ROLE_HOME`,
  login redirect, admin **Users** dropdown, admin **Permissions** matrix column, NavBar
  labels/colors + "View as" preview list, and a new role-home at `/dashboard/scheduler`
  (Schedule/Divisions/Manage/Ops cards). Role is a plain string (no enum/migration) — assign via
  admin Users. Fine-tune the rest on the Perms page.
- **On-field workers = the Staff role (convention)**: refs, field ops, scorekeepers, and trainers
  all log in as **Staff**; their specific job comes from Assigner assignments + per-game permissions
  (the **`game_scorekeeper`** "Scorekeeper (Live Game)" feature opens `/tournaments/[id]/games/[gameId]/scorekeeper`).
  There is deliberately NO separate Scorekeeper/Ref/Trainer account role or Perms column. Legacy
  `ref`/`scorekeeper`/`viewer` role values are remapped to `staff` in middleware.
- **Dark-mode polish**: zebra-striped tables using translucent `bg-*-50/50` rows were missed by the
  `gd-dark` overrides (only the un-suffixed `bg-*-50` was handled), leaving a muddy light band. Added
  `body.gd-dark [class*="bg-gray-50/"], [class*="bg-slate-50/"] { background:rgba(255,255,255,0.03) }`.

- **Divisions page** — tabs are **Teams & Pools / Games / Bracket**. Pools are merged into the
  Teams tab (inline pools bar: chips w/ live counts, add, delete, unassigned badge). A **List
  view / Assign Pools** toggle: "Assign Pools" opens a clean side-by-side **pool-column** view
  with drag-to-reassign + an **Auto-assign teams** button (the standalone assign-pools page was
  retired). The **Games** tab lists pool games (P#) AND bracket games (B#) with date/time/field
  (`pool-games?scope=bracket`). Team rows show team logo/initial badge.
- **Smart Defaults** (per tournament, localStorage): per team-count plan — games/team, pools,
  bracket format, advance, consolation. One-click **generate-all** (pools + pool games + brackets,
  with an "Include brackets" toggle).
- **Brackets — Stage 1 generator**: handles odd/in-between counts with byes + real consolation.
  Owes rule (guarantee − pool games): owes≤1 → top-N advance + seed-paired consolation (7v8, 9v10);
  owes≥2 → everyone-in + loser-fed consolation + "if needed". Full spec in `BRACKETS.md`.
- **Brackets — Stage 2 flighting**: a division can split into **Flight A / B** brackets, each with
  its own champion. `Bracket` has `flight` (default "A") + `numberOffset` (default 0) — every
  existing bracket = Flight A / offset 0, fully backward compatible. Bracket API **GET returns an
  array of flights**; POST has a **split** action (cutoff on the seed list → Flight A seeds 1..N +
  Flight B rest, continuous B# numbering via numberOffset); PATCH/DELETE scoped per flight
  (`?flight=A|B`). BracketBuilder has a "Split into flights" panel + a Flight A/B switcher. Migration
  = `/admin` "Migrate: Flights" (already run on Turso). Data model supports >2 flights (B2) already.
- **Bracket redesign (CFP "rail" style)** on the builder preview and the scoring `/bracket` page:
  each team on its own bar with a teal seed chip, team logo, and name; amber for byes/champion;
  feeder-graph layout drives straight right-angle connectors (byes offset to pair with their feeder).
- **Public bracket = light rail** (matches the builder, kept light for spectators): each team on its own
  bar with a seed chip, logo, scores and a date/time/field caption; feeder-graph layout fixed the old
  bye overlap; **orange seed chips** mark bye teams and bye games are offset so the winner-feeder lines
  up with its feeder; champion caps sit ABOVE the finals; a **Zoom** control shrinks it to fit.
- **Consolation (both-ways) tournament bracket** — the format formerly "2-Game Guarantee" is now
  **"Consolation (both-ways)"** (builder picker + Smart Defaults + template catalog). When chosen it
  renders as a MIRROR: round-1 down the centre, winners flow RIGHT to the **Champion**, first-round
  losers drop LEFT through a consolation bracket to the **Consolation Champion** (two champions). On the
  public view and the builder Preview (dark); the 3rd-place game shows as a separate "Placement" card;
  champion caps above their finals + zoom; the builder mirror supports per-game × delete + "+ Add game".
  Opt-in — only the 2gg format renders the mirror, everything else is unchanged. Detection ignores
  bracket placeholder names (Seed/W-B), which repeat across divisions.
- **Logos/crests**: `RegisteredTeam.logoUrl` (uploaded + client-compressed ≤512px on the Divisions
  Edit-Team and Registrations forms); `/teams` returns logoUrl; `team-logos` endpoint feeds crests
  on brackets and public pages.
- **Public page** (`/public`): division tiles, **standings** (W/L/GA/GF/GD/Last-3, division dropdown,
  advances-to-bracket cutoff, tiebreaker-aware sort), redesigned **schedule** (grouped-by-date cards,
  filters, by-time/by-field, up-next + .ics), and a full **SVG bracket tree** (multi-flight aware via
  numberOffset). The old `/results` page was deleted and consolidated into `/public`.
- **Configurable tiebreakers**: schema + `tiebreaker-default` endpoint (AppSetting `defaultTiebreakers`)
  + two-section Settings editor with save-as-default; `/public` standings read tournament tiebreakers.
  Spec in `TIEBREAKERS.md`.
- **Scores / scorekeeping**: `/scores` page (director/assigner) with role badge + scored/total;
  `/games/[gameId]/scorekeeper` view; `role-permissions.json` wired `tournament_scores` +
  `game_scorekeeper` (fixed scorekeeper role that had all perms false).
- **Staff hub + core workspace** already on the design standard: Financials, Roster, Availability,
  Time Entries, Pay Summary, Registrations, Settings, Scheduler, Assigner (drag staff to role-slots,
  per-game ref counts, lock-editing toggle, staffing-requirements panel), Scores, Assignments, Results.

- **Staff game-day app (LIVE, Jun 14 — tag `stable-2026-06-14-staff-ops`)**: the prototype staff
  features ported into the real app and merged to production from branch `staff-ops-messaging`. All
  AppSetting-backed (no schema migration), staff-only (external roles = coach/parent/club_director
  excluded via `isStaff`), mobile-first, slate/teal standard.
  - **Ops board** (`/tournaments/[id]/ops`, api `ops-messages`): ANY staff can send quick game-day
    messages ("ball to Field 5", "trainer to Field 7") with a field input + templates + group target
    (all/fieldops/medical/refs/scorekeepers/assigners); live feed polls ~15s; delete (director any,
    others own). Delivery is in-app for now (SMS later).
  - **Role home dashboards** rebuilt to standard: `/dashboard/director` and `/dashboard/assigner` —
    per-tournament cards with quick actions (Manage/Scores/Ops/Broadcast + public link; Schedule/
    Assign/Avail/Ops).
  - **Staff directory** (`/tournaments/[id]/directory`, reads `roster`): searchable, role-grouped,
    tap-to-call (`tel:`) / tap-to-text (`sms:`).
  - **Incidents** (`/tournaments/[id]/incidents`, api `incidents`): log medical/safety/facility/
    weather/other w/ severity + field; Open vs Resolved lists; resolve/delete.
  - **Setup checklist** (`/tournaments/[id]/checklist`, api `checklists`): a SINGLE SHARED
    tournament-setup list (not per-field) — any staff can check items off and ADD/REMOVE their own;
    GET returns stored items or seeded defaults, **PUT replaces the whole list** and stamps
    done-by/done-at for items that just flipped done; 100-item cap. Linked from the dashboard
    "Field Ops" hub as "Setup checklist".
  - **Sandbox badge** (`src/app/EnvBadge.tsx`, in `layout.tsx`): amber "SANDBOX PREVIEW" pill bottom-
    right on previews/local; auto-hides on production (`whistleready.app` / `www.` /
    `whistle-ready.vercel.app`, or `NEXT_PUBLIC_VERCEL_ENV==='production'`) so a test copy is
    never mistaken for live.

- **Scheduler — Auto-fill (assists the drag-and-drop)**: a teal **Auto-fill** button + a pure, tested
  engine in `src/lib/autoSchedule.ts`. Places parking-lot games (after your filters) onto the grid by
  the rules: no team/field double-book, bracket games after their feeders, max 3/team/day, **spread a
  division across fields** (parallel play + rest) while keeping each team on consistent fields, and
  **one-on-one-off** rest spacing (~2 slots; penalise back-to-back). A **day-split** dropdown by the Auto-fill
  button chooses how days are assigned: **Pool d1 / bracket d2** (default, unchanged), **Pool all days /
  bracket last** (overflow-spreads pool across days, brackets last day), or **All on this day**. The engine
  (`autoSchedule.ts`) is untouched — only day-assignment orchestration (`autoFillDay` via a `fillAcross`
  helper) changed. The Game-Type filter still lets you run pool/bracket separately. A **grid Zoom** shows more games.
  Placeholder names (Seed/W-B/L-B/TBD) are NOT real teams (`isRealTeam`) — they repeat across divisions;
  the scheduler's conflict checker uses the same filter. Refs/scorekeepers are scheduled LATER on the Assigner.
- **Scheduling memory**: `SCHEDULING-PATTERNS.md` records patterns learned from real manually-scheduled
  tournaments (CSV exports or TourneyMachine public links — any sport, rendered via Claude-in-Chrome and
  parsed). A Jun-12 batch crunch (8 events, 4 sports — lacrosse/volleyball/baseball/basketball — across
  TourneyMachine, AES and Summer Faceoff) **validated** the lacrosse weights (rest target 2 slots,
  spread-across-fields, max 3/day) and showed slot-length / games-per-day / rest-tolerance are
  **sport-specific**, and day-split varies even within lacrosse. Next work is structural (day-split as a
  choice = #1), not re-weighting. Full table + takeaways in `SCHEDULING-PATTERNS.md`.

## Open / next
- **Forms library (in progress on `org-forms-library`)**: org Admin → Forms = reusable **templates**;
  each tournament gets a working copy. Three planned: **Player Waivers** (built — editable waiver text +
  optional fields + confirmation + email; public per-tournament form at `/tournaments/[id]/player-waiver`
  with team dropdown from that tournament's registrations + a public-page button; staff entries list at
  `/tournaments/[id]/player-waivers`), **Team Registration**, **Vendor Request**. Submissions stored in
  AppSetting `orgFormSubmissions:{orgId}` tagged with tournamentId.
- **Post-submission email = invite to create a player profile (REMEMBER — requested Jun 17)**: Jotform emails
  registrants a formatted PDF receipt of their entry. We need to (a) email a receipt of the submitted details,
  and (b) **craft an invite letter prompting them to log into the app to create a Player Profile and more**.
  Ties to the future **player profiles + individual registration (with payment)** work — do that letter when
  player profiles exist. Current waiver email is plain confirmation text only.
- **Help & support (NEW — requested Jun 16)**: add a persistent **help icon** in the app chrome
  (likely in `TournamentNav`) that opens **support documentation** (in-app help center / docs), plus
  **some form of chat** (live support or an assistant chatbot). Scope TBD — could start with a docs
  drawer + a contact/chat widget and grow into in-product help. Note there is already a `ChatWidget`
  component in `tournaments/[id]` to build on or reconcile with.
- **Staff app — Phase 3**: two-way team/coach messaging (in-app + email). **Phase 4**: SMS/Twilio
  delivery for ops messages + push/PWA. (Done & live: ops board, role dashboards, staff directory,
  incidents, setup checklist, sandbox badge — see "Staff game-day app" above.)
- **Consistency pass — remaining pages**: Staff view, Returning teams. (Done: the full Staff hub,
  Registrations, Settings, Scheduler, Assigner, Divisions, Scores, Assignments, Results, Public.)
- **Scheduler auto-fill — next layers** (calibrate from `SCHEDULING-PATTERNS.md` as more examples land):
  make the day-split a CHOICE (pool/bracket-by-day vs pool-across-all-days — it varies); game-duration /
  slot-length per division; field designations (which divisions/formats a field allows, e.g. 7v7 fields)
  honoured in auto-fill; identify a team by **division+name** (club names repeat across divisions); then
  ref/scorekeeper auto-assignment on the Assigner.
- **Double-elim / 3rd flight (B2)**: data model already supports >2 flights via the `flight` column.

## Known cruft / cleanup
- The admin **Perms** page saves to AppSetting `role_permissions`, but middleware, `requireFeature` and
  the nav read the bundled `role-permissions.json` only, so saved toggles change nothing, and once a row
  is saved the page stops showing features added to the JSON later (found Oct 4 while adding `tasks`).
- `next.config.js` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`; ~40 pre-existing
  TS errors exist (e.g. Prisma model types not in schema) and are non-blocking.
- Some per-user settings (Assigner lock, games-per-ref, Divisions Smart-Defaults plan) persist in
  localStorage per tournament, not the DB.

## Build philosophy
- Diagnose before changing; verify after.
- Preview visual changes before deploying — keep Bo in the loop with a preview.
- Prefer shared components and conventions so the codebase stays consistent over time.
- Be careful with secrets and with irreversible actions (deletes, pushes, payments).
