# GameDay — Go-Live Build Plan

_Sequencing the validated prototype (`staff-app-prototype.html`) into the live app._
_Owner: Bo · Drafted Jun 13, 2026 · Status: proposed_

This plan turns the things we prototyped — public branding + My Teams, broadcasts, and
two-way team/director messaging — into shippable increments. It is written to match the
repo's existing conventions: branch → Vercel preview → merge to `master` via GitHub Desktop,
in-app DB migrations, `role-permissions.json` for RBAC, lucide-only icons, slate/teal design.

---

## 1. Reuse — what's already in the app (don't rebuild)

The schema and routes already carry a surprising amount of the foundation:

- **Favorites / following** — `UserTeamFollow`, `UserTournamentFollow` models + `api/parent/follows`
  route + use in `dashboard/parent/page.tsx`. This is the "My Teams" backend for logged-in users.
- **Coach / club / parent identity** — `CoachProfile`, `ClubDirectorLink`, `ParentPlayerLink`
  models + `api/coach/profile`, `api/club-director/*`, `api/parent/follows`. The recipient
  identity model for messaging largely exists.
- **Teams & clubs (recipients)** — `TeamRegistration` (a club), `RegisteredTeam` (a team, has
  `logoUrl`), `PlayerRegistration`. Contacts for coaches/directors live here.
- **Email send** — `resend` (^6.12.4) is already a dependency. Email channel needs only an API key.
- **Branding assets** — `RegisteredTeam.logoUrl`, the `upload` route, org logos (`api/org`).
- **Public is reachable with no login** — middleware already whitelists `/tournaments/[id]/public`.
- **Settings store** — `AppSetting` (key/value) already used for `defaultTiebreakers`; good home for
  Info-page content and broadcast/message config without new tables.
- **AI assistant** — `api/chat` is Anthropic Haiku (NOT person-to-person). Messaging is net-new.

## 2. Net-new — what we have to build

- `Announcement` model + routes (broadcast).
- `MessageThread` + `Message` models + routes (two-way DM).
- Audience-resolution helper (division / team / club / coaches / staff → recipient list).
- In-app inbox UI (staff side) + public announcement banner (real data).
- External send plumbing: **email** (Resend key), then **SMS** (Twilio — new account/number/budget),
  then **web push / PWA** (VAPID keys).
- Anonymous "My Teams" for logged-out spectators (localStorage), optionally synced to
  `UserTeamFollow` when signed in.

---

## 3. Guiding principles

- Ship the **lowest-risk, highest-visibility** slice first; keep paid/3rd-party work last.
- Every channel feeds **one thread record** — channel is a delivery detail, not a separate inbox.
- **In-app first** for both broadcast and messaging — it needs no external account, so we can
  ship and dogfood before paying for SMS.
- New API routes get an entry in `role-permissions.json`; public reads stay outside auth.
- DB changes ship as an **in-app migrate route** (`/api/admin/migrate-*`), per existing pattern.
- Verify (`tsc` on touched files / esbuild) and preview before every merge.

---

## 4. Phases

### Phase 0 — Land what's already built (½ day, no new code)
Merge the existing branches after a preview review:
- login redesign, staff dark mode + toggle, ref/scorekeeper mobile dashboard.
Risk: low. Output: the staff app already looks like the prototype.

### Phase 1 — Public polish (Tier 1: frontend + light data, NO new accounts)
The visible wins, all on `/tournaments/[id]/public`:
- **1a. Branding hierarchy** — org (Sunshine Events Group) + tournament + "Powered by Gameday
  Blueprint" header/footer, using stored logo URLs. Pure UI.
- **1b. Lucide consistency** — replace any remaining emoji on public + staff with lucide
  (already the standard). Pure UI.
- **1c. My Teams / favorites** — star a team; "My Teams" tab. Anonymous via localStorage (no login);
  if signed in, sync to `UserTeamFollow`. Mostly UI + reuse of the follows route.
