import { NextRequest, NextResponse } from 'next/server'
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
// POST { videoIds, roles, workerIds, note, preview? }
//   preview -> { count, names, noEmail }   send -> { sent, failed, noEmail }
// Each send is logged in AppSetting `trainingSends` (newest 50) for the library.

type Row = Record<string, unknown>
const LOG = 'trainingSends'

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (gate.role !== 'admin' && gate.role !== 'director') return NextResponse.json({ error: 'Directors only' }, { status: 403 })
  const b = await req.json().catch(() => ({} as any))
  const videoIds: string[] = (Array.isArray(b.videoIds) ? b.videoIds : []).map(String).filter((id: string) => trainingVideo(id))
  const roles: string[] = (Array.isArray(b.roles) ? b.roles : []).map(String)
  const picked = new Set<string>((Array.isArray(b.workerIds) ? b.workerIds : []).map(String))
  const note = String(b.note || '').slice(0, 800).trim()
  if (!videoIds.length) return NextResponse.json({ error: 'Pick at least one video.' }, { status: 400 })

  const ws = gate.orgId
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner FROM "Worker" WHERE orgId = ?`, gate.orgId)
    : await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner FROM "Worker"`)
  const to = ws.filter((w: Row) => picked.has(String(w.id)) || workerRoles(w).some(r => roles.includes(r)))
    .sort((a: Row, c: Row) => String(a.name).localeCompare(String(c.name)))
  const noEmail = to.filter((w: Row) => !String(w.email || '').trim()).map((w: Row) => String(w.name))
  const withEmail = to.filter((w: Row) => String(w.email || '').trim())
  if (b.preview) return NextResponse.json({ count: withEmail.length, names: withEmail.map((w: Row) => String(w.name)), noEmail, emailOn: emailEnabled() })
  if (!withEmail.length) return NextResponse.json({ error: 'Nobody with an email matches.' }, { status: 400 })

  const org = await orgById(gate.orgId).catch(() => null)
  const base = 'https://whistleready.app/dashboard/staff/training'
  const vids = videoIds.map(id => trainingVideo(id)!)
  const list = vids.map(v => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><a href="${base}?v=${encodeURIComponent(v.id)}" style="color:#0f766e;font-weight:700;text-decoration:none">${esc(v.title)}</a><br><span style="color:#64748b;font-size:13px">${esc(v.blurb)} · ${minutesLabel(v.secs)}</span></td></tr>`).join('')
  let sent = 0; const failed: string[] = []
  const one = async (w: Row) => {
    const first = String(w.name || '').split(/\s+/)[0] || 'there'
    const html = renderEmail({
      orgName: org?.name || 'Sunshine Events Group',
      eyebrow: 'Whistle Ready training',
      title: vids.length === 1 ? 'A training video for you' : `${vids.length} training videos for you`,
      body: `<p style="margin:0 0 10px">Hi ${esc(first)},</p>
        ${note ? `<p style="margin:0 0 14px;white-space:pre-line">${esc(note)}</p>` : `<p style="margin:0 0 14px">Please watch ${vids.length === 1 ? 'this short video' : 'these short videos'} before your next event. Each one is about a minute.</p>`}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">${list}</table>
        <div style="margin-top:22px">${button(`${base}?v=${encodeURIComponent(vids[0].id)}`, vids.length === 1 ? 'Watch it' : 'Start watching')}</div>
        <p style="margin:14px 0 0;font-size:12px;color:#64748b">Sign in to Whistle Ready with this email address. The videos are inside your login, and we can see when you've watched them.</p>`,
      footerNote: 'Questions? Reply to this email.',
    })
    const text = `Hi ${first},\n\n${note || 'Please watch these short training videos before your next event.'}\n\n` + vids.map(v => `${v.title}: ${base}?v=${v.id}`).join('\n') + '\n\nSign in to Whistle Ready with this email address.'
    const r = await sendEmail({ to: String(w.email).trim(), subject: vids.length === 1 ? `Training video: ${vids[0].title}` : `${vids.length} Whistle Ready training videos to watch`, html, text, ...orgSender(org as any) })
    if (r.ok) sent++; else failed.push(String(w.name))
  }
  for (let i = 0; i < withEmail.length; i += 8) await Promise.all(withEmail.slice(i, i + 8).map(one))

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LOG } })
    const log = row?.value ? JSON.parse(row.value) : []
    const entry = { at: new Date().toISOString(), by: String(gate.session?.user?.name || gate.session?.user?.email || ''), videoIds, roles, people: Array.from(picked), sent }
    const value = JSON.stringify([entry, ...(Array.isArray(log) ? log : [])].slice(0, 50))
    await prisma.appSetting.upsert({ where: { key: LOG }, update: { value }, create: { key: LOG, value } })
  } catch { /* the emails went; only the log is lost */ }
  return NextResponse.json({ ok: true, sent, failed, noEmail })
}

export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (gate.role !== 'admin' && gate.role !== 'director') return NextResponse.json({ error: 'Directors only' }, { status: 403 })
  try { const row = await prisma.appSetting.findUnique({ where: { key: LOG } }); return NextResponse.json({ sends: row?.value ? JSON.parse(row.value) : [] }) } catch { return NextResponse.json({ sends: [] }) }
}
