import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { orgBaseUrl } from '@/lib/orgDomains'
import { HOW_TO_ORG_SLUG } from '@/lib/howToVideos'
import { tournamentOrgId } from '@/lib/org'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { prisma } from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { fieldDirectorSees } from '@/lib/roleScope'
import { rosterWorkerIds } from '@/lib/fieldDirector'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgById } from '@/lib/org'
import { trainingVideo, workerRoles, minutesLabel, trainingLetter, inSendGroup } from '@/lib/training'
import { recordTrainingEmails } from '@/lib/trainingSends'

// Video library -> "Send videos": email chosen training videos to Staff Pool people by
// role (refs, scorekeepers, field ops, trainers, assigners) and/or by name (Bo, Oct 13
// 2026). The email links to the Training page inside their login -- there is no file to
// forward -- and watching there is what the library's "Who's watched" counts.
//
// POST { videoIds, roles, workerIds, emails, meCopy, eventId, everyone, exclude, subject, body, preview? }
//   preview -> { count, names, noEmail, newPeople, people, sample: { to, subject, html } }
//   send    -> { sent, failed, noEmail }
// people: every Staff Pool person the picks match, unticked ones included, so the send
// box can list them with a checkbox each; exclude: the ids unticked there, left out
// whoever picked them (Bo, Oct 14 2026: send to just Nicole, not every athletic trainer).
// subject/body are the message exactly as written in the send box; {firstName} is the
// only thing filled per person. The preview renders the real email for one recipient
// with the same code the send uses, so what Bo sees is what goes out.
// meCopy adds the sender, so Bo sees exactly what staff get (Oct 13 2026). `emails` are
// typed-in addresses: one that matches a Staff Pool email is that person; anyone else
// isn't on staff yet, so their email leads with the org's staff signup link (/join) --
// the videos only play inside a login -- and the video links work once they've joined.
// Each send is logged in AppSetting `trainingSends` (newest 50) for the library, and
// each person it went to (or didn't) in lib/trainingSends for their profile.
// Assigners can send too (Bo, Oct 13 2026), from /dashboard/assigner/videos: staff
// videos only, to the staff groups they run (lib/payScope), and they see only their
// own sends in the log. So can field directors (Oct 13 2026), from
// /dashboard/field-director/videos: staff videos, to the scorekeepers, athletic
// trainers and field ops on their own events (lib/fieldDirector).

