import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, getSubmission, updateSubmissionData } from '@/lib/formSubmissions'
import { appBaseUrl, playerPassEnabled } from '@/lib/playerPass'
import { emailEnabled } from '@/lib/email'
import { photoAskRecipients } from '@/lib/photoConsent'
import { photoAskContext, askable, sendPhotoAsk } from '@/lib/photoAskSend'
import { pickStyles } from '@/lib/socialPosts'

// Staff: player cards for social media, and the families' permission to use them
// (lib/photoConsent, lib/photoAskSend).
//   GET   → { players: [...], emailReady } every live player waiver at this event that
//           has a photo, with the permission state.
//   POST  { ids: string[], resend?: boolean } → emails the parent(s) of each picked
//           player a yes/no link now. Players already asked are skipped unless resend;
//           players who already answered are never asked again.
//   POST  { ids, sendAt: ISO } → schedules the same letter; /api/social-photos/cron sends
//           it when the time comes.
//   Sends and schedules take styles?: string[], the example posts the email shows
//   (lib/socialPosts; default all four). A scheduled send keeps them on the waiver.
//   POST  { cancelIds: string[] } → takes those players off the schedule.
//   POST  { moveTo: ISO, moveIds?: string[] } → moves already-scheduled sends to a new time,
//           keeping each one's chosen posts (Bo, Oct 18 2026: a batch set for Monday 8 AM
//           should go Sunday 8 AM, "too many to go back and do"). No moveIds = every
//           scheduled send at this event.
//   POST  { testId } → sends that player's letter to the signed-in staff member only,
//           with a test link: the page works, but nothing answered on it is saved,
//           and the player is not marked as asked.

async function gate(id: string) {
  const g = await requireFeature('tournament_people')
  if (!g.ok) return { res: g.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) }
  if (g.role !== 'admin' && g.orgId && g.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization' }, { status: 403 }) }
  }
  return { g, orgId }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  try {
    const [subs, passOn] = await Promise.all([
      listSubmissions({ orgId: r.orgId, formType: 'player', tournamentId: params.id, sort: 'name', limit: 20000 }),
      playerPassEnabled(r.orgId),
    ])
    const players = subs
      .filter(s => String(s.data?.photoUrl || '').trim())
      .map(s => {
        const d = s.data || {}
        return {
          id: s.id,
          playerName: String(d.playerName || ''),
          clubName: String(d.clubName || ''),
          teamName: String(d.teamName || ''),
          jersey: String(d.jerseyNumber || ''),
          position: String(d.position || ''),
          photoUrl: String(d.photoUrl || ''),
          cardUrl: passOn && s.passToken ? `/pass/${s.passToken}/card.png` : '',
          parentName: String(d.parentName || ''),
          emails: photoAskRecipients(d),
          askAt: String(d.photoAskAt || ''),
          ok: String(d.photoOk || ''),
          okAt: String(d.photoOkAt || ''),
          schedAt: String(d.photoAskSchedAt || ''),
          okName: String(d.photoOkName || ''),
          instagram: String(d.photoIg || ''),
          clubInstagram: String(d.photoClubIg || ''),
          clubFacebook: String(d.photoClubFb || ''),
        }
      })
    return NextResponse.json({ players, emailReady: emailEnabled() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load photos', players: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  const body = await req.json().catch(() => ({})) as any
  const by = String(r.g.session?.user?.email || '')
  const list = (v: unknown): string[] => Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : []

  // Take players off the schedule.
  // Move scheduled sends to another time. Only photoAskSchedAt changes, so the posts
  // picked for each send stay as they were.
  if (body.moveTo) {
    const t = new Date(String(body.moveTo))
    if (isNaN(t.getTime())) return NextResponse.json({ error: 'That send time is not a valid date.' }, { status: 400 })
    if (t.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'That time has already passed. Pick a later one, or send now.' }, { status: 400 })
    if (t.getTime() > Date.now() + 30 * 86_400_000) return NextResponse.json({ error: 'Schedule it within the next 30 days.' }, { status: 400 })
    const only = new Set(list(body.moveIds))
    const subs = await listSubmissions({ orgId: r.orgId, formType: 'player', tournamentId: params.id, limit: 20000 })
    let moved = 0
    for (const s of subs) {
      if (!s.data?.photoAskSchedAt || (only.size && !only.has(s.id))) continue
      await updateSubmissionData(r.orgId, s.id, { photoAskSchedAt: t.toISOString(), photoAskSchedBy: by || String(s.data.photoAskSchedBy || '') }, by || 'staff')
      moved++
    }
    return NextResponse.json({ ok: true, moved, sendAt: t.toISOString() })
  }

  const cancelIds = list(body.cancelIds)
  if (cancelIds.length) {
    let canceled = 0
    for (const id of cancelIds) {
      const s = await getSubmission(r.orgId, id)
      if (!s || String(s.data?.tournamentId || '') !== params.id || !s.data?.photoAskSchedAt) continue
      await updateSubmissionData(r.orgId, id, { photoAskSchedAt: '', photoAskSchedBy: '' }, by || 'staff')
      canceled++
    }
    return NextResponse.json({ ok: true, canceled })
  }

  const testId = String(body.testId || '').trim()
  const ids = testId ? [testId] : list(body.ids)
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one player.' }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: 'That is more than 200 players. Split it up.' }, { status: 400 })
  if (!emailEnabled()) return NextResponse.json({ error: 'Email is not configured, so nothing was sent.' }, { status: 503 })
  if (testId && !by) return NextResponse.json({ error: 'Your login has no email address to send the test to.' }, { status: 400 })
  const resend = body.resend === true
  const styles = pickStyles(body.styles)
  if (Array.isArray(body.styles) && !styles.length) return NextResponse.json({ error: 'Pick at least one post style to show.' }, { status: 400 })

  // A send time: in the future (a minute's grace for a slow click), within 30 days.
  let sendAt = ''
  if (body.sendAt && !testId) {
    const t = new Date(String(body.sendAt))
    if (isNaN(t.getTime())) return NextResponse.json({ error: 'That send time is not a valid date.' }, { status: 400 })
    if (t.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'That send time has already passed. Pick a later one, or send now.' }, { status: 400 })
    if (t.getTime() > Date.now() + 30 * 86_400_000) return NextResponse.json({ error: 'Schedule it within the next 30 days.' }, { status: 400 })
    sendAt = t.toISOString()
  }

  try {
    const ctx = await photoAskContext(r.orgId, params.id, appBaseUrl(req))
    let sent = 0, scheduled = 0
    const skipped: string[] = []
    const errors: string[] = []
    for (const id of ids) {
      const c = await askable(ctx, id, { test: !!testId, resend })
      if (!c.ok) { skipped.push(`${c.name}: ${c.reason}`); continue }
      if (sendAt) {
        await updateSubmissionData(r.orgId, id, { photoAskSchedAt: sendAt, photoAskSchedBy: by, photoAskStyles: styles.join(',') }, by || 'staff')
        scheduled++
        continue
      }
      const res = await sendPhotoAsk(ctx, c.sub, by, testId ? by : undefined, styles)
      if (!res.ok) { errors.push(`${c.name}: ${res.error}`); continue }
      sent++
      if (testId) return NextResponse.json({ ok: true, sent, test: true, to: by, skipped, errors })
    }
    return NextResponse.json({ ok: true, sent, scheduled, sendAt, skipped, errors })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not send' }, { status: 500 })
  }
}