- **1d. Team → games linking** — tap a team name → its games/record. Reads existing games data.
- **1e. Info page** — Lost & Found, medical tents, parking, etc. Content stored in `AppSetting`
  (JSON), editable in Settings. One small read route + a Settings editor.
Risk: low. Dependencies: none external. This is the recommended first ship.

### Phase 2 — Announcements + Broadcast (in-app only)
- **Model:** `Announcement { id, tournamentId, scope (json: type+divisions/team/club/staffGroup),
  text, urgent, createdBy, createdAt }`. Migrate via in-app route.
- **Routes:** `POST/GET /api/tournaments/[id]/announcements` (POST gated to director/assigner via
  `role-permissions.json`; GET public for display).
- **UI:** the broadcast composer (built in prototype) on the Director home; the public banner reads
  real announcements. Audience targeting resolves against divisions/teams/clubs/staff.
- **Channel:** in-app display only — no external infra yet, so this ships immediately.
Risk: low–medium (first new table + RBAC). Dependencies: none external.

### Phase 3 — Direct messaging (two-way): in-app + email
- **Models:** `MessageThread { id, tournamentId, recipientType (team|club), recipientKey,
  channel, lastAt }` + `Message { id, threadId, fromRole, body, channel, direction (out|in), createdAt }`.
- **Routes:** `POST /api/tournaments/[id]/threads` (start), `POST /threads/[tid]/messages` (send),
  `GET /threads*` (inbox). Recipient contacts resolved from `TeamRegistration`/`RegisteredTeam`
  (coach) and `ClubDirectorLink`/club contact (director).
- **UI:** the Message screen + Conversations inbox (built in prototype), plus an inbox entry point.
- **Channels:** **in-app** (native thread) + **email** via Resend (key needed). Inbound email
  replies route back into the thread (Resend inbound or a dedicated mailbox + webhook).
- **Initiation rule:** staff always start the thread; coaches can only reply. Enforced server-side.
Risk: medium. Dependencies: Resend API key; inbound-email decision.

### Phase 4 — External channels (needs your accounts + budget)
- **SMS (Twilio-style):** a tournament number; outbound send + inbound webhook → thread. Coaches
  text back from any phone, no app needed. Cost: ~$1–2/mo per number + ~$0.008/SMS.
- **Web push / PWA:** installable app + push notifications (VAPID keys; service worker). Lets
  in-app messaging actually notify.
Risk: medium. Dependencies: Twilio account + number + budget; push key generation.

---

## 5. Decisions needed from you (these gate the later phases)

1. **Favorites:** anonymous (localStorage) only, or also sync to a `UserTeamFollow` when a
   spectator makes an account? (Recommend: anonymous now, optional sync later.)
2. **Messaging v1 channels:** in-app only to start, or in-app + email from day one?
3. **SMS:** do we want it for v1? If yes, that's a Twilio account + number + a per-message budget.
4. **Do coaches/club directors get logins** (the `CoachProfile`/`ClubDirectorLink` models suggest
   yes) or stay fully external (email/SMS only)? Changes how "in-app" replies work for them.
5. **Info/Rules content:** who edits it and where (Settings editor → `AppSetting` is the cheap path).

## 6. Suggested order

Phase 0 (land branches) → Phase 1 (public polish, ship this week) → Phase 2 (in-app broadcast) →
Phase 3 (messaging in-app + email) → Phase 4 (SMS / push when budget is set).

Phases 0–2 need **nothing external** and deliver most of the visible value. Phases 3–4 are where
your account/budget decisions come in.

## 7. Risks / gotchas (from CLAUDE.md)

- **git index corruption** on the Windows working copy — prefer single-file commits; rebuild index
  if it corrupts; commit multi-file changes through GitHub Desktop.
- **Editor tool can truncate files** in the working copy — write/patch via shell, verify with
  `wc -l` + esbuild after.
- **In-app migrations** — new tables go live via an `/api/admin/migrate-*` route, not `prisma migrate`.
- **RBAC** — every new write route needs a `role-permissions.json` entry; keep public reads open.
- **Pre-existing ~40 TS errors** are non-blocking (`ignoreBuildErrors`), but don't add new ones.
