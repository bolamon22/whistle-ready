import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { askerName, chirpReply, cleanId, cleanPage, lastQuestion, logStaffQuestion, staffPrompt } from '@/lib/chirp'

export const runtime = 'nodejs'

// Help & support → Ask Chirp: "how do I…" questions, answered from the manual
// pages the asker's role can use. No live data. Signed-in staff only, so the
// answer can be cut to the role and the question logged for Chirp insights.
export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Help assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables.' },
      { status: 503 }
    )
  }
  try {
    const body = await req.json()
    const tournamentId = cleanId(body.tournamentId)
    const page = cleanPage(body.page)
    const system = staffPrompt({ role: gate.role, page, tournamentId })
    const message = await chirpReply(system, body.messages)
    await logStaffQuestion({ tournamentId, role: gate.role, name: askerName(gate.session, gate.role), page, question: lastQuestion(body.messages), answer: message })
    return NextResponse.json({ message })
  } catch (e: unknown) {
    console.error('Help chat error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
