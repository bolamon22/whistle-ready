import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { askerName, chirpReply, cleanId, cleanPage, lastQuestion, logStaffQuestion, recentQuestions, staffPrompt, tournamentFacts } from '@/lib/chirp'

export const runtime = 'nodejs'

// Floating Chirp on the tournament dashboard and Assigner. Staff only: the prompt
// carries live tournament data, cut to what the asker's role may see (View as
// included). The prompt itself is built in lib/chirp so every staff Chirp answers
// the same way.
export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables.' },
      { status: 503 }
    )
  }
  try {
    const body = await req.json()
    const tournamentId = cleanId(body.tournamentId)
    const page = cleanPage(body.page)
    const facts = tournamentId ? await tournamentFacts(tournamentId, gate.role) : 'No tournament is open.'
    const system = staffPrompt({ role: gate.role, page, tournamentId, facts, question: recentQuestions(body.messages) })
    const message = await chirpReply(system, body.messages)
    await logStaffQuestion({ tournamentId, role: gate.role, name: askerName(gate.session, gate.role), page, question: lastQuestion(body.messages), answer: message })
    return NextResponse.json({ message })
  } catch (e: unknown) {
    console.error('Chat error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
