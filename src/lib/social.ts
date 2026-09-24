import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encrypt'

// Social scheduler — native Instagram/Facebook connect + publish + insights.
//
// ONE wrapper for the Meta Graph API, same rule as src/lib/email.ts and
// src/lib/wallet.ts: routes never call graph.facebook.com directly, so the
// API version and the auth flow live in exactly one place.
//
// Every account this connects to is one the org already owns (its own Page +
// linked Instagram Business account), authorized by adding that account as a
// Tester/Admin on the Meta app below and logging in as it — NOT publishing on
// behalf of accounts we don't manage. That's what keeps this under Meta's
// "Standard Access" tier with no App Review and no Business Verification
// queue to wait on. See SOCIAL-SCHEDULER.md for the one-time Meta app setup
// (that part is Bo's — it's credentials, same rule as the Apple Wallet cert).
//
// socialEnabled() gates every call below on the env vars existing; like
// walletEnabled(), missing config means the feature is cleanly hidden/501,
// nothing else breaks.

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// instagram_manage_insights sits in the same "your own business" bucket as
// content_publish — pulling analytics on your own account needs no more
// review than publishing to it does.
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments', // first comment under an IG post
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement', // first comment under a Page post
  'read_insights', // Page post reach/impressions
  'business_management',
].join(',')

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export function socialEnabled(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

function appId() { return process.env.META_APP_ID || '' }
function appSecret() { return process.env.META_APP_SECRET || '' }

async function graphGet<T = any>(path: string, params: Record<string, string>): Promise<Result<T>> {
  try {
    const url = new URL(`${GRAPH_BASE}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url.toString())
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok || json?.error) return { ok: false, error: json?.error?.message || `Graph API ${res.status}` }
    return { ok: true, data: json as T }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error calling Graph API' }
  }
}

async function graphPost<T = any>(path: string, body: Record<string, string>): Promise<Result<T>> {
  try {
    const url = new URL(`${GRAPH_BASE}${path}`)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok || json?.error) return { ok: false, error: json?.error?.message || `Graph API ${res.status}` }
    return { ok: true, data: json as T }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error calling Graph API' }
  }
}

/** Meta's OAuth dialog URL. Send the org's Facebook admin here to connect their
 *  own Page + Instagram Business account — no App Review needed as long as
 *  they're logged in as an account with a role on our Meta app (see setup doc). */
export function getConnectUrl(redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', appId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

type TokenResp = { access_token: string; expires_in?: number }

async function exchangeCodeForShortLivedToken(code: string, redirectUri: string): Promise<Result<string>> {
  const r = await graphGet<TokenResp>('/oauth/access_token', {
    client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri, code,
  })
  if (!r.ok) return r
  return { ok: true, data: r.data.access_token }
}

/** Short-lived (~1-2hr) user token -> long-lived (~60 day) user token. */
async function getLongLivedToken(shortLivedToken: string): Promise<Result<{ token: string; expiresInSeconds: number }>> {
  const r = await graphGet<TokenResp>('/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId(), client_secret: appSecret(), fb_exchange_token: shortLivedToken,
  })
  if (!r.ok) return r
  return { ok: true, data: { token: r.data.access_token, expiresInSeconds: r.data.expires_in || 60 * 24 * 60 * 60 } }
}

/** A still-valid long-lived Page token can be re-exchanged for a fresh 60-day one.
 *  Called opportunistically from the publish cron so accounts don't silently expire. */
export async function refreshLongLivedToken(currentToken: string): Promise<Result<{ token: string; expiresInSeconds: number }>> {
  return getLongLivedToken(currentToken)
}

type PageAccount = {
  id: string            // Facebook Page id
  name: string
  access_token: string  // Page access token (this is what publishes/reads insights)
  instagram_business_account?: { id: string; username?: string }
}

/** Every Page (and its linked Instagram Business account, if any) the authorizing
 *  user manages. Used right after the OAuth callback to populate SocialAccount rows —
 *  everything returned here is already scoped to accounts that user has a role on. */
export async function listConnectableAccounts(userAccessToken: string): Promise<Result<PageAccount[]>> {
  const r = await graphGet<{ data: PageAccount[] }>('/me/accounts', {
    access_token: userAccessToken,
    fields: 'id,name,access_token,instagram_business_account{id,username}',
  })
  if (!r.ok) return r
  return { ok: true, data: r.data.data || [] }
}

/** Full connect flow after the OAuth redirect lands back with `code`: exchanges it,
 *  upgrades to a long-lived token, and upserts one SocialAccount row per connectable
 *  Page (+ a second row for its linked Instagram account, if any). */
export async function completeConnect(orgId: string, userId: string, code: string, redirectUri: string): Promise<Result<{ connected: number }>> {
  const short = await exchangeCodeForShortLivedToken(code, redirectUri)
  if (!short.ok) return short
  const long = await getLongLivedToken(short.data)
  if (!long.ok) return long
  const pages = await listConnectableAccounts(long.data.token)
  if (!pages.ok) return pages

  const expiresAt = new Date(Date.now() + long.data.expiresInSeconds * 1000)
  let connected = 0
  for (const page of pages.data) {
    // Facebook Page itself.
    await upsertAccount({
      orgId, platform: 'facebook', label: page.name, externalId: page.id, pageId: page.id,
      accessToken: page.access_token, tokenExpiresAt: expiresAt, connectedByUserId: userId,
    })
    connected++
    // Its linked Instagram Business account, if the Page has one connected.
    if (page.instagram_business_account?.id) {
      await upsertAccount({
        orgId, platform: 'instagram', label: page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : page.name,
        externalId: page.instagram_business_account.id, pageId: page.id,
        accessToken: page.access_token, tokenExpiresAt: expiresAt, connectedByUserId: userId,
      })
      connected++
    }
  }
  return { ok: true, data: { connected } }
}

async function upsertAccount(a: {
  orgId: string; platform: string; label: string; externalId: string; pageId: string
  accessToken: string; tokenExpiresAt: Date; connectedByUserId: string
}) {
  const existing = await prisma.socialAccount.findFirst({ where: { orgId: a.orgId, platform: a.platform, externalId: a.externalId } })
  const data = {
    orgId: a.orgId, platform: a.platform, label: a.label, externalId: a.externalId, pageId: a.pageId,
    accessToken: encrypt(a.accessToken), tokenExpiresAt: a.tokenExpiresAt, connectedByUserId: a.connectedByUserId,
    status: 'active', lastError: '',
  }
  if (existing) await prisma.socialAccount.update({ where: { id: existing.id }, data })
  else await prisma.socialAccount.create({ data })
}

function absoluteUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://whistleready.app'
  return `${base}${u.startsWith('/') ? '' : '/'}${u}`
}

/** What a post is, independent of platform: a photo or a video, going to the feed
 *  or to Stories. On Instagram a feed video is a Reel (the API has no other kind of
 *  feed video any more); on Facebook it's a Page video post. */
export type PublishSpec = {
  mediaType: 'image' | 'video' | 'carousel'
  placement: 'feed' | 'story'
  mediaUrl: string
  caption: string
  /** Optional poster frame for a video (Reel cover). */
  coverUrl?: string
  /** Carousel slides, in order (2–10). Only for mediaType 'carousel', feed only. */
  items?: CarouselItem[]
}
export type CarouselItem = { url: string; type: 'image' | 'video' }

/** Slides are stored as a plain URL list (ScheduledPost.mediaUrls), so a slide's
 *  kind comes from its file extension — video uploads keep their .mp4/.mov name. */
export function isVideoUrl(u: string): boolean { return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(u || '') }
export function carouselItems(urls: string[]): CarouselItem[] { return urls.filter(Boolean).map(url => ({ url, type: isVideoUrl(url) ? 'video' : 'image' })) }

/** Instagram carousel, step 1: one child container per slide. Photos are ready at
 *  once; video slides transcode first, so the caller waits for every child to be
 *  FINISHED before creating the parent (createInstagramCarouselParent). */
export async function createInstagramCarouselChildren(account: { externalId: string; accessToken: string }, items: CarouselItem[]): Promise<Result<{ childIds: string[] }>> {
  if (items.length < 2 || items.length > 10) return { ok: false, error: `Instagram carousels take 2–10 photos or videos (this one has ${items.length})` }
  const token = decrypt(account.accessToken)
  const childIds: string[] = []
  for (const it of items) {
    const body: Record<string, string> = { access_token: token, is_carousel_item: 'true' }
    if (it.type === 'video') { body.media_type = 'VIDEO'; body.video_url = absoluteUrl(it.url) } else body.image_url = absoluteUrl(it.url)
    const r = await graphPost<{ id: string }>(`/${account.externalId}/media`, body)
    if (!r.ok) return { ok: false, error: `Slide ${childIds.length + 1}: ${r.error}` }
    childIds.push(r.data.id)
  }
  return { ok: true, data: { childIds } }
}

/** Instagram carousel, step 2: the album container that points at the children.
 *  Poll it with getInstagramContainerStatus and publish it like any container. */
export async function createInstagramCarouselParent(account: { externalId: string; accessToken: string }, childIds: string[], caption: string): Promise<Result<{ containerId: string }>> {
  const body: Record<string, string> = { access_token: decrypt(account.accessToken), media_type: 'CAROUSEL', children: childIds.join(',') }
  if (caption) body.caption = caption
  const r = await graphPost<{ id: string }>(`/${account.externalId}/media`, body)
  if (!r.ok) return r
  return { ok: true, data: { containerId: r.data.id } }
}

export type ContainerStatus = 'FINISHED' | 'IN_PROGRESS' | 'ERROR' | 'EXPIRED' | 'PUBLISHED' | 'UNKNOWN'

/** Step 1 of an Instagram publish: create the media container. Images are usually
 *  ready at once; videos (Reels, video Stories) transcode on Meta's side first, so the
 *  caller polls getInstagramContainerStatus until FINISHED before publishing. */
export async function createInstagramContainer(account: { externalId: string; accessToken: string }, spec: PublishSpec): Promise<Result<{ containerId: string }>> {
  const token = decrypt(account.accessToken)
  const body: Record<string, string> = { access_token: token }
  if (spec.placement === 'story') {
    body.media_type = 'STORIES'
    if (spec.mediaType === 'video') body.video_url = absoluteUrl(spec.mediaUrl); else body.image_url = absoluteUrl(spec.mediaUrl)
    // Stories carry no caption on Instagram — anything passed is ignored, so don't.
  } else if (spec.mediaType === 'video') {
    body.media_type = 'REELS'
    body.video_url = absoluteUrl(spec.mediaUrl)
    body.share_to_feed = 'true'
    if (spec.caption) body.caption = spec.caption
    if (spec.coverUrl) body.cover_url = absoluteUrl(spec.coverUrl)
  } else {
    body.image_url = absoluteUrl(spec.mediaUrl)
    if (spec.caption) body.caption = spec.caption
  }
  const r = await graphPost<{ id: string }>(`/${account.externalId}/media`, body)
  if (!r.ok) return r
  return { ok: true, data: { containerId: r.data.id } }
}

export async function getInstagramContainerStatus(account: { accessToken: string }, containerId: string): Promise<Result<{ status: ContainerStatus; detail: string }>> {
  const r = await graphGet<{ status_code?: string; status?: string }>(`/${containerId}`, { fields: 'status_code,status', access_token: decrypt(account.accessToken) })
  if (!r.ok) return r
  const s = (r.data.status_code || 'UNKNOWN') as ContainerStatus
  return { ok: true, data: { status: s, detail: r.data.status || '' } }
}

/** Step 2: publish a FINISHED container. Returns the live media id. */
export async function publishInstagramContainer(account: { externalId: string; accessToken: string }, containerId: string): Promise<Result<{ externalPostId: string }>> {
  const r = await graphPost<{ id: string }>(`/${account.externalId}/media_publish`, { creation_id: containerId, access_token: decrypt(account.accessToken) })
  if (!r.ok) return r
  return { ok: true, data: { externalPostId: r.data.id } }
}

/** Facebook Page publish — all four shapes are synchronous from our side (a video
 *  post returns its id immediately and finishes processing on Meta's end). */
export async function publishFacebook(account: { externalId: string; accessToken: string }, spec: PublishSpec): Promise<Result<{ externalPostId: string }>> {
  const token = decrypt(account.accessToken)
  const page = account.externalId
  if (spec.placement === 'feed' && spec.mediaType === 'carousel') {
    // Facebook's version of a carousel is a multi-photo post: upload each photo
    // unpublished, then attach them all to one feed post. Page posts can't mix
    // video into that, so video slides are left out here (the compose screen
    // says so); a slide set with no photos goes out as its first video.
    const items = spec.items || []
    const photos = items.filter(i => i.type === 'image')
    if (!photos.length) {
      const v = items.find(i => i.type === 'video'); if (!v) return { ok: false, error: 'No photos or videos attached' }
      return publishFacebook(account, { ...spec, mediaType: 'video', mediaUrl: v.url, items: undefined })
    }
    if (photos.length === 1) return publishFacebook(account, { ...spec, mediaType: 'image', mediaUrl: photos[0].url, items: undefined })
    const ids: string[] = []
    for (const ph of photos) {
      const up = await graphPost<{ id: string }>(`/${page}/photos`, { url: absoluteUrl(ph.url), published: 'false', access_token: token })
      if (!up.ok) return { ok: false, error: `Photo ${ids.length + 1}: ${up.error}` }
      ids.push(up.data.id)
    }
    const body: Record<string, string> = { message: spec.caption, access_token: token }
    ids.forEach((id, i) => { body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
    const r = await graphPost<{ id: string }>(`/${page}/feed`, body)
    if (!r.ok) return r
    return { ok: true, data: { externalPostId: r.data.id } }
  }
  if (spec.placement === 'feed' && spec.mediaType === 'image') {
    const r = await graphPost<{ id: string; post_id?: string }>(`/${page}/photos`, { url: absoluteUrl(spec.mediaUrl), caption: spec.caption, access_token: token })
    if (!r.ok) return r
    return { ok: true, data: { externalPostId: r.data.post_id || r.data.id } }
  }
  if (spec.placement === 'feed' && spec.mediaType === 'video') {
    const r = await graphPost<{ id: string }>(`/${page}/videos`, { file_url: absoluteUrl(spec.mediaUrl), description: spec.caption, access_token: token })
    if (!r.ok) return r
    return { ok: true, data: { externalPostId: r.data.id } }
  }
  if (spec.placement === 'story' && spec.mediaType === 'image') {
    // Photo Stories: upload the photo unpublished, then attach it to a Story.
    const up = await graphPost<{ id: string }>(`/${page}/photos`, { url: absoluteUrl(spec.mediaUrl), published: 'false', access_token: token })
    if (!up.ok) return up
    const st = await graphPost<{ post_id?: string; id?: string }>(`/${page}/photo_stories`, { photo_id: up.data.id, access_token: token })
    if (!st.ok) return st
    return { ok: true, data: { externalPostId: st.data.post_id || st.data.id || up.data.id } }
  }
  // Video Stories: three-phase upload (start → hand Meta the file URL → finish).
  const start = await graphPost<{ video_id: string; upload_url: string }>(`/${page}/video_stories`, { upload_phase: 'start', access_token: token })
  if (!start.ok) return start
  try {
    const res = await fetch(start.data.upload_url, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: absoluteUrl(spec.mediaUrl) } })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok || json?.error || json?.success === false) return { ok: false, error: json?.error?.message || json?.debug_info?.message || `Story upload failed (${res.status})` }
  } catch (e: any) { return { ok: false, error: e?.message || 'Network error uploading the story video' } }
  const fin = await graphPost<{ post_id?: string; success?: boolean }>(`/${page}/video_stories`, { upload_phase: 'finish', video_id: start.data.video_id, access_token: token })
  if (!fin.ok) return fin
  return { ok: true, data: { externalPostId: fin.data.post_id || start.data.video_id } }
}

/** Posts a comment under a just-published post — how hashtags stay out of the
 *  caption on Instagram. Same endpoint shape for IG media and FB Page posts/videos. */
export async function postFirstComment(account: { accessToken: string }, externalPostId: string, message: string): Promise<Result<{ commentId: string }>> {
  const r = await graphPost<{ id: string }>(`/${externalPostId}/comments`, { message, access_token: decrypt(account.accessToken) })
  if (!r.ok) return r
  return { ok: true, data: { commentId: r.data.id } }
}

const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Looks on the account itself for a post we sent but never got to record — the
 *  function died between Meta accepting the post and our database write. Matches on
 *  publish time (from `since`, minus a little clock slack) and, for anything with a
 *  caption, on the caption's opening. Stories carry no caption, so those match on
 *  time alone. Returns null when nothing matches — i.e. it genuinely didn't go out. */
export async function findLivePost(
  account: { platform: string; externalId: string; accessToken: string },
  opts: { since: Date; caption: string; mediaType: string; placement: string },
): Promise<Result<{ externalPostId: string; permalink: string } | null>> {
  const token = decrypt(account.accessToken)
  const after = opts.since.getTime() - 10 * 60 * 1000
  const want = norm(opts.caption).slice(0, 60)
  const hit = (t: string, text: string | undefined) => new Date(t).getTime() >= after && (!want || norm(text || '').startsWith(want))
  if (account.platform === 'instagram') {
    if (opts.placement === 'story') {
      const r = await graphGet<{ data: any[] }>(`/${account.externalId}/stories`, { fields: 'id,timestamp,permalink', access_token: token })
      if (!r.ok) return r
      const m = (r.data.data || []).find(x => new Date(x.timestamp).getTime() >= after)
      return { ok: true, data: m ? { externalPostId: m.id, permalink: m.permalink || '' } : null }
    }
    const r = await graphGet<{ data: any[] }>(`/${account.externalId}/media`, { fields: 'id,caption,timestamp,permalink', limit: '20', access_token: token })
    if (!r.ok) return r
    const m = (r.data.data || []).find(x => hit(x.timestamp, x.caption))
    return { ok: true, data: m ? { externalPostId: m.id, permalink: m.permalink || '' } : null }
  }
  if (account.platform === 'facebook') {
    if (opts.placement === 'story') {
      const r = await graphGet<{ data: any[] }>(`/${account.externalId}/stories`, { access_token: token })
      if (!r.ok) return r
      const m = (r.data.data || []).find(x => new Date(Number(x.creation_time) * 1000 || x.creation_time).getTime() >= after)
      return { ok: true, data: m ? { externalPostId: m.post_id || m.id, permalink: m.url || '' } : null }
    }
    if (opts.mediaType === 'video') {
      const r = await graphGet<{ data: any[] }>(`/${account.externalId}/videos`, { fields: 'id,description,created_time,permalink_url', limit: '15', access_token: token })
      if (!r.ok) return r
      const m = (r.data.data || []).find(x => hit(x.created_time, x.description))
      return { ok: true, data: m ? { externalPostId: m.id, permalink: m.permalink_url ? (m.permalink_url.startsWith('http') ? m.permalink_url : `https://www.facebook.com${m.permalink_url}`) : '' } : null }
    }
    const r = await graphGet<{ data: any[] }>(`/${account.externalId}/published_posts`, { fields: 'id,message,created_time,permalink_url', limit: '15', access_token: token })
    if (!r.ok) return r
    const m = (r.data.data || []).find(x => hit(x.created_time, x.message))
    return { ok: true, data: m ? { externalPostId: m.id, permalink: m.permalink_url || '' } : null }
  }
  return { ok: false, error: `Unsupported platform: ${account.platform}` }
}

type InsightMetrics = { reach: number; impressions: number; likes: number; comments: number; saves: number; shares: number; raw: any }

function emptyMetrics(raw: any = {}): InsightMetrics {
  return { reach: 0, impressions: 0, likes: 0, comments: 0, saves: 0, shares: 0, raw }
}

/** Current metrics for one published post. Meta doesn't retain full history
 *  indefinitely and has deprecated specific metrics before (impressions → views in
 *  2025) — this is a point-in-time read; the insights cron is what turns it into a
 *  durable trend by snapshotting it on a schedule (see PostInsightSnapshot).
 *  Never throws and never fails the whole read over one metric: the like/comment
 *  counts on the post object itself are the fallback when /insights refuses. */
export async function fetchPostInsights(account: { platform: string; accessToken: string }, externalPostId: string): Promise<Result<InsightMetrics>> {
  const token = decrypt(account.accessToken)
  if (account.platform === 'instagram') {
    const m = emptyMetrics({})
    const basic = await graphGet<{ like_count?: number; comments_count?: number }>(`/${externalPostId}`, { fields: 'like_count,comments_count', access_token: token })
    if (basic.ok) { m.likes = basic.data.like_count || 0; m.comments = basic.data.comments_count || 0 }
    const r = await graphGet<{ data: { name: string; values: { value: number }[] }[] }>(`/${externalPostId}/insights`, {
      metric: 'reach,views,saved,shares', access_token: token,
    })
    if (r.ok) {
      for (const row of r.data.data || []) {
        const v = row.values?.[0]?.value || 0
        if (row.name === 'reach') m.reach = v
        else if (row.name === 'views') m.impressions = v
        else if (row.name === 'saved') m.saves = v
        else if (row.name === 'shares') m.shares = v
      }
      m.raw = r.data
    } else {
      m.raw = { insightsError: r.error }
      if (!basic.ok) return r
    }
    return { ok: true, data: m }
  }
  if (account.platform === 'facebook') {
    const m = emptyMetrics({})
    const basic = await graphGet<any>(`/${externalPostId}`, { fields: 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares', access_token: token })
    if (basic.ok) {
      m.likes = basic.data?.reactions?.summary?.total_count || 0
      m.comments = basic.data?.comments?.summary?.total_count || 0
      m.shares = basic.data?.shares?.count || 0
    }
    const r = await graphGet<{ data: { name: string; values: { value: number }[] }[] }>(`/${externalPostId}/insights`, {
      metric: 'post_impressions,post_impressions_unique', access_token: token,
    })
    if (r.ok) {
      for (const row of r.data.data || []) {
        const v = row.values?.[0]?.value || 0
        if (row.name === 'post_impressions') m.impressions = v
        else if (row.name === 'post_impressions_unique') m.reach = v
      }
      m.raw = r.data
    } else {
      m.raw = { insightsError: r.error }
      if (!basic.ok) return r
    }
    return { ok: true, data: m }
  }
  return { ok: false, error: `Unsupported platform: ${account.platform}` }
}

export type PublishedMedia = { externalPostId: string; caption: string; publishedAt: Date; mediaUrl: string; permalink: string }

/** The account's existing posts (newest first) — what "Import post history" pulls in
 *  so the calendar and insights cover everything, not just posts made from here. */
export async function listPublishedMedia(account: { platform: string; externalId: string; accessToken: string }, limit = 60): Promise<Result<PublishedMedia[]>> {
  const token = decrypt(account.accessToken)
  const out: PublishedMedia[] = []
  if (account.platform === 'instagram') {
    let url: string | null = `/${account.externalId}/media`
    let params: Record<string, string> = { fields: 'id,caption,timestamp,permalink,media_type,media_url,thumbnail_url', limit: String(Math.min(limit, 50)), access_token: token }
    while (url && out.length < limit) {
      const r: Result<{ data: any[]; paging?: { cursors?: { after?: string } ; next?: string } }> = await graphGet(url, params)
      if (!r.ok) return out.length ? { ok: true, data: out } : r
      for (const mrow of r.data.data || []) {
        out.push({ externalPostId: mrow.id, caption: mrow.caption || '', publishedAt: new Date(mrow.timestamp), mediaUrl: mrow.media_type === 'VIDEO' ? (mrow.thumbnail_url || mrow.media_url || '') : (mrow.media_url || ''), permalink: mrow.permalink || '' })
      }
      const after = r.data.paging?.cursors?.after
      if (after && r.data.paging?.next) params = { ...params, after }; else url = null
    }
    return { ok: true, data: out.slice(0, limit) }
  }
  if (account.platform === 'facebook') {
    let url: string | null = `/${account.externalId}/published_posts`
    let params: Record<string, string> = { fields: 'id,message,created_time,permalink_url,full_picture', limit: String(Math.min(limit, 50)), access_token: token }
    while (url && out.length < limit) {
      const r: Result<{ data: any[]; paging?: { cursors?: { after?: string }; next?: string } }> = await graphGet(url, params)
      if (!r.ok) return out.length ? { ok: true, data: out } : r
      for (const prow of r.data.data || []) {
        out.push({ externalPostId: prow.id, caption: prow.message || '', publishedAt: new Date(prow.created_time), mediaUrl: prow.full_picture || '', permalink: prow.permalink_url || '' })
      }
      const after = r.data.paging?.cursors?.after
      if (after && r.data.paging?.next) params = { ...params, after }; else url = null
    }
    return { ok: true, data: out.slice(0, limit) }
  }
  return { ok: false, error: `Unsupported platform: ${account.platform}` }
}
