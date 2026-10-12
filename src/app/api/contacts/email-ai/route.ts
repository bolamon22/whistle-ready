import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { tasksGate } from '@/lib/tasksGate'
import { orgById } from '@/lib/org'
import { LETTER_TONES, type LetterTone } from '@/lib/customLetters'
import { vendorEmailPrompt, EMAIL_TOOL, tidyEmail } from '@/lib/vendorEmailAi'

export const runtime = 'nodejs'

// The vendor email dialog's AI writer (Bo, Oct 12 2026): drafts an email to one
// contact from a description, or rewrites the one on screen. Same switch as the
// contacts and their emails (tasksGate), same model and key as the club letter
// writer. It sends nothing: the draft lands in the dialog, and Bo sends it.
//
// The contact and event details come from the dialog, which already has them;
// they only shape the wording of an email the same person is about to read.
export async function POST(req: Request) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not set up — add ANTHROPIC_API_KEY in Vercel.' }, { status: 503 })
  }
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* validated below */ }
  const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)

  const mode = b.mode === 'rewrite' ? 'rewrite' : 'write'
  const prompt = str(b.prompt, 2000).trim()
  if (!prompt) return NextResponse.json({ error: mode === 'rewrite' ? 'Say what to change.' : 'Describe what the email should say.' }, { status: 400 })
  const subject = str(b.subject, 200)
  const body = str(b.body, 8000)
  if (mode === 'rewrite' && !body.trim()) return NextResponse.json({ error: 'There is no email to rewrite yet.' }, { status: 400 })
  const tone = (LETTER_TONES as readonly string[]).includes(String(b.tone)) ? (String(b.tone) as LetterTone) : ''

  let orgName = ''
  try { orgName = g.orgId ? (await orgById(g.orgId))?.name || '' : '' } catch { /* the email just says less */ }

  const { system, user } = vendorEmailPrompt({
    mode, prompt, tone, subject, body, orgName,
    contactName: str(b.contactName, 120), company: str(b.company, 120), category: str(b.category, 40),
    eventName: str(b.eventName, 160), eventDates: str(b.eventDates, 80), place: str(b.place, 200),
    signer: g.by,
  })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      tools: [EMAIL_TOOL],
      tool_choice: { type: 'tool', name: EMAIL_TOOL.name },
      messages: [{ role: 'user', content: user }],
    })
    const use = res.content.find(block => block.type === 'tool_use') as { input?: unknown } | undefined
    const out = tidyEmail((use?.input || {}) as Record<string, unknown>)
    if (!out.subject || !out.body) return NextResponse.json({ error: 'The AI came back without an email. Try again.' }, { status: 502 })
    return NextResponse.json(out)
  } catch (e) {
    console.error('[email-ai]', (e as Error)?.message || e)
    return NextResponse.json({ error: 'The AI could not write that just now. Try again in a minute.' }, { status: 502 })
  }
}
