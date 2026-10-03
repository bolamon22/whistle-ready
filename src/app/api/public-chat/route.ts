import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { chirpReply, cleanId, cleanPage, lastQuestion, recentQuestions } from '@/lib/chirp'
import { cleanConvoId, logPublicTurn, orgScope, publicPrompt, tournamentScope } from '@/lib/publicChirp'

export const runtime = 'nodejs'

// Public Chirp: coaches, parents, players and visitors, on one tournament's
// public pages (tournamentId) or on the org's own website (orgSlug). Public
// information only; see lib/publicChirp. Questions are logged without names.
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Assistant not configured.' }, { status: 503 })
  }
  try {
    const body = await req.json()
    const tournamentId = cleanId(body.tournamentId)
    const orgSlug = cleanId(body.orgSlug)
    const page = cleanPage(body.page)
    const userTeam = typeof body.userTeam === 'string' ? body.userTeam.trim().slice(0, 60) : ''
    const scope = tournamentId ? await tournamentScope(tournamentId, userTeam) : orgSlug ? await orgScope(orgSlug) : null
    if (!scope) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

    const question = lastQuestion(body.messages)
    const message = await chirpReply(publicPrompt(scope, page, recentQuestions(body.messages)), body.messages)

    // The question list behind Chirp insights (anonymous).
    try {
      const key = `chirpLog:${scope.key}`
      const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
      let log: any[] = []
      try { log = JSON.parse((row as any)?.value || '[]'); if (!Array.isArray(log)) log = [] } catch {}
      if (question) log.push({ q: question, at: Date.now(), team: userTeam || undefined, page: page || undefined })
      if (log.length > 500) log = log.slice(-500)
      await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(log) }, update: { value: JSON.stringify(log) } })
    } catch (e) { console.error('chirp log error:', e) }
    // The whole conversation, emailed to the organizer when the chat closes.
    await logPublicTurn(scope.key, cleanConvoId(body.convoId), { q: question, a: message, page, team: userTeam })

    return NextResponse.json({ message })
  } catch (e: unknown) {
    console.error('public-chat error:', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
