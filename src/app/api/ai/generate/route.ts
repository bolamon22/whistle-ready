import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

// Drafts public event-page copy from a short prompt. Staff-only.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Sign in to use AI.' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured — add ANTHROPIC_API_KEY in Vercel.' }, { status: 503 })
  }
  try {
    const { prompt, tournamentId, kind, current } = await req.json()
    if (!prompt || !String(prompt).trim()) return NextResponse.json({ error: 'Describe what to write.' }, { status: 400 })

    let ctx = ''
    if (tournamentId) {
      try {
        const t = await prisma.tournament.findUnique({ where: { id: tournamentId } })
        if (t) {
          const dates = (() => { try { return JSON.parse((t as any).dates || '[]') } catch { return [] } })()
          ctx = `This is for the public event website of "${t.name}"${(t as any).location ? `, held at ${(t as any).location}` : ''}${dates.length ? `, on ${dates.join(', ')}` : ''}.`
        }
      } catch { /* ignore */ }
    }

    const sys = `You write clear, friendly, concise public-facing copy for a youth/amateur sports tournament's event website. ${ctx}
Rules:
- Output ONLY the content itself — no preamble, no "Here is", no closing remarks.
- Use simple Markdown only: ## sub-headings, **bold**, and "- " bullet lists. Keep it scannable.
- Warm and welcoming to parents, players, and coaches. Keep it tight.
- When given a current draft to revise, KEEP every piece of information — only improve wording, structure, and formatting; never drop details.${kind === 'faq' ? '\n- This is an FAQ answer: answer the question directly in 1-3 short sentences or a short bullet list.' : ''}`

    const hasCurrent = current && String(current).trim()
    const userContent = hasCurrent
      ? `Here is the current draft:\n\n${String(current).slice(0, 8000)}\n\n---\nApply this instruction and return the COMPLETE revised version: ${String(prompt)}`
      : String(prompt)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: sys,
      messages: [{ role: 'user', content: userContent }],
    })
    const text = response.content[0] && response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ text: text.trim() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
