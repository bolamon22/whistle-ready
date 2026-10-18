import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { tournamentOrgId, orgById, orgLogoUrl } from '@/lib/org'
import { listSubmissions, getSubmission, updateSubmissionData, ensurePassToken } from '@/lib/formSubmissions'
import { appBaseUrl, playerPassEnabled, orgSiteConfig } from '@/lib/playerPass'
import { sendEmail, orgSender, emailEnabled } from '@/lib/email'
import { absUrl } from '@/lib/emailLayout'
import { orgBaseUrl } from '@/lib/orgDomains'
import { signPhotoToken, photoAskRecipients, photoAskEmail, instagramHandle } from '@/lib/photoConsent'
import { eventDates } from '@/lib/vendorApproval'
import { prisma } from '@/lib/db'

// Staff: player photos for social media, and the families' permission to use them
// (lib/photoConsent).
//   GET   → { players: [...], emailReady } every live player waiver at this event that
//           has a photo, with the permission state.
//   POST  { ids: string[], resend?: boolean } → emails the parent(s) of each picked
//           player a yes/no link. Players already asked are skipped unless resend;
//           players who already answered are never asked again.
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
  const testId = String(body.testId || '').trim()
  const ids: string[] = testId ? [testId] : Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)).filter(Boolean) : []
  if (!ids.length) return NextResponse.json({ error: 'Pick at least one photo.' }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: 'That is more than 200 players. Split it up.' }, { status: 400 })
  if (!emailEnabled()) return NextResponse.json({ error: 'Email is not configured, so nothing was sent.' }, { status: 503 })
  const resend = body.resend === true

  try {
    const [org, t, passOn, site] = await Promise.all([
      orgById(r.orgId),
      prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true, startDate: true, endDate: true } }),
      playerPassEnabled(r.orgId),
      orgSiteConfig(r.orgId),
    ])
    const dates = eventDates(t?.startDate || '', t?.endDate || '')
    const instagram = instagramHandle(site.socials.instagram)
    const appBase = appBaseUrl(req)
    const orgBase = orgBaseUrl(org?.slug)
    const logo = absUrl(orgBase, await orgLogoUrl(org?.id, org?.logoUrl))
    const sender = orgSender(org)
    const orgName = org?.name || 'Sunshine Events Group'
    const tournamentName = t?.name || 'the tournament'
    const by = String(r.g.session?.user?.email || '')
    if (testId && !by) return NextResponse.json({ error: 'Your login has no email address to send the test to.' }, { status: 400 })

    let sent = 0
    const skipped: string[] = []
    const errors: string[] = []
    for (const id of ids) {
      const s = await getSubmission(r.orgId, id)
      const d = s?.data || {}
      const name = String(d.playerName || id)
      if (!s || s.formType !== 'player' || String(d.tournamentId || '') !== params.id || s.archivedAt) { skipped.push(`${name}: not a player at this event`); continue }
      if (!String(d.photoUrl || '').trim()) { skipped.push(`${name}: no photo`); continue }
      if (!testId && (d.photoOk === 'yes' || d.photoOk === 'no')) { skipped.push(`${name}: already answered`); continue }
      if (!testId && d.photoAskAt && !resend) { skipped.push(`${name}: already asked`); continue }
      const to = testId ? [by] : photoAskRecipients(d)
      if (!to.length) { skipped.push(`${name}: no parent email`); continue }

      const token = signPhotoToken({ s: s.id, o: r.orgId, ...(testId ? { x: true } : {}) })
      const link = `${appBase}/pass/photo-ok/${encodeURIComponent(token)}`
      const passToken = passOn ? (s.passToken || await ensurePassToken(r.orgId, s.id)) : null
      const mail = photoAskEmail({
        orgName, logoUrl: logo, tournamentName, dates, instagram,
        parentName: String(d.parentName || ''), playerName: name,
        photoUrl: String(d.photoUrl || ''),
        cardUrl: passToken ? `/pass/${passToken}/card.png` : '',
        link, base: appBase,
      })
      const res = await sendEmail({ ...sender, to, subject: testId ? `[Test] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text })
      if (!res.ok) { errors.push(`${name}: ${res.error || 'send failed'}`); continue }
      sent++
      if (testId) return NextResponse.json({ ok: true, sent, test: true, to: by, skipped, errors })
      await updateSubmissionData(r.orgId, s.id, { photoAskAt: new Date().toISOString(), photoAskBy: by }, by || 'staff')
    }
    return NextResponse.json({ ok: true, sent, skipped, errors })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not send' }, { status: 500 })
  }
}
