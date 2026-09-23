import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { orgById } from '@/lib/org'

export const runtime = 'nodejs'
export const maxDuration = 60

// "Write with AI" on the social scheduler. Drafts three caption options (and a
// hashtag set for the first comment) for a post, grounded in what the org
// actually has coming up — upcoming tournaments, dates, locations — and in the
// post's own cover frame, which the model looks at so it can pick up "31 DAYS TO
// GO" or an event name straight off the graphic. Staff-only. Same Anthropic
// wiring as /api/ai/generate.
function absoluteUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://whistleready.app'
  return `${base}${u.startsWith('/') ? '' : '/'}${u}`
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured — add ANTHROPIC_API_KEY in Vercel.' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as any
  const brief: string = String(body.brief || '').slice(0, 1500)
  const current: string = String(body.current || '').slice(0, 2200)
  const platforms: string[] = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ['instagram']
  const mediaType: string = body.mediaType === 'video' ? 'video' : 'image'
  const placement: string = body.placement === 'story' ? 'story' : 'feed'
  const imageUrl: string = typeof body.imageUrl === 'string' ? body.imageUrl : ''

  // Ground it in the org's real calendar. Tournament.orgId is raw SQL (not in the
  // Prisma schema), so this goes through $queryRawUnsafe like src/lib/org.ts does.
  let events = ''
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT name, startDate, endDate, location FROM "Tournament" WHERE orgId = ? AND startDate >= ? ORDER BY startDate ASC LIMIT 8',
      gate.orgId, new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10))
    events = rows.map(r => `- ${r.name}: ${r.startDate}${r.endDate && r.endDate !== r.startDate ? ` to ${r.endDate}` : ''}${r.location ? `, ${r.location}` : ''}`).join('\n')
  } catch { /* fine — just less context */ }
  const org = await orgById(gate.orgId)
  const site = org?.website || 'sunshineeventsgroup.com'

  const both = platforms.includes('instagram') && platforms.includes('facebook')
  const sys = `You are the social media writer for ${org?.name || 'a youth sports tournament organizer'} — a ${org?.name?.toLowerCase().includes('lacrosse') || /lacrosse/i.test(events) ? 'lacrosse' : 'youth sports'} tournament organizer. You write captions that a club director, coach, or lacrosse parent would actually stop for: confident, specific, no filler, no corporate voice.

Upcoming events (real — use these dates/places, never invent others):
${events || '- (none on the calendar)'}
Registration and info: ${site}
Today's date: ${new Date().toISOString().slice(0, 10)}

Rules:
- Return ONLY JSON: {"options":[{"label":"...","caption":"..."},{"label":"...","caption":"..."},{"label":"...","caption":"..."}],"hashtags":"..."}
- Three options with different angles (e.g. urgency/countdown, hype/energy, informational). "label" is 2–4 words naming the angle.
- Captions: 1–4 short lines, line breaks allowed (use \\n). Lead with the hook. Under 300 characters unless the brief asks for long.
- ${placement === 'story' ? 'This is for a Story — captions are NOT shown on Stories, so write text that could be overlaid as a sticker: one punchy line each.' : both ? 'Post goes to Instagram AND Facebook: end with "Link in bio" AND the site URL on its own last line so it works on both.' : platforms.includes('instagram') ? 'Instagram: registration CTA is "Link in bio" (URLs aren\'t clickable in IG captions).' : `Facebook: put the URL ${site} on its own last line.`}
- Only state facts that appear in the events list, the brief, the current caption, or the cover frame. Never invent divisions, age groups, prices, deadlines, caps, or claims like "spots filling up" unless the brief says so. If a detail isn't known, leave it out.
- Spell-check hashtags — a misspelled hashtag reaches nobody.
- No hashtags inside captions. Put 8–15 relevant hashtags in "hashtags" (space-separated, lowercase, mix of lacrosse-wide and Florida/local and event-specific).
- Emoji: at most one, only if it earns its place. American spelling.
- If a current caption is provided, improve it — keep every fact, sharpen the wording.
- Media: this is a ${mediaType === 'video' ? (placement === 'story' ? 'video Story' : 'Reel (video)') : placement === 'story' ? 'Story image' : 'photo post'}.`

  const userParts: Anthropic.MessageParam['content'] = []
  if (imageUrl) {
    try {
      const res = await fetch(absoluteUrl(imageUrl))
      if (res.ok) {
        const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
        if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
          const b64 = Buffer.from(await res.arrayBuffer()).toString('base64')
          userParts.push({ type: 'image', source: { type: 'base64', media_type: mime as any, data: b64 } })
          userParts.push({ type: 'text', text: 'Above is the cover frame of the post. Read any text on it (event name, dates, "days to go", divisions) and use it.' })
        }
      }
    } catch { /* no image — carry on */ }
  }
  userParts.push({ type: 'text', text: [
    brief ? `What this post is about: ${brief}` : 'No brief given — infer the subject from the cover frame and the upcoming events.',
    current ? `Current caption to improve:\n${current}` : '',
  ].filter(Boolean).join('\n\n') })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: sys,
      messages: [{ role: 'user', content: userParts }],
    })
    const text = response.content[0] && response.content[0].type === 'text' ? response.content[0].text : ''
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)
    const options = (Array.isArray(parsed.options) ? parsed.options : []).slice(0, 3).map((o: any) => ({ label: String(o.label || 'Option'), caption: String(o.caption || '').trim() })).filter((o: any) => o.caption)
    if (!options.length) throw new Error('No captions came back — try again')
    return NextResponse.json({ options, hashtags: String(parsed.hashtags || '').trim() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
