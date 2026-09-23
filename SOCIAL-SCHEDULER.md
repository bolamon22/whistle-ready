# Social scheduler — spec

Native Instagram/Facebook post scheduling + auto-publish + analytics for an org's
own accounts, built into Whistle Ready. Built for Sunshine Events Group first; the
same module is meant to be **copied** into other apps for the apparel brands later
(Business OS / Imprint Dynasty) — separate app, separate database, separate Meta
app registration, no shared service between them. Not a standalone third app.

Replaces the idea of using PromoRepublic (owned as an unused lifetime deal) —
PromoRepublic has no public API, so there's no way to drive it from code; building
around it would mean re-entering every post by hand in two places. Not worth it.

## Why this doesn't need Meta App Review

Meta requires **App Review + Business Verification** only for apps that publish on
behalf of accounts they don't own ("tech providers" — this is what Buffer/Later/
PromoRepublic went through). An app that only touches accounts owned by the same
business as the app itself stays under **Standard Access**, which explicitly does
not require review. Practically: add the org's own Facebook/Instagram account as a
**Tester** on the Meta Developer app (below), and it can publish immediately in
development mode. This holds true across every brand this gets duplicated to — it's
about who owns the account relative to the app, not how many accounts/brands there
are, as long as each instance only ever touches accounts its own business controls.

## Data model (`prisma/schema.prisma`)

- **SocialAccount** — one connected Page or Instagram Business account per row.
  `accessToken` is AES-256-GCM encrypted at rest (`src/lib/encrypt.ts`, same as
  other stored secrets in this codebase). `platform` is `"instagram"` or
  `"facebook"`; an IG account's `pageId` points at the Facebook Page backing it,
  because Instagram publishing routes through that Page's access token.
- **ScheduledPost** — one post. `status` moves `draft → scheduled → publishing →
  published | failed` (or `canceled` before it publishes). **`draft → scheduled`
  only happens via an explicit approve action, gated to director/admin** — Bo
  reviews everything before it can go out; that's enforced in the API
  (`api/social/posts/[id]` PATCH), not just left to the UI.
- **PostInsightSnapshot** — a metrics snapshot per published post per insights-cron
  run. Meta's API returns *current* values and doesn't retain full history (and has
  deprecated specific metrics before — Jan 2025), so trend charts need our own
  history; this table is that history, not a cache of it.

Tables are created by `POST /api/admin/migrate-social` (`CREATE TABLE IF NOT
EXISTS`, same one-shot pattern as `migrate-flights` / `migrate`) — run once after
deploying, same as every other new table in this app.

## The publish flow

Instagram has no single-step post — it's always two calls: create a media
container (`POST /{ig-id}/media` with an `image_url` + caption), then publish it
(`POST /{ig-id}/media_publish`). Facebook Pages allow posting the photo directly
(`POST /{page-id}/photos`). Both live in **one wrapper**, `src/lib/social.ts` —
same rule as `email.ts`/`wallet.ts`: routes never call `graph.facebook.com`
directly, so the API version and the whole auth flow live in exactly one place.
`socialEnabled()` gates every call on `META_APP_ID`/`META_APP_SECRET` existing;
missing config means the feature 501s cleanly, same as `walletEnabled()`.

`mediaUrls` on a post must be a **public https URL** — Meta fetches the image
itself, it doesn't accept an upload. The existing `/api/upload` → `/api/img/<id>`
endpoint already serves images publicly, so that's the intended source; `social.ts`
resolves a relative `/api/img/<id>` to an absolute URL using `NEXT_PUBLIC_APP_URL`.

`/api/social/publish-cron` (Vercel cron, every 15 min, `CRON_SECRET`-gated like
`comm-cron`) claims due posts one at a time (`updateMany` guarded on
`status:'scheduled'`, same shape as the comm-cron claim pattern) so an overlapping
run can't double-post, opportunistically refreshes a token within 5 days of
expiring, and publishes. A failure pushes to the org via `sendPushToOrg` — silence
would look identical to "it went fine," same reasoning as the comm-cron receipt.

## The insights flow

