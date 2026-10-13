import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { orgBaseUrl } from '@/lib/orgDomains'
import { HOW_TO_ORG_SLUG } from '@/lib/howToVideos'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgById } from '@/lib/org'
import { trainingVideo, workerRoles, minutesLabel } from '@/lib/training'

// Video library -> "Send videos": email chosen training videos to Staff Pool people by
// role (refs, scorekeepers, field ops, trainers, assigners) and/or by name (Bo, Oct 13
// 2026). The email links to the Training page inside their login -- there is no file to
// forward -- and watching there is what the library's "Who's watched" counts.
//
// POST { videoIds, roles, workerIds, emails, meCopy, note, preview? }
//   preview -> { count, names, noEmail, newPeople }   send -> { sent, failed, noEmail }
// meCopy adds the sender, so Bo sees exactly what staff get (Oct 13 2026). `emails` are
// typed-in addresses: one that matches a Staff Pool email is that person; anyone else
// isn't on staff yet, so their email leads with the org's staff signup link (/join) --
// the videos only play inside a login -- and the video links work once they've joined.
// Each send is logged in AppSetting `trainingSends` (newest 50) for the library.
// Assigners can send too (Bo, Oct 13 2026), from /dashboard/assigner/videos: staff
// videos only, to the staff groups they run (lib/payScope), and they see only their
// own sends in the log.

