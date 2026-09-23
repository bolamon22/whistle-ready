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
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
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

/** Publishes one image to an Instagram Business account. Two Graph API calls:
 *  create a media container, then publish it — Instagram has no single-step post. */
export async function publishInstagramPost(account: { externalId: string; accessToken: string }, opts: { imageUrl: string; caption: string }): Promise<Result<{ externalPostId: string }>> {
  const token = decrypt(account.accessToken)
  const created = await graphPost<{ id: string }>(`/${account.externalId}/media`, {
    image_url: absoluteUrl(opts.imageUrl), caption: opts.caption, access_token: token,
  })
  if (!created.ok) return created
  const published = await graphPost<{ id: string }>(`/${account.externalId}/media_publish`, {
    creation_id: created.data.id, access_token: token,
  })
  if (!published.ok) return published
  return { ok: true, data: { externalPostId: published.data.id } }
}

/** Publishes one image to a Facebook Page's feed — a single call (Facebook, unlike
 *  Instagram, allows posting the photo directly). */
export async function publishFacebookPost(account: { externalId: string; accessToken: string }, opts: { imageUrl: string; caption: string }): Promise<Result<{ externalPostId: string }>> {
  const token = decrypt(account.accessToken)
  const posted = await graphPost<{ id: string; post_id?: string }>(`/${account.externalId}/photos`, {
    url: absoluteUrl(opts.imageUrl), caption: opts.caption, access_token: token,
  })
  if (!posted.ok) return posted
  return { ok: true, data: { externalPostId: posted.data.post_id || posted.data.id } }
}

export async function publishPost(account: { platform: string; externalId: string; accessToken: string }, opts: { imageUrl: string; caption: string }): Promise<Result<{ externalPostId: string }>> {
  if (account.platform === 'instagram') return publishInstagramPost(account, opts)
  if (account.platform === 'facebook') return publishFacebookPost(account, opts)
  return { ok: false, error: `Unsupported platform: ${account.platform}` }
}

/** Posts a comment under a just-published post — how hashtags stay out of the
 *  caption on Instagram. Same endpoint shape for IG media and FB Page posts. */
export async function postFirstComment(account: { accessToken: string }, externalPostId: string, message: string): Promise<Result<{ commentId: string }>> {
  const r = await graphPost<{ id: string }>(`/${externalPostId}/comments`, { message, access_token: decrypt(account.accessToken) })
  if (!r.ok) return r
  return { ok: true, data: { commentId: r.data.id } }
}

type InsightMetrics = { reach: number; impressions: number; likes: number; comments: number; saves: number; shares: number; raw: any }

function emptyMetrics(raw: any = {}): InsightMetrics {
  return { reach: 0, impressions: 0, likes: 0, comments: 0, saves: 0, shares: 0, raw }
}

/** Current metrics for one published post. Meta doesn't retain full history
 *  indefinitely and has deprecated specific metrics before (Jan 2025) — this is a
 *  point-in-time read; the insights cron is what turns it into a durable trend by
 *  snapshotting it on a schedule (see PostInsightSnapshot). */
export async function fetchPostInsights(account: { platform: string; accessToken: string }, externalPostId: string): Promise<Result<InsightMetrics>> {
  const token = decrypt(account.accessToken)
  if (account.platform === 'instagram') {
    const r = await graphGet<{ data: { name: string; values: { value: number }[] }[] }>(`/${externalPostId}/insights`, {
      metric: 'reach,impressions,likes,comments,saved,shares', access_token: token,
    })
    if (!r.ok) return r
    const m = emptyMetrics(r.data)
    for (const row of r.data.data || []) {
      const v = row.values?.[0]?.value || 0
      if (row.name === 'reach') m.reach = v
      else if (row.name === 'impressions') m.impressions = v
      else if (row.name === 'likes') m.likes = v
      else if (row.name === 'comments') m.comments = v
      else if (row.name === 'saved') m.saves = v
      else if (row.name === 'shares') m.shares = v
    }
    return { ok: true, data: m }
  }
  if (account.platform === 'facebook') {
    const r = await graphGet<{ data: { name: string; values: { value: number }[] }[] }>(`/${externalPostId}/insights`, {
      metric: 'post_impressions,post_engaged_users', access_token: token,
    })
    if (!r.ok) return r
    const m = emptyMetrics(r.data)
    for (const row of r.data.data || []) {
      const v = row.values?.[0]?.value || 0
      if (row.name === 'post_impressions') m.impressions = v
      else if (row.name === 'post_engaged_users') m.reach = v
    }
    return { ok: true, data: m }
  }
  return { ok: false, error: `Unsupported platform: ${account.platform}` }
}
