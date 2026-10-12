import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { orgForTournament } from '@/lib/org'
import { COMM_KINDS } from '@/lib/commLetters'
import { fmtRangeShort, shortLocation } from '@/lib/eventHero'
import { asLetterButton, LETTER_TONES, unknownFields, type LetterTone } from '@/lib/customLetters'
import { letterAiPrompt, LETTER_TOOL, tidyLetter, droppedFields, fixFieldsNote } from '@/lib/letterAi'

export const runtime = 'nodejs'

// The Email clubs dialog's AI writer (Bo, Oct 12 2026): drafts a new club letter
// from a description, or rewrites the letter on screen. Staff only, same model and
// key as the event page builder's "Generate with AI". It sends nothing: the draft
// lands in the editor, and the preview and test copy work on it as on any letter.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI is not set up — add ANTHROPIC_API_KEY in Vercel.' }, { status: 503 })
  }
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* validated below */ }

  const mode = b.mode === 'rewrite' ? 'rewrite' : 'write'
  const prompt = String(b.prompt ?? '').trim().slice(0, 2000)
  if (!prompt) return NextResponse.json({ error: mode === 'rewrite' ? 'Say what to change.' : 'Describe what the email should say.' }, { status: 400 })
  const kind = String(b.kind ?? 'custom')
  if (kind !== 'payment' && kind !== 'custom' && !(kind in COMM_KINDS)) {
    return NextResponse.json({ error: 'Unknown letter' }, { status: 400 })
  }
  const button = kind === 'custom' ? asLetterButton(b.button) : undefined
  const tone = (LETTER_TONES as readonly string[]).includes(String(b.tone)) ? (String(b.tone) as LetterTone) : ''
  const subject = String(b.subject ?? '').slice(0, 200)
  const body = String(b.body ?? '').slice(0, 4000)
  if (mode === 'rewrite' && !body.trim()) return NextResponse.json({ error: 'There is no letter to rewrite yet.' }, { status: 400 })

  const tournamentId = String(b.tournamentId ?? '')
  let t: { name: string; sport: string; startDate: string; endDate: string; location: string } | null = null
  if (tournamentId) {
    try {
      t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, sport: true, startDate: true, endDate: true, location: true } })
    } catch { /* the letter just knows less about the event */ }
  }
  let orgName = ''
  try { orgName = tournamentId ? (await orgForTournament(tournamentId))?.name || '' : '' } catch { /* same */ }

  const { system, user } = letterAiPrompt({
    mode, prompt, tone, kind, button, subject, body, orgName,
    eventName: t?.name || '',
    eventDates: t?.startDate ? fmtRangeShort(t.startDate, t.endDate || '') : '',
    eventPlace: shortLocation(t?.location || ''),
    sport: t?.sport || '',
  })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const ask = (messages: Anthropic.MessageParam[]) => client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      tools: [LETTER_TOOL],
      tool_choice: { type: 'tool', name: LETTER_TOOL.name },
      messages,
    })
    type ToolUse = { id?: string; input?: unknown }
    const toolUse = (r: Anthropic.Message) => r.content.find(block => block.type === 'tool_use') as ToolUse | undefined
    const pay = kind === 'payment' || button === 'pay'
    const unknownIn = (l: { subject: string; body: string }) => unknownFields(`${l.subject}\n${l.body}`, pay)

    const first: Anthropic.MessageParam[] = [{ role: 'user', content: user }]
    const use = toolUse(await ask(first))
    let out = tidyLetter((use?.input || {}) as Record<string, unknown>)
    if (!out.subject || !out.body) return NextResponse.json({ error: 'The AI came back without a letter. Try again.' }, { status: 502 })
    let unknown = unknownIn(out)
    // A field the merge can't fill would reach every club as typed, so the model
    // gets one turn to fix its own letter before anyone sees it. The better of the
    // two drafts is kept; if the retry fails, the first one still comes back with
    // its fields flagged.
    if (unknown.length && use?.id) {
      try {
        const fix = toolUse(await ask([
          ...first,
          { role: 'assistant', content: [{ type: 'tool_use', id: use.id, name: LETTER_TOOL.name, input: use.input ?? {} }] },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, is_error: true, content: fixFieldsNote(unknown) }] },
        ]))
        const again = tidyLetter((fix?.input || {}) as Record<string, unknown>)
        if (again.subject && again.body && unknownIn(again).length < unknown.length) {
          out = again
          unknown = unknownIn(again)
        }
      } catch (e) {
        console.error('[comm-ai] field fix', (e as Error)?.message || e)
      }
    }
    return NextResponse.json({
      ...out,
      // Shown under the letter, and the dialog won't send while any are there.
      unknown,
      dropped: mode === 'rewrite' ? droppedFields(`${subject}\n${body}`, `${out.subject}\n${out.body}`) : [],
    })
  } catch (e) {
    console.error('[comm-ai]', (e as Error)?.message || e)
    return NextResponse.json({ error: 'The AI could not write that just now. Try again in a minute.' }, { status: 502 })
  }
}