type Row = Record<string, unknown>
const LOG = 'trainingSends'

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const director = gate.role === 'admin' || gate.role === 'director'
  if (!director && gate.role !== 'assigner') return NextResponse.json({ error: 'Directors and assigners only' }, { status: 403 })
  const scope = director ? null : await payScopeFor(gate.role, gate.userId)
  const b = await req.json().catch(() => ({} as any))
  const videoIds: string[] = (Array.isArray(b.videoIds) ? b.videoIds : []).map(String).filter((id: string) => trainingVideo(id) && (director || trainingVideo(id)!.series !== 'assigner'))
  const roles: string[] = (Array.isArray(b.roles) ? b.roles : []).map(String)
  const picked = new Set<string>((Array.isArray(b.workerIds) ? b.workerIds : []).map(String))
  const note = String(b.note || '').slice(0, 800).trim()
  const typed: string[] = Array.from(new Set<string>((Array.isArray(b.emails) ? b.emails : []).map((e: unknown) => String(e).trim().toLowerCase())
    .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))).slice(0, 10)
  const myEmail = String(gate.session?.user?.email || '').trim().toLowerCase()
  const myName = String(gate.session?.user?.name || '')
  if (!videoIds.length) return NextResponse.json({ error: 'Pick at least one video.' }, { status: 400 })

  const ws = gate.orgId
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker" WHERE orgId = ?`, gate.orgId)
    : await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker"`)
  const mine = scope ? ws.filter((w: Row) => seesPay(scope, workerPayGroups(w as any))) : ws
  const em = (w: Row) => String(w.email || '').trim().toLowerCase()
  const to = mine.filter((w: Row) => picked.has(String(w.id)) || workerRoles(w).some(r => roles.includes(r)) || typed.includes(em(w)))
    .sort((a: Row, c: Row) => String(a.name).localeCompare(String(c.name)))
  const noEmail = to.filter((w: Row) => !em(w)).map((w: Row) => String(w.name))
  const withEmail: Row[] = to.filter((w: Row) => em(w))
  // The sender's copy, and typed addresses that aren't anyone in the Staff Pool.
  const have = new Set(withEmail.map(em))
  if (b.meCopy && myEmail && !have.has(myEmail)) { withEmail.push({ id: '', name: myName || myEmail, email: myEmail, me: true }); have.add(myEmail) }
  const newPeople = typed.filter(e => !have.has(e) && !ws.some((w: Row) => em(w) === e))
  for (const e of newPeople) withEmail.push({ id: '', name: '', email: e, newPerson: true })
  const label = (w: Row) => w.me ? `${String(w.name)} (you)` : w.newPerson ? String(w.email) : String(w.name)
  if (b.preview) return NextResponse.json({ count: withEmail.length, names: withEmail.map(label), noEmail, newPeople, emailOn: emailEnabled() })
  if (!withEmail.length) return NextResponse.json({ error: 'Nobody with an email matches.' }, { status: 400 })

  // People not on staff yet get the org's staff signup link (same minting as the
  // Staff Pool recruiting link, so it's the one link already in circulation).
  let orgId = gate.orgId as string | null
  if (!orgId) { const r = await prisma.$queryRawUnsafe<Row[]>(`SELECT id FROM "Organization" WHERE slug = ? LIMIT 1`, HOW_TO_ORG_SLUG).catch(() => []); orgId = (r[0]?.id as string) || null }
  const org = await orgById(orgId).catch(() => null)
  let joinUrl = ''
  if (newPeople.length && orgId) {
    const key = `joinCode:${orgId}`
    const existing = await prisma.appSetting.findUnique({ where: { key } })
    let code = existing?.value || ''
    if (!code || code.length > 16) { code = crypto.randomBytes(6).toString('base64url'); await prisma.appSetting.upsert({ where: { key }, update: { value: code }, create: { key, value: code } }) }
    await prisma.appSetting.upsert({ where: { key: `joinCodeMap:${code}` }, update: { value: orgId }, create: { key: `joinCodeMap:${code}`, value: orgId } })
    joinUrl = `${orgBaseUrl((org as any)?.slug, process.env.APP_PUBLIC_URL || 'https://whistleready.app')}/join/${code}`
  }
  const base = 'https://whistleready.app/dashboard/staff/training'
  const vids = videoIds.map(id => trainingVideo(id)!)
  const list = vids.map(v => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><a href="${base}?v=${encodeURIComponent(v.id)}" style="color:#0f766e;font-weight:700;text-decoration:none">${esc(v.title)}</a><br><span style="color:#64748b;font-size:13px">${esc(v.blurb)} · ${minutesLabel(v.secs)}</span></td></tr>`).join('')
  let sent = 0; const failed: string[] = []; const went: { name: string; email: string }[] = []
  const one = async (w: Row) => {
    const first = String(w.name || '').split(/\s+/)[0] || 'there'
    const fresh = !!w.newPerson
    const signup = fresh ? (joinUrl
      ? `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:10px"><p style="margin:0 0 10px;font-weight:700;color:#0f172a">First, create your staff login</p><p style="margin:0 0 12px;font-size:13px;color:#475569">These videos play inside your Whistle Ready login. It takes about two minutes. Use this email address (${esc(String(w.email))}) when you sign up.</p>${button(joinUrl, 'Create my login')}</div>`
      : `<p style="margin:0 0 14px;font-size:13px;color:#475569">These videos play inside a Whistle Ready staff login. Reply to this email and we'll set yours up.</p>`) : ''
    const html = renderEmail({
      orgName: org?.name || 'Sunshine Events Group',
      eyebrow: 'Whistle Ready training',
      title: vids.length === 1 ? 'A training video for you' : `${vids.length} training videos for you`,
      body: `<p style="margin:0 0 10px">Hi ${esc(first)},</p>
        ${note ? `<p style="margin:0 0 14px;white-space:pre-line">${esc(note)}</p>` : `<p style="margin:0 0 14px">Please watch ${vids.length === 1 ? 'this short video' : 'these short videos'} before your next event. Each one is about a minute.</p>`}
        ${signup}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">${list}</table>
        ${fresh ? '' : `<div style="margin-top:22px">${button(`${base}?v=${encodeURIComponent(vids[0].id)}`, vids.length === 1 ? 'Watch it' : 'Start watching')}</div>`}
        <p style="margin:14px 0 0;font-size:12px;color:#64748b">${fresh ? 'Once your login is set up, the links above open each video.' : 'Sign in to Whistle Ready with this email address.'} The videos are inside your login, and we can see when you've watched them.</p>`,
      footerNote: 'Questions? Reply to this email.',
    })
    const text = `Hi ${first},\n\n${note || 'Please watch these short training videos before your next event.'}\n\n` + (fresh && joinUrl ? `First, create your staff login (use this email address): ${joinUrl}\n\n` : '') + vids.map(v => `${v.title}: ${base}?v=${v.id}`).join('\n') + '\n\nSign in to Whistle Ready with this email address.'
    const r = await sendEmail({ to: String(w.email).trim(), subject: vids.length === 1 ? `Training video: ${vids[0].title}` : `${vids.length} Whistle Ready training videos to watch`, html, text, ...orgSender(org as any) })
    if (r.ok) { sent++; went.push({ name: label(w), email: String(w.email).trim() }) } else failed.push(label(w))
  }
  for (let i = 0; i < withEmail.length; i += 8) await Promise.all(withEmail.slice(i, i + 8).map(one))

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LOG } })
    const log = row?.value ? JSON.parse(row.value) : []
    const entry = { at: new Date().toISOString(), by: String(gate.session?.user?.name || gate.session?.user?.email || ''), byUserId: gate.userId || '', videoIds, roles, people: Array.from(picked), emails: typed, meCopy: !!b.meCopy, sent, to: went, failed }
    const value = JSON.stringify([entry, ...(Array.isArray(log) ? log : [])].slice(0, 50))
    await prisma.appSetting.upsert({ where: { key: LOG }, update: { value }, create: { key: LOG, value } })
  } catch { /* the emails went; only the log is lost */ }
  return NextResponse.json({ ok: true, sent, failed, noEmail })
}

export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const director = gate.role === 'admin' || gate.role === 'director'
  if (!director && gate.role !== 'assigner') return NextResponse.json({ error: 'Directors and assigners only' }, { status: 403 })
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LOG } }); const all = row?.value ? JSON.parse(row.value) : []
    return NextResponse.json({ sends: director ? all : (Array.isArray(all) ? all.filter((e: any) => e.byUserId && e.byUserId === gate.userId) : []) })
  } catch { return NextResponse.json({ sends: [] }) }
}