`/api/social/insights-cron` (every 4 hours) snapshots reach/impressions/likes/
comments/saves/shares for posts published in the last 30 days into
`PostInsightSnapshot`. Same tokens as publishing — analytics on your own account is
the same Standard Access bucket, no extra review. The 30-day window is a cost/scale
choice (engagement is heavily front-loaded), not a hard limit — widen it if Bo
wants longer-tail tracking later.

## Connect flow

`GET /api/social/connect` (director/admin only) redirects to Meta's OAuth dialog.
`GET /api/social/callback` exchanges the code, upgrades to a long-lived (~60 day)
token, and **connects every Page (+ its linked Instagram account) the authorizing
person manages** — no picker UI yet, everything returned is already scoped to
accounts that person has a role on. `state` is an encrypted `orgId:timestamp` pair
(reuses `encrypt.ts`, no new crypto/cookie plumbing) checked for a matching org and
a 10-minute freshness window on the way back.

## Setup (Bo does this — it's credentials, the agent must not handle them)

> Done Sep 23, 2026: Meta app **Whistle Ready Social** (App ID 2682384555510574) exists
> in Development mode with the Instagram + Pages use cases, all scopes below marked
> "Ready for testing", redirect URI + app domain set, and `META_APP_ID` /
> `NEXT_PUBLIC_APP_URL` in Vercel. Only `META_APP_SECRET` was left for Bo to paste.

1. developers.facebook.com → **Create App** → type "Business" → name it (e.g.
   "Whistle Ready Social").
2. Add the **Instagram** and **Facebook Login for Business** products.
3. App settings → **Basic**: copy the **App ID** and **App Secret** into Vercel env
   vars `META_APP_ID` / `META_APP_SECRET` (never in the repo or in chat).
4. App Roles → **Roles** → add the Sunshine Events Group Facebook account (whoever
   is admin of the @seglacrosse Page) as a **Tester** (or Admin). This is the step
   that keeps everything under Standard Access — no review, no waiting.
5. Confirm the SEG Instagram account is a **Business or Creator** account linked to
   the SEG Facebook Page (Instagram app → Settings → Account type; Page → Settings
   → Linked accounts) — a personal IG account can't be published to via the API at
   all, review or not.
6. Set `NEXT_PUBLIC_APP_URL=https://whistleready.app` and `CRON_SECRET` (already
   used by the other crons) in Vercel if not already set.
7. Run the migration once: `POST /api/admin/migrate-social`.
8. Log in as director/admin on whistleready.app and hit `/api/social/connect` —
   that's the actual "connect account" action from here on.

## Duplicating this for the other brands

When this moves to Business OS / Imprint Dynasty for Dynasty Custom / Lacrossewear
/ Custom Tent Covers / Make a Tee: copy `src/lib/social.ts`, the three `SocialAccount`
/ `ScheduledPost` / `PostInsightSnapshot` models, and the five API routes into that
codebase, point them at that app's own Turso database, and create a **separate**
Meta Developer app scoped to that business's own Pages (step 1 above, again) — do
not reuse Whistle Ready's Meta app or database. Same pattern, zero shared runtime.

## Built so far / open

- **Done**: schema + migration route, `social.ts` wrapper (connect, publish,
  insights, token refresh), connect/callback routes, posts CRUD
  (`api/social/posts`, `api/social/posts/[id]`) with the draft→approve gate,
  publish-cron, insights-cron, `vercel.json` cron entries, `social_scheduler`
  permission key (director-only for now).
- **Built (Sep 22)**: the `/dashboard/org/social` page — two-week calendar with
  drag-to-reschedule, an Approvals board, a slide-over with a native-style
  Instagram/Facebook preview + edit mode, compose (uploads via `/api/upload`),
  and a Connected-accounts panel with disconnect. `GET/DELETE /api/social/accounts`
  and the `unapprove` / `retry` actions on `PATCH /api/social/posts/[id]` were
  added for it. The page was dark at first (per the mockup) — Bo asked for the
  standard light slate/teal look on Sep 23, so it now matches the rest of the dashboard.
