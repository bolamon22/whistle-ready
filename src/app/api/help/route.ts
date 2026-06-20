import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { helpArticlesText } from '@/lib/helpArticles'

export const runtime = 'nodejs'

// AI help assistant: answers "how do I…" questions about using GameDay, grounded
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
    const { messages } = await req.json()
    const system = `You are Snap, the friendly in-app help assistant for GameDay (also called Whistle Ready), a tournament-management app for sports event directors and staff. If asked your name, you are Snap. Keep a warm, can-do tone.

Answer the user's "how do I…" questions about USING the app, based on the documentation below. Be concise and practical: give short, numbered steps and name the exact menus/buttons (e.g. "Setup → Scheduler", "Save Changes"). If the docs don't cover something, say so briefly and suggest contacting support. Do not invent features that aren't in the docs.

=== DOCUMENTATION ===
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