type Row = Record<string, unknown>
const LOG = 'trainingSends'

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const director = gate.role === 'admin' || gate.role === 'director'
  const fd = gate.role === 'field_director'
  if (!director && gate.role !== 'assigner' && !fd) return NextResponse.json({ error: 'Directors, assigners and field directors only' }, { status: 403 })
  const scope = director || fd ? null : await payScopeFor(gate.role, gate.userId)
  const b = await req.json().catch(() => ({} as any))
  const videoIds: string[] = (Array.isArray(b.videoIds) ? b.videoIds : []).map(String).filter((id: string) => trainingVideo(id) && (director || !['assigner', 'director', 'scheduler'].includes(trainingVideo(id)!.series || '')))
  const roles: string[] = (Array.isArray(b.roles) ? b.roles : []).map(String)
  const picked = new Set<string>((Array.isArray(b.workerIds) ? b.workerIds : []).map(String))
  const note = String(b.note || '').slice(0, 800).trim() // older clients
  let subjectTpl = String(b.subject || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  let bodyTpl = String(b.body || '').replace(/\r/g, '').trim().slice(0, 4000)
  const typed: string[] = Array.from(new Set<string>((Array.isArray(b.emails) ? b.emails : []).map((e: unknown) => String(e).trim().toLowerCase())
    .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))).slice(0, 10)
  const myEmail = String(gate.session?.user?.email || '').trim().toLowerCase()
  const myName = String(gate.session?.user?.name || '')
  if (!videoIds.length) return NextResponse.json({ error: 'Pick at least one video.' }, { status: 400 })

  // An admin's Staff Pool lists every record, including the few with no organization
  // (older than org scoping), so their sends reach those too. Haylee Lamon's two
  // records had none, and Send on her profile answered "Nobody with an email matches"
  // and sent nothing (Bo, Oct 15 2026). Everyone else stays inside their org.
  const ws = gate.orgId
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker" WHERE orgId = ?${gate.role === 'admin' ? ` OR orgId IS NULL OR orgId = ''` : ''}`, gate.orgId)
    : await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker"`)
  const fdOn = fd && gate.events ? await rosterWorkerIds(gate.events) : null
  const mine = scope ? ws.filter((w: Row) => seesPay(scope, workerPayGroups(w as any)))
    : fd ? ws.filter((w: Row) => fieldDirectorSees(w) && (!fdOn || fdOn.has(String(w.id))))
    : ws
  // An event narrows the role picks to the people on its staff roster. Everyone working
  // it is its own pick (`everyone`): it used to be what an event with no role meant, so
  // Bo's send to Nicole alone, with Monster Mash picked, listed everyone on the event
  // (Oct 14 2026). Named people and typed addresses still go.
  const eventId = String(b.eventId || '')
  let onEvent: Set<string> | null = null; let eventName = ''
  if (eventId) {
    const refused = eventGate(gate, eventId); if (refused) return refused
    if (gate.role !== 'admin' && gate.orgId && (await tournamentOrgId(eventId)) !== gate.orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const rs = await prisma.$queryRawUnsafe<Row[]>(`SELECT workerId FROM "RosterEntry" WHERE tournamentId = ?`, eventId)
    onEvent = new Set(rs.map((r: Row) => String(r.workerId)))
    const t = await prisma.$queryRawUnsafe<Row[]>(`SELECT name FROM "Tournament" WHERE id = ?`, eventId); eventName = String(t[0]?.name || '')
  }
  const everyone = !!b.everyone && !!onEvent
  const hasRole = (w: Row) => { const rs = workerRoles(w); return roles.some(k => inSendGroup(rs, w.gender, k)) }
  const byRole = (w: Row) => onEvent ? onEvent.has(String(w.id)) && (everyone || hasRole(w)) : hasRole(w)
  const em = (w: Row) => String(w.email || '').trim().toLowerCase()
  const matched = mine.filter((w: Row) => picked.has(String(w.id)) || byRole(w) || typed.includes(em(w)))
    .sort((a: Row, c: Row) => String(a.name).localeCompare(String(c.name)))
  const exclude = new Set<string>((Array.isArray(b.exclude) ? b.exclude : []).map(String))
  const to = matched.filter((w: Row) => !exclude.has(String(w.id)))
  const noEmail = to.filter((w: Row) => !em(w)).map((w: Row) => String(w.name))
  const withEmail: Row[] = to.filter((w: Row) => em(w))
  // The sender's copy, and typed addresses that aren't anyone in the Staff Pool.
  const have = new Set(withEmail.map(em))
  if (b.meCopy && myEmail && !have.has(myEmail)) { withEmail.push({ id: '', name: myName || myEmail, email: myEmail, me: true }); have.add(myEmail) }
  const newPeople = typed.filter(e => !have.has(e) && !ws.some((w: Row) => em(w) === e))
  for (const e of newPeople) withEmail.push({ id: '', name: '', email: e, newPerson: true })
  const label = (w: Row) => w.me ? `${String(w.name)} (you)` : w.newPerson ? String(w.email) : String(w.name)
  // People were picked and none of them matched: say so, rather than sending the
  // sender's copy by itself, which looked like the send had worked. A copy with nobody
  // picked is the sender's own test, and still goes.
  const askedFor = picked.size > 0 || roles.length > 0 || typed.length > 0 || !!b.everyone
  if (!b.preview && (!withEmail.length || (askedFor && !withEmail.some((w: Row) => !w.me)))) return NextResponse.json({ error: 'Nobody with an email matches.' }, { status: 400 })

  // People not on staff yet get the org's staff signup link (same minting as the
  // Staff Pool recruiting link, so it's the one link already in circulation). A
  // preview never mints one; it shows where the link goes.
  let orgId = gate.orgId as string | null
  if (!orgId) { const r = await prisma.$queryRawUnsafe<Row[]>(`SELECT id FROM "Organization" WHERE slug = ? LIMIT 1`, HOW_TO_ORG_SLUG).catch(() => []); orgId = (r[0]?.id as string) || null }
  const org = await orgById(orgId).catch(() => null)
  const site = orgBaseUrl((org as any)?.slug, process.env.APP_PUBLIC_URL || 'https://whistleready.app')
  let joinUrl = ''
  if (newPeople.length && orgId && !b.preview) {
    const key = `joinCode:${orgId}`
    const existing = await prisma.appSetting.findUnique({ where: { key } })
    let code = existing?.value || ''
    if (!code || code.length > 16) { code = crypto.randomBytes(6).toString('base64url'); await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } }) }
    await prisma.appSetting.upsert({ where: { key: `joinCodeMap:${code}` }, update: { value: orgId }, create: { key: `joinCodeMap:${code}`, value: orgId } })
    joinUrl = `${site}/join/${code}`
  } else if (newPeople.length && orgId) joinUrl = `${site}/join/your-staff-link`
  const base = 'https://whistleready.app/dashboard/staff/training'
  const vids = videoIds.map(id => trainingVideo(id)!)
  // No message sent (an older screen): the suggested one, with the note if there was one.
  if (!bodyTpl) {
    const d = trainingLetter({ eventName, roles, count: vids.length, sender: myName })
    bodyTpl = note ? `Hi {firstName},\n\n${note}` : d.body
    if (!subjectTpl) subjectTpl = d.subject
  }
  if (!subjectTpl) subjectTpl = vids.length === 1 ? `Training video: ${vids[0].title}` : 'Your Whistle Ready training videos'
  const list = vids.map(v => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><a href="${base}?v=${encodeURIComponent(v.id)}" style="color:#0f766e;font-weight:700;text-decoration:none">${esc(v.title)}</a><br><span style="color:#64748b;font-size:13px">${esc(v.blurb)} · ${minutesLabel(v.secs)}</span></td></tr>`).join('')
  const firstOf = (w: Row) => String(w.name || '').trim().split(/\s+/)[0] || 'there'
  const paras = (txt: string) => txt.split(/\n{2,}/).map(par => `<p style="margin:0 0 14px">${esc(par).replace(/\n/g, '<br>')}</p>`).join('')
  const render = (w: Row, copyOf?: Row) => {
    const fill = (t: string) => t.replace(/\{firstName\}/g, firstOf(w))
    const fresh = !!w.newPerson
    const signup = fresh ? (joinUrl
      ? `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:10px"><p style="margin:0 0 10px;font-weight:700;color:#0f172a">First, create your staff login</p><p style="margin:0 0 12px;font-size:13px;color:#475569">These videos play inside your Whistle Ready login. It takes about two minutes. Use this email address (${esc(String(w.email))}) when you sign up.</p>${button(joinUrl, 'Create my login')}</div>`
      : `<p style="margin:0 0 14px;font-size:13px;color:#475569">These videos play inside a Whistle Ready staff login. Reply to this email and we'll set yours up.</p>`) : ''
    const subject = (copyOf ? 'Copy: ' : '') + fill(subjectTpl)
    // The sender's copy of a send to one person is that person's email, marked as a copy,
    // so it's a record of exactly what they got (Bo, Oct 15 2026: "I didn't get a copy").
    const copyNote = copyOf ? `<p style="margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#f1f5f9;font-size:13px;color:#475569">Your copy. This went to ${esc(String(copyOf.name || ''))} at ${esc(String(copyOf.email || ''))}.</p>` : ''
    const html = renderEmail({
      orgName: org?.name || 'Sunshine Events Group',
      eyebrow: 'Whistle Ready training',
      title: vids.length === 1 ? 'A training video for you' : `${vids.length} training videos for you`,
      body: `${copyNote}${paras(fill(bodyTpl))}
        ${signup}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">${list}</table>
        ${fresh ? '' : `<div style="margin-top:22px">${button(`${base}?v=${encodeURIComponent(vids[0].id)}`, vids.length === 1 ? 'Watch it' : 'Start watching')}</div>`}
        <p style="margin:14px 0 0;font-size:12px;color:#64748b">${fresh ? 'Once your login is set up, the links above open each video.' : 'Sign in to Whistle Ready with this email address.'} The videos are inside your login, and we can see when you've watched them.</p>`,
      footerNote: 'Questions? Reply to this email.',
    })
    const text = (copyOf ? `Your copy. This went to ${String(copyOf.name || '')} at ${String(copyOf.email || '')}.\n\n` : '') + fill(bodyTpl) + '\n\n' + (fresh && joinUrl ? `First, create your staff login (use this email address): ${joinUrl}\n\n` : '') + vids.map(v => `${v.title}: ${base}?v=${v.id}`).join('\n') + '\n\nSign in to Whistle Ready with this email address.'
    return { subject, html, text }
  }
  if (b.preview) {
    const who = withEmail.find(w => !w.me && !w.newPerson) || withEmail[0]
    const sample = who ? { to: label(who), ...render(who), text: undefined } : null
    const people = matched.map((w: Row) => ({ id: String(w.id), name: String(w.name || ''), roles: workerRoles(w), hasEmail: !!em(w) }))
    return NextResponse.json({ count: withEmail.length, names: withEmail.map(label), noEmail, newPeople, people, emailOn: emailEnabled(), sample })
  }
  let sent = 0; const failed: string[] = []; const went: { name: string; email: string }[] = []
  const results: { email: string; workerId: string | null; ok: boolean; error?: string }[] = []
  // The sender's copy reads as the one person's own email when there's one person.
  const recipients = withEmail.filter((w: Row) => !w.me)
  const single = recipients.length === 1 ? recipients[0] : undefined
  let copied = false
  const one = async (w: Row) => {
    const m = w.me && single ? render(single, single) : render(w)
    const r = await sendEmail({ to: String(w.email).trim(), subject: m.subject, html: m.html, text: m.text, ...orgSender(org as any) })
    if (r.ok) { sent++; went.push({ name: label(w), email: String(w.email).trim() }) } else failed.push(label(w))
    if (w.me) copied = r.ok
    else results.push({ email: String(w.email).trim(), workerId: w.id ? String(w.id) : null, ok: r.ok, error: r.error })
  }
  for (let i = 0; i < withEmail.length; i += 8) await Promise.all(withEmail.slice(i, i + 8).map(one))
  const at = new Date().toISOString()
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  try { await recordTrainingEmails(results, { at, by, byUserId: gate.userId || '', videoIds }) }
  catch (e) { console.error('[training/send] record', e) }   // the emails went; only the profile record is lost

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LOG } })
    const log = row?.value ? JSON.parse(row.value) : []
    const entry = { at, by, byUserId: gate.userId || '', videoIds, roles, everyone, people: Array.from(picked), excluded: Array.from(exclude), emails: typed, meCopy: !!b.meCopy, event: eventName, subject: subjectTpl, sent, to: went, failed }
    const value = JSON.stringify([entry, ...(Array.isArray(log) ? log : [])].slice(0, 50))
    await prisma.appSetting.upsert({ where: { key: LOG }, update: { value }, create: { key: LOG, value } })
  } catch { /* the emails went; only the log is lost */ }
  // results: each person and whether it went, so the profile can say exactly what happened.
  return NextResponse.json({ ok: true, sent, failed, noEmail, at, results: results.map(r => ({ email: r.email, ok: r.ok, error: r.ok ? '' : r.error || 'Not sent' })), copied })
}

export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const director = gate.role === 'admin' || gate.role === 'director'
  if (!director && gate.role !== 'assigner' && gate.role !== 'field_director') return NextResponse.json({ error: 'Directors, assigners and field directors only' }, { status: 403 })
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LOG } }); const all = row?.value ? JSON.parse(row.value) : []
    return NextResponse.json({ sends: director ? all : (Array.isArray(all) ? all.filter((e: any) => e.byUserId && e.byUserId === gate.userId) : []) })
  } catch { return NextResponse.json({ sends: [] }) }
}