- **Built (Sep 23)** — the "cheap four" from the PromoRepublic comparison: multi-account
  compose (one post per selected account, tied by `groupId`; approving one approves
  the set), **Publish now** (`action:'publish-now'`, director-only, goes through the
  same `src/lib/socialPublish.ts` path the cron uses), **Add to queue** (standing
  slots per org in AppSetting `socialQueue:<orgId>`, `GET/PUT /api/social/queue`,
  editor in the Accounts & queue times drawer), and **First comment** (`firstComment`
  column; posted via `/{post-id}/comments` right after publish — hashtags live there).
  Re-run `POST /api/admin/migrate-social` once after deploying: it adds the two new
  columns (`firstComment`, `groupId`) idempotently.
- **Built (Sep 23, later)** — **Import post history** (`POST /api/social/import-history`,
  director; button in the Accounts drawer): pulls each account's existing posts in as
  `published` rows (`importedAt`, `permalink` set) and takes a first insights snapshot,
  so the calendar + numbers cover everything, not just posts made here. The hero tiles
  now show real **People reached / Interactions (28 days, with delta)** from
  `GET /api/social/insights/summary`, and a published post's drawer shows its latest
  snapshot. `fetchPostInsights` was fixed for Meta's 2025 metric changes
  (`impressions` → `views` on IG; `post_engaged_users` gone on FB) and falls back to the
  post's own like/comment counts when `/insights` refuses. Scope `read_insights` added
  (FB post reach) — takes effect the next time the accounts are reconnected.
- **Built (Sep 23, video)** — Reels, video posts and Stories. `ScheduledPost` gained
  `mediaType` (image|video), `placement` (feed|story), `thumbnailUrl` (poster frame
  captured in the browser) and `externalContainerId`. Video bytes go browser → Vercel
  Blob via `/api/social/upload-video` (needs `BLOB_READ_WRITE_TOKEN` — a Blob store
  connected to the project); photos stay on `/api/upload`. Instagram: feed video =
  Reel (`media_type=REELS`, `share_to_feed`), story = `media_type=STORIES`; the
  container is polled until FINISHED, and if transcoding outlasts the request the row
  stays `publishing` with the container id and `finishPendingContainers()` completes
  it on the next cron run (2 h give-up). Facebook: `/videos` (feed video),
  `/photo_stories`, `/video_stories` (3-phase). Compose can target Feed, Story or both
  → one row per account × placement. Audio must already be in the MP4 — the API
  can't attach a track or use Instagram's music library.
- **Built (Sep 23, evening)** — **Write with AI** under the caption field:
  `POST /api/social/caption-assist` (staff) returns three caption angles + a hashtag
  set for the first comment, grounded in the org's upcoming tournaments (raw-SQL
  `Tournament` query by orgId) and the post's cover frame (sent to Claude as an
  image so it reads "31 DAYS TO GO" etc. off the graphic). Same Anthropic wiring
  and model as `/api/ai/generate`. Compose also gained an Edit/Preview toggle that
  renders the Reel and Story the way Instagram shows them, video playable.
- **Built (Sep 23, insights)** — **Insights tab** (`InsightsView.tsx`, third tab next to
  Calendar/Approvals; the hero tiles link to it). One read, `GET /api/social/insights/report`
  (period 7/28/90/365 days, optional platform, viewer's tz), returns per-post rows with the
  latest snapshot, current vs previous-period totals, and breakdowns by week/month,
  account, format, weekday and time of day. The page shows KPI tiles with deltas, a
  "What's working" list (each finding names its n; nothing claimed from <2 posts), a
  reach-by-week column chart, the three breakdown cards, and a sortable ranked table.
  `POST /api/social/insights/refresh` (director) re-snapshots every post in the window —
  the cron only re-reads the last 30 days. Reach is a SUM of per-post reach, not unique
  people; the page says so.
- **Deliberately not built**: a built-in graphics editor (Canva does it better and Bo
  already designs there), "send to mobile", boost/ads.
- **Still to do**: a connect-account *picker* (every Page the OAuth user manages
  still gets connected automatically), and surfacing insight numbers (reach /
  interactions) on the page — the cron already stores them.