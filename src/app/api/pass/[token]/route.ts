import { NextRequest, NextResponse } from 'next/server'
import { getSubmissionByPassToken, updateSubmissionData } from '@/lib/formSubmissions'
import { cleanCardLink, playerPassEnabled } from '@/lib/playerPass'

export const runtime = 'nodejs'

// POST /api/pass/<token> { photoUrl?, cardLink? } — the family edits their own player card.
// No login: holding the token (only they have it) is the authorization, same as the page.
//   photoUrl: '' to remove, or a /api/img/<id> URL from /api/upload (nothing off-site).
//   cardLink: '' to clear, or an http(s) link the QR code should open.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const sub = await getSubmissionByPassToken(params.token)
  if (!sub || sub.formType !== 'player' || !(await playerPassEnabled(sub.orgId))) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }
  const body = await req.json().catch(() => ({})) as any
  const changes: Record<string, string> = {}
  if ('photoUrl' in body) {
    const u = String(body.photoUrl || '').trim()
    if (u && !/^\/api\/img\/[A-Za-z0-9_-]+$/.test(u)) return NextResponse.json({ error: 'Please upload the photo here rather than linking one' }, { status: 400 })
    changes.photoUrl = u
  }
  if ('cardLink' in body) {
    const raw = String(body.cardLink || '').trim()
    const u = cleanCardLink(raw)
    if (raw && !u) return NextResponse.json({ error: 'That link doesn’t look right — try the full address, like https://youtube.com/…' }, { status: 400 })
    changes.cardLink = u
  }
  if (!Object.keys(changes).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  const updated = await updateSubmissionData(sub.orgId, sub.id, changes, 'family (card page)')
  return NextResponse.json({ ok: true, photoUrl: String(updated?.data?.photoUrl || ''), cardLink: String(updated?.data?.cardLink || '') })
}
