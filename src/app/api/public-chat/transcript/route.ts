import { NextRequest, NextResponse } from 'next/server'
import { cleanId } from '@/lib/chirp'
import { cleanConvoId, emailTranscript, orgScope, tournamentScope } from '@/lib/publicChirp'

export const runtime = 'nodejs'

// The public Chirp calls this (navigator.sendBeacon) when a visitor closes the
// chat, clears it or leaves the page. It emails the organizer the part of that
// conversation not yet sent. The email is built from the server's own log, so
// this endpoint can't be used to send arbitrary mail; a daily cap per site
// limits abuse.
export async function POST(req: NextRequest) {
  try {
    const body = JSON.parse((await req.text()) || '{}')
    const convoId = cleanConvoId(body.convoId)
    if (!convoId) return NextResponse.json({ ok: false }, { status: 400 })
    const tournamentId = cleanId(body.tournamentId), orgSlug = cleanId(body.orgSlug)
    const scope = tournamentId ? await tournamentScope(tournamentId) : orgSlug ? await orgScope(orgSlug) : null
    if (!scope) return NextResponse.json({ ok: false }, { status: 404 })
    const r = await emailTranscript(scope, convoId)
    return NextResponse.json(r)
  } catch (e) {
    console.error('chirp transcript error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
