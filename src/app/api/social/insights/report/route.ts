import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

// The Insights tab on the social scheduler. One read that returns everything the
// tab draws: per-post rows (latest snapshot each) for the selected window, the same
// totals for the window before it (for the deltas), and the breakdowns — by week,
// account, format, weekday and time of day — already bucketed in the viewer's time
// zone. Reads only what the insights cron / import / refresh stored; never calls
// Meta, so it's cheap to reload when the period or account filter changes.
//
// Reach is a SUM across posts. Meta only gives unique reach per post (and a
// separate account-level number we don't pull yet), so one person who saw three
// posts counts three times here. The page says so under the numbers.

type Row = {
  id: string; platform: string; account: string; publishedAt: string
  format: 'reel' | 'video' | 'photo' | 'story' | 'carousel'
  caption: string; thumb: string; permalink: string
  reach: number; views: number; likes: number; comments: number; saves: number; shares: number
  interactions: number; engagementRate: number | null; fetchedAt: string | null
}

const sum = (rows: Row[], k: keyof Row) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
function totals(rows: Row[]) {
  const measured = rows.filter(r => r.fetchedAt)
  const reach = sum(measured, 'reach'); const interactions = sum(measured, 'interactions')
  return {
    posts: rows.length, measured: measured.length, reach, interactions,
    likes: sum(measured, 'likes'), comments: sum(measured, 'comments'), saves: sum(measured, 'saves'), shares: sum(measured, 'shares'),
    engagementRate: reach > 0 ? interactions / reach : null,
    avgReach: measured.length ? reach / measured.length : null,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 28, 7), 730)
  const platform = url.searchParams.get('platform') // instagram | facebook | null
  let tz = url.searchParams.get('tz') || 'America/New_York'
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { tz = 'America/New_York' }

  const now = Date.now()
  const start = new Date(now - days * 864e5)
  const prevStart = new Date(now - 2 * days * 864e5)

  const posts = await prisma.scheduledPost.findMany({
    where: {
      orgId: gate.orgId, status: 'published', publishedAt: { gte: prevStart },
      ...(platform === 'instagram' || platform === 'facebook' ? { socialAccount: { platform } } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    include: { socialAccount: { select: { platform: true, label: true } }, insights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
  })

  const rows: Row[] = posts.map(p => {
    const s = p.insights[0]
    const plat = p.socialAccount?.platform || ''
    let media: string[] = []; try { media = JSON.parse(p.mediaUrls || '[]') } catch { media = [] }
    const format: Row['format'] = p.placement === 'story' ? 'story' : p.mediaType === 'carousel' ? 'carousel' : p.mediaType === 'video' ? (plat === 'instagram' ? 'reel' : 'video') : 'photo'
    const interactions = s ? s.likes + s.comments + s.saves + s.shares : 0
    return {
      id: p.id, platform: plat, account: p.socialAccount?.label || '', publishedAt: (p.publishedAt || p.scheduledFor).toISOString(),
      format, caption: p.caption.slice(0, 280), thumb: p.mediaType === 'video' || (p.mediaType === 'carousel' && /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(media[0] || '')) ? (p.thumbnailUrl || '') : (media[0] || ''), permalink: p.permalink,
      reach: s?.reach || 0, views: s?.impressions || 0, likes: s?.likes || 0, comments: s?.comments || 0, saves: s?.saves || 0, shares: s?.shares || 0,
      interactions, engagementRate: s && s.reach > 0 ? interactions / s.reach : null, fetchedAt: s ? s.fetchedAt.toISOString() : null,
    }
  })

  const cur = rows.filter(r => new Date(r.publishedAt) >= start)
  const prev = rows.filter(r => new Date(r.publishedAt) < start)

  // Local-time pieces for bucketing (weekday, hour, date) in the viewer's zone.
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
  const local = (iso: string) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
    return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday), hour: Number(parts.hour) % 24, ymd: `${parts.year}-${parts.month}-${parts.day}` }
  }

  // Trend: weekly buckets (Monday start) up to 90 days, monthly beyond. Every
  // bucket in the window is present — a week with no posts is a real zero.
  const monthly = days > 120
  const bucketKey = (ymd: string) => {
    if (monthly) return ymd.slice(0, 7)
    const d = new Date(`${ymd}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow)
    return d.toISOString().slice(0, 10)
  }
  const buckets = new Map<string, { key: string; reach: number; interactions: number; posts: number }>()
  {
    const cursor = new Date(`${local(start.toISOString()).ymd}T12:00:00Z`)
    const endKey = bucketKey(local(new Date(now).toISOString()).ymd)
    for (let i = 0; i < 800; i++) {
      const k = bucketKey(cursor.toISOString().slice(0, 10))
      if (!buckets.has(k)) buckets.set(k, { key: k, reach: 0, interactions: 0, posts: 0 })
      if (k === endKey) break
      if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1); else cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
  }
  for (const r of cur) {
    const b = buckets.get(bucketKey(local(r.publishedAt).ymd)); if (!b) continue
    b.posts++; b.reach += r.reach; b.interactions += r.interactions
  }

  const group = <K extends string>(keyOf: (r: Row) => K, order: K[]) => order.map(k => {
    const rs = cur.filter(r => keyOf(r) === k); const t = totals(rs)
    return { key: k, ...t }
  }).filter(g => g.posts > 0)

  const slotOf = (h: number) => h < 11 ? 'morning' : h < 14 ? 'midday' : h < 18 ? 'afternoon' : 'evening'

  return NextResponse.json({
    days, tz, monthly,
    current: totals(cur), previous: totals(prev),
    trend: Array.from(buckets.values()),
    byPlatform: group(r => r.platform as any, ['instagram', 'facebook']),
    byFormat: group(r => r.format, ['reel', 'photo', 'carousel', 'video', 'story']),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map(d => { const rs = cur.filter(r => local(r.publishedAt).dow === d); return { key: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d], ...totals(rs) } }),
    bySlot: (['morning', 'midday', 'afternoon', 'evening'] as const).map(k => { const rs = cur.filter(r => slotOf(local(r.publishedAt).hour) === k); return { key: k, ...totals(rs) } }),
    posts: cur,
    lastSnapshot: rows.reduce<string | null>((a, r) => (r.fetchedAt && (!a || r.fetchedAt > a) ? r.fetchedAt : a), null),
  })
}
