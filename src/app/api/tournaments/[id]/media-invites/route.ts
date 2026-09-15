import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId, orgById, orgLogoUrl } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'
import { eventDates } from '@/lib/vendorApproval'
import { sendEmail, orgSender, emailEnabled } from '@/lib/email'
import { renderEmail, button, absUrl, esc } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetter'
import {
  MEDIA_INVITE_TEMPLATES, MEDIA_INVITE_DEFAULT, mergeMediaInvite, mediaApplyUrl,
  dedupeInvitees, inviteeGreeting, type MediaInvitee,
} from '@/lib/mediaInvite'
import { prisma } from '@/lib/db'

// Staff: invite photographers and content creators to shoot THIS tournament.
//
// Mirrors the returning-teams invite in shape -- pick a letter, pick a list, send
// -- but the link goes to the media application rather than registration, and it
// carries the event and the person so they don't retype what we just used to
// address them.
//
// Two things are remembered per org, both in AppSetting because both are a
// handful of rows nobody queries across:
//   mediaInviteLetters:{orgId}              edits to the letters, so they stick
//   mediaInvites:{orgId}:{tournamentId}     who was already asked, so nobody is
//                                           asked twice and Bo can see the list

const LETTERS_KEY = (orgId: string) => `mediaInviteLetters:${orgId}`
const SENT_KEY = (orgId: string, tid: string) => `mediaInvites:${orgId}:${tid}`

type SentInvite = { email: string; name: string; business: string; at: string; by: string; template: string }

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    if (!row?.value) return fallback
    const v = JSON.parse(row.value)
    return (v ?? fallback) as T
  } catch { return fallback }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value)
  await prisma.appSetting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
}

async function gateForTournament(id: string) {
  const gate = await requireStaff()
  if (!gate.ok) return { res: gate.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) }
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization' }, { status: 403 }) }
  }
  return { gate, orgId }
}

/** Everything the page needs to compose a letter without a second round trip. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  try {
    const [org, t, letters, invites] = await Promise.all([
      orgById(g.orgId),
      prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true, startDate: true, endDate: true } }),
      readJson<Record<string, { subject?: string; body?: string }>>(LETTERS_KEY(g.orgId), {}),
      readJson<SentInvite[]>(SENT_KEY(g.orgId, params.id), []),
    ])
    const base = orgBaseUrl(org?.slug)
    return NextResponse.json({
      orgName: org?.name || '',
      tournamentName: t?.name || 'Tournament',
      dates: eventDates(t?.startDate || '', t?.endDate || ''),
      applyBase: base,
      galleryUrl: `${base}/gallery`,
      letters,
      invites: Array.isArray(invites) ? invites : [],
      emailReady: emailEnabled(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load invites' }, { status: 500 })
  }
}

/**
 * Send one letter to a list of people.
 *
 * Addresses already invited for this event are skipped rather than mailed again
 * -- the person composing has no way to remember who they asked three weeks ago,
 * and a second identical invite reads as a mass mailing, which is the opposite of
 * what this letter is for. `resend: true` overrides that deliberately.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any

  const templateKey = String(body.template || MEDIA_INVITE_DEFAULT.key)
  const tpl = MEDIA_INVITE_TEMPLATES.find(t => t.key === templateKey) || MEDIA_INVITE_DEFAULT
  const subjectTpl = String(body.subject ?? tpl.subject)
  const bodyTpl = String(body.body ?? tpl.body)
  if (!subjectTpl.trim() || !bodyTpl.trim()) {
    return NextResponse.json({ error: 'The letter needs a subject and a body.' }, { status: 400 })
  }

  const people = dedupeInvitees(Array.isArray(body.to) ? body.to as MediaInvitee[] : [])
  if (!people.length) return NextResponse.json({ error: 'No usable email addresses.' }, { status: 400 })
  if (people.length > 100) return NextResponse.json({ error: 'That is more than 100 addresses — split it up.' }, { status: 400 })

  if (!emailEnabled()) {
    return NextResponse.json({ error: 'Email is not configured, so nothing was sent. Copy the letter and send it yourself.' }, { status: 503 })
  }

  try {
    const [org, t, already] = await Promise.all([
      orgById(g.orgId),
      prisma.tournament.findUnique({ where: { id: params.id }, select: { name: true, startDate: true, endDate: true } }),
      readJson<SentInvite[]>(SENT_KEY(g.orgId, params.id), []),
    ])
    const invites: SentInvite[] = Array.isArray(already) ? already : []
    const seen = new Set(invites.map(i => String(i.email || '').toLowerCase()))

    const resend = body.resend === true
    const targets = resend ? people : people.filter(p => !seen.has(p.email))
    const skipped = people.length - targets.length
    if (!targets.length) {
      return NextResponse.json({ ok: true, sent: 0, skipped, errors: [], note: 'Everyone on that list has already been invited to this event.' })
    }

    const base = orgBaseUrl(org?.slug)
    const orgName = org?.name || ''
    const sender = orgSender(org)
    const logo = absUrl(base, await orgLogoUrl(org?.id, org?.logoUrl))
    const shared = {
      orgName,
      tournamentName: t?.name || 'Tournament',
      dates: eventDates(t?.startDate || '', t?.endDate || ''),
      galleryUrl: `${base}/gallery`,
    }

    let sent = 0
    const errors: string[] = []
    const now = new Date().toISOString()
    const by = String(g.gate.session?.user?.email || '')

    for (const p of targets) {
      // Each letter gets that person's own pre-filled link, so the merge has to
      // happen per recipient rather than once for the batch.
      const applyUrl = mediaApplyUrl(base, params.id, { name: p.name, business: p.business, email: p.email })
      const vars = { ...shared, name: inviteeGreeting(p), business: p.business || '', applyUrl }
      const subject = mergeMediaInvite(subjectTpl, vars)
      const merged = mergeMediaInvite(bodyTpl, vars)

      // The letter already contains the apply URL as a line of text, which is
      // what someone copying this into their own mail client would send. In the
      // rendered email that bare line is redundant next to a real button, so it
      // comes out and the button goes in.
      const withoutBareLink = merged.split('\n')
        .filter(line => line.trim() !== applyUrl)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      const html = renderEmail({
        orgName, logoUrl: logo, eyebrow: 'Media credential',
        title: shared.tournamentName,
        body: `${letterBodyHtml(withoutBareLink)}${button(applyUrl, 'Apply for your credential')}<p style="margin:10px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">${esc(applyUrl)}</p>`,
        footerNote: `You were invited to shoot ${esc(shared.tournamentName)} by ${esc(orgName)}.`,
      })

      const res = await sendEmail({ ...sender, to: p.email, subject, html })
      if (res.ok) {
        sent++
        invites.push({ email: p.email, name: p.name || '', business: p.business || '', at: now, by, template: tpl.key })
      } else {
        errors.push(`${p.email}: ${res.error || 'send failed'}`)
      }
    }

    // Record who was asked, and remember any edit to the letter, so the next
    // event starts from the wording that worked rather than the shipped default.
    if (sent) { try { await writeJson(SENT_KEY(g.orgId, params.id), invites) } catch { /* the mail went; the log is a nicety */ } }
    if (body.saveLetter === true) {
      try {
        const letters = await readJson<Record<string, { subject: string; body: string }>>(LETTERS_KEY(g.orgId), {})
        letters[tpl.key] = { subject: subjectTpl, body: bodyTpl }
        await writeJson(LETTERS_KEY(g.orgId), letters)
      } catch { /* same */ }
    }

    return NextResponse.json({ ok: true, sent, skipped, errors, invites })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not send those invites' }, { status: 500 })
  }
}
