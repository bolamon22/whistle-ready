import { NextRequest, NextResponse } from 'next/server'
import { findLoginOnFile, maskEmail, signHint, overLimit } from '@/lib/loginHint'

export const dynamic = 'force-dynamic'

// POST { tournamentId, clubName, clubContact, contactEmail } from the public team
// registration form, signed out. Answers { match: false } or { match: true, masked,
// hint }: the person's login on file under another email (lib/loginHint). Never the
// address itself. Throttled per IP; over the limit it just answers no match.
export async function POST(req: NextRequest) {
  const NO = NextResponse.json({ match: false })
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const tournamentId = String(body.tournamentId || '').trim()
    const clubName = String(body.clubName || '').slice(0, 200)
    const contactName = String(body.clubContact || '').slice(0, 200)
    const email = String(body.contactEmail || '').trim().toLowerCase().slice(0, 200)
    if (!tournamentId || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NO
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
    if (await overLimit(`loginhint:ip:${ip}`, 40, 10 * 60 * 1000)) return NO
    const found = await findLoginOnFile({ tournamentId, clubName, contactName, email })
    if (!found) return NO
    return NextResponse.json({ match: true, masked: maskEmail(found.email), hint: signHint(found.userId) })
  } catch (e) {
    console.error('[login-hint] failed:', e)
    return NO
  }
}
