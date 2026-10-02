import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { helpArticlesText, helpPagesText, CHIRP_HOWTO_RULES } from '@/lib/helpArticles'

export const runtime = 'nodejs'

// AI help assistant: answers "how do I…" questions about using Whistle Ready, grounded
// in the in-app help articles. Separate from /api/chat (which answers questions
// about a tournament's live data).
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Help assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables.' },
      { status: 503 }
    )
  }
  try {
    const { messages, tournamentId: rawId } = await req.json()
    const tournamentId = typeof rawId === 'string' && /^[A-Za-z0-9_-]+$/.test(rawId) ? rawId : undefined
    const system = `You are Chirp, the friendly in-app help assistant for Whistle Ready (a tournament-management app) for sports event directors and staff. If asked your name, you are Chirp. Keep a warm, can-do tone.

${CHIRP_HOWTO_RULES}

=== PAGES ===
${helpPagesText(tournamentId)}

=== MANUAL ===
${helpArticlesText()}`

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: (messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message: text })
  } catch (e: unknown) {
    console.error('Help chat error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
