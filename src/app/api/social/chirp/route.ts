import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { orgById } from '@/lib/org'
import { loadIdeaEvents, shiftDays } from '@/lib/socialIdeasServer'

export const runtime = 'nodejs'
export const maxDuration = 60

// Ask Chirp — the brainstorm chat on the social scheduler. Bo types a rough idea
// ("something for Halloween week that also pushes Jingle Brawl") and Chirp comes
// back with a short answer plus 1–5 concrete post ideas that open straight into
// Compose. Staff only.
//
// Chirp knows: the org's upcoming tournaments (with last year's team counts),
// what's already scheduled, which days are open, and which recent posts reached
// the most people. With `web: true` it can also search the internet (Anthropic's
// server-side web search tool, capped at 3 searches a question) for current
// events — this weekend's games, local happenings — and cites what it used.
//
// Web search has to be switched on once for the org in the Claude Console
// (Settings → Privacy). If it's off, the request is retried without the tool and
// the reply says so, so the chat still works.
//
// Cost: $10 per 1,000 searches plus tokens — about a cent or two a question.

const MODEL = process.env.CHIRP_SOCIAL_MODEL || 'claude-haiku-4-5-20251001'
const SEARCH_FALLBACK_MODEL = process.env.CHIRP_SEARCH_MODEL || 'claude-sonnet-4-5'
type Msg = { role: 'user' | 'assistant'; content: string }
type Source = { url: string; title: string }
type Snap = { reach: number; likes: number; comments: number; saves: number; shares: number }
type PostRow = { scheduledFor: Date; publishedAt?: Date | null; caption: string; status?: string; mediaType: string; placement: string; socialAccount: { platform: string } | null; insights?: Snap[] }

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured — add ANTHROPIC_API_KEY in Vercel.' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as any
  const messages: Msg[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
    .slice(-12)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Ask Chirp something first' }, { status: 400 })
  while (messages[0]?.role !== 'user') messages.shift() // the API wants the thread to open with the user
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today || '')) ? String(body.today) : new Date().toISOString().slice(0, 10)
  const web = body.web !== false
  const tz = Number.isFinite(Number(body.tz)) ? Number(body.tz) : 240 // minutes behind UTC, from the browser
  const localDay = (d: Date) => new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10)

  const orgId = gate.orgId
  const [org, events, upcomingRaw, recentRaw] = await Promise.all([
    orgById(orgId),
    loadIdeaEvents(orgId).catch(() => []),
    prisma.scheduledPost.findMany({
      where: { orgId, status: { notIn: ['canceled'] }, scheduledFor: { gte: new Date(), lte: new Date(Date.now() + 45 * 864e5) } },
      orderBy: { scheduledFor: 'asc' }, take: 40,
      select: { scheduledFor: true, caption: true, status: true, mediaType: true, placement: true, socialAccount: { select: { platform: true } } },
    }).catch(() => []),
    prisma.scheduledPost.findMany({
      where: { orgId, status: 'published', publishedAt: { gte: new Date(Date.now() - 120 * 864e5) } },
      select: { publishedAt: true, caption: true, mediaType: true, placement: true, socialAccount: { select: { platform: true } }, insights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
    }).catch(() => []),
  ])
  const upcoming = upcomingRaw as PostRow[]
  const recent = (recentRaw as (PostRow & { insights: Snap[] })[])
  const site = (org?.website || 'sunshineeventsgroup.com').replace(/^https?:\/\//, '').replace(/\/$/, '')

  const line = (s: string) => (s || '').split('\n').find(l => l.trim())?.trim().slice(0, 90) || '(no caption)'
  const kind = (p: { mediaType: string; placement: string; socialAccount?: { platform: string } | null }) => p.placement === 'story' ? 'Story' : p.mediaType === 'video' ? (p.socialAccount?.platform === 'instagram' ? 'Reel' : 'Video') : 'Photo'
  // Days are computed on the viewer's calendar (today comes from the browser).
  const taken = new Set(upcoming.map(p => localDay(p.scheduledFor)))
  const open: string[] = []; for (let i = 0; i < 21; i++) { const d = shiftDays(today, i); if (!taken.has(d)) open.push(d) }
  const withData = recent.filter(p => p.insights[0])
  const top = [...withData].sort((a, b) => (b.insights[0]!.reach) - (a.insights[0]!.reach)).slice(0, 6)

  const system = `You are Chirp, the social media brainstorm partner inside Whistle Ready for ${org?.name || 'a youth lacrosse tournament organizer'}. You help the director come up with Instagram and Facebook post ideas. Be warm, quick and specific — a sharp coworker, not a marketing textbook.

Today is ${today}. Registration and info: ${site}

UPCOMING EVENTS (real — never invent others, never change these dates):
${events.map(e => `- ${e.name}: ${e.start}${e.end !== e.start ? ` to ${e.end}` : ''}${e.location ? `, ${e.location}` : ''}${e.lastYearTeams ? ` (${e.lastYearTeams} teams last year)` : ''}${e.divisions.length ? `; divisions: ${e.divisions.slice(0, 12).join(', ')}` : ''}`).join('\n') || '- (none on the calendar)'}

ALREADY SCHEDULED (next 45 days):
${upcoming.map(p => `- ${localDay(p.scheduledFor)} · ${p.socialAccount?.platform || ''} ${kind(p)} · ${p.status} · "${line(p.caption)}"`).join('\n') || '- nothing yet'}

OPEN DAYS (next 3 weeks, no post yet): ${open.join(', ') || 'none'}

BEST RECENT POSTS by reach (${withData.length} posts with data in the last 120 days — a small sample, say so if you lean on it):
${top.map(p => `- ${p.publishedAt ? localDay(p.publishedAt) : ''} ${p.socialAccount?.platform || ''} ${kind(p)}: reach ${p.insights[0]!.reach}, interactions ${p.insights[0]!.likes + p.insights[0]!.comments + p.insights[0]!.saves + p.insights[0]!.shares} · "${line(p.caption)}"`).join('\n') || '- no insight data yet'}

HOUSE RULES:
- Audiences: clubs (club directors & coaches — they register teams), players, parents (they book hotels and plan the weekend), all.
- Formats the scheduler can publish: Photo, Reel (video), Story. It can't publish multi-slide carousels yet — suggest one combined graphic or a short Reel instead.
- Never use deadline, discount, "spots filling up" or early-bird urgency. Use field-composition wording ("the bracket is taking shape") instead.
- Registration CTA points to ${site}.
- Only state facts you were given or found and cited. Never invent game times, scores, divisions, prices or team counts. Say when you're unsure.
- Nothing publishes from your ideas — the director drafts, adds media and approves.
${web ? `- You can search the web. Use it only when current information would change the idea (this week's games, a holiday, local events, lacrosse news). Prefer Florida and lacrosse sources. Mention the date of anything time-sensitive.` : '- Web search is off for this question. Work from what you know and the data above; say so if something needs checking.'}

REPLY FORMAT:
1. A short conversational answer (under 120 words). No headings.
2. If you're suggesting posts, end with a fenced block exactly like:
\`\`\`ideas
[{"title":"…","date":"YYYY-MM-DD","event":"event name or empty","aud":"clubs|players|parents|all","fmt":"Photo|Reel|Story","why":"one or two sentences","hook":"the first line / sticker text","shots":["what to shoot or pull"],"cap":"starter caption, or empty for a Story"}]
\`\`\`
Give 1–5 ideas. Put each on a sensible day — prefer the open days above, never a past date. If the director only asked a question, you can skip the block.`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const tools: any[] = web ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', city: 'West Palm Beach', region: 'Florida', country: 'US', timezone: 'America/New_York' } }] : []

  async function run(model: string, withTools: boolean) {
    const thread: any[] = messages.map(m => ({ role: m.role, content: m.content }))
    const blocks: any[] = []
    // A turn that uses server tools can come back paused; hand it back to finish.
    for (let hop = 0; hop < 3; hop++) {
      const res = await client.messages.create({ model, max_tokens: 1800, system, messages: thread, ...(withTools ? { tools } : {}) })
      blocks.push(...res.content)
      if (res.stop_reason !== 'pause_turn') break
      thread.push({ role: 'assistant', content: res.content })
    }
    return blocks
  }

  let blocks: any[] = []
  let note = ''
  const OFF_NOTE = 'Web search is switched off for this account — turn it on in the Claude Console (Settings → Privacy) to let Chirp look things up. This answer is from what it already knows.'
  const FAIL_NOTE = "Chirp couldn't search the web just now, so this answer is from what it already knows."
  try {
    blocks = await run(MODEL, web)
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (!web) return NextResponse.json({ error: msg || 'AI error' }, { status: 500 })
    console.error('Ask Chirp: web search attempt failed —', msg)
    try {
      // Model doesn't take the search tool → try the search model; otherwise
      // (search off for the org, a hiccup) answer without searching.
      if (/not supported|does not support|unsupported/i.test(msg)) {
        try { blocks = await run(SEARCH_FALLBACK_MODEL, true) }
        catch { blocks = await run(MODEL, false); note = FAIL_NOTE }
      } else {
        blocks = await run(MODEL, false)
        note = /enable|disabled|not enabled|permission|privacy/i.test(msg) ? OFF_NOTE : FAIL_NOTE
      }
    } catch (e2: any) { return NextResponse.json({ error: e2?.message || 'AI error' }, { status: 500 }) }
  }

  // Text + the web pages it cited. Search results themselves stay server-side.
  let text = ''
  const sources: Source[] = []
  let searches = 0
  for (const b of blocks) {
    if (b.type === 'server_tool_use' && b.name === 'web_search') searches++
    if (b.type !== 'text') continue
    text += b.text
    for (const c of b.citations || []) if (c.url && !sources.some(s => s.url === c.url)) sources.push({ url: c.url, title: String(c.title || c.url).slice(0, 120) })
  }
  let ideas: any[] = []
  const m = text.match(/```ideas\s*([\s\S]*?)```/)
  if (m) {
    try { const arr = JSON.parse(m[1]); if (Array.isArray(arr)) ideas = arr.slice(0, 5) } catch { /* show the prose anyway */ }
    text = text.replace(m[0], '').trim()
  }
  return NextResponse.json({ text: text.trim(), ideas, sources: sources.slice(0, 8), searches, note, raw: [text.trim(), ideas.length ? '```ideas\n' + JSON.stringify(ideas) + '\n```' : ''].filter(Boolean).join('\n\n') })
}
