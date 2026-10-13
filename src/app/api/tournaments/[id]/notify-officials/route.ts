import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgForTournament } from '@/lib/org'
import { pushToStaffEmails } from '@/lib/staffAlerts'

// "Notify officials" on the Assigner board (Bo, Oct 13 2026: "we should have a way
// for them to notify the refs when the schedule is ready"). Assigning never told
// anyone; officials only saw games if they opened My games. This emails each
// official THEIR games (and buzzes their phone if they turned on staff alerts),
// with a link to My games.
//
// POST { date?: 'YYYY-MM-DD' (one day, else every day), onlyChanged?: boolean,
//        note?: string, preview?: boolean }
// onlyChanged skips anyone whose games are exactly what they were last sent, so a
// second send after a few swaps reaches only the people the swaps touched. What
// was sent is kept per tournament in AppSetting `officialNotice:<tournamentId>`:
// { [workerId]: { sig, sentAt } }.

const ROLE_LABEL: Record<string, string> = { ref1: 'Referee', ref2: 'Referee', ref3: 'Referee', scorekeeper: 'Scorekeeper' }
const roleLabel = (r: string) => ROLE_LABEL[r] || r.replace(/^\w/, c => c.toUpperCase())
const time12 = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}` }
const dayName = (d: string) => { const [y, mo, da] = d.split('-').map(Number); return y ? new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) : d }
const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!['admin', 'director', 'assigner'].includes(gate.role)) return NextResponse.json({ error: 'Only assigners and directors can notify officials.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : ''
  const onlyChanged = !!b.onlyChanged
  const note = String(b.note || '').slice(0, 600).trim()

  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, isCanceled: false, ...(date ? { date } : {}) },
    include: { assignments: { include: { worker: true } } },
  })

  // Each official's games, in time order.
  type Row = { date: string; time: string; field: string; division: string; num: string; teams: string; role: string }
  const people = new Map<string, { id: string; name: string; email: string; rows: Row[] }>()
  for (const g of games) {
    if (!g.startTime || !g.location) continue   // parked games aren't on the schedule yet
    for (const a of g.assignments) {
      const w: any = a.worker
      if (!w) continue
      const p = people.get(w.id) || { id: w.id, name: String(w.name || ''), email: String(w.email || '').trim(), rows: [] }
      p.rows.push({ date: g.date, time: g.startTime, field: g.location, division: g.division, num: g.gameNumber, teams: `${g.team1} vs ${g.team2}`, role: roleLabel(a.role) })
      people.set(w.id, p)
    }
  }
  for (const p of Array.from(people.values())) p.rows.sort((x, y) => x.date !== y.date ? (x.date < y.date ? -1 : 1) : mins(x.time) - mins(y.time))

  const key = `officialNotice:${params.id}`
  let sent: Record<string, { sig: string; sentAt: string }> = {}
  try { const r = await prisma.appSetting.findUnique({ where: { key } }); if (r?.value) sent = JSON.parse(r.value) || {} } catch {}
  const sigOf = (rows: Row[]) => (date ? date + '|' : '') + rows.map(r => [r.date, r.time, r.field, r.num, r.teams, r.role].join('~')).join('|')

  const all = Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name))
  const targets = all.filter(p => !onlyChanged || sent[p.id]?.sig !== sigOf(p.rows))
  const noEmail = targets.filter(p => !p.email).map(p => p.name)
  const lastSentAt = Object.values(sent).map(v => v.sentAt).sort().pop() || ''

  if (b.preview) {
    return NextResponse.json({
      officials: all.length, targets: targets.length, games: targets.reduce((n, p) => n + p.rows.length, 0),
      unchanged: all.length - targets.length, noEmail, lastSentAt,
      emailOn: emailEnabled(),
    })
  }

  const org = await orgForTournament(params.id).catch(() => null)
  const base = 'https://whistleready.app'
  const myGames = `${base}/dashboard/ref`
  let emailed = 0, pushed = 0
  const failed: string[] = []
  const now = new Date().toISOString()
  // A few at a time: one by one, 60 officials could outrun the function's time limit.
  const sendOne = async (p: (typeof targets)[number]) => {
    let ok = false
    if (p.email && emailEnabled()) {
      const byDay = new Map<string, Row[]>()
      p.rows.forEach(r => byDay.set(r.date, [...(byDay.get(r.date) || []), r]))
      const tables = Array.from(byDay.entries()).map(([d, rows]) => `
        <p style="margin:18px 0 6px;font:700 13px Arial,Helvetica,sans-serif;color:#0f172a">${esc(dayName(d))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">
          ${rows.map(r => `<tr>
            <td style="padding:7px 8px 7px 0;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:700;color:#0f172a;vertical-align:top">${esc(time12(r.time))}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${esc(r.field)}<br><span style="color:#64748b;font-size:12px">#${esc(r.num)} · ${esc(r.division)}</span></td>
            <td style="padding:7px 0 7px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${esc(r.teams)}<br><span style="color:#0f766e;font-size:12px;font-weight:700">${esc(r.role)}</span></td>
          </tr>`).join('')}
        </table>`).join('')
      const first = p.name.split(/\s+/)[0] || p.name
      const html = renderEmail({
        orgName: org?.name || 'Sunshine Events Group',
        eyebrow: t.name,
        title: `${first}, here are your games`,
        body: `<p style="margin:0 0 6px">You're on ${p.rows.length} game${p.rows.length === 1 ? '' : 's'} at ${esc(t.name)}${date ? ` on ${esc(dayName(date))}` : ''}.</p>
          ${note ? `<p style="margin:12px 0;padding:12px 14px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;color:#0f172a">${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
          ${tables}
          <div style="margin-top:22px">${button(myGames, 'Open My games')}</div>
          <p style="margin:14px 0 0;font-size:12px;color:#64748b">Games can still change. If they do, you'll get a new email, and My games always shows the latest.</p>`,
        footerNote: 'Questions about your games? Reply to this email.',
      })
      const text = `${first}, here are your games at ${t.name}:\n\n` + p.rows.map(r => `${dayName(r.date)} ${time12(r.time)} · ${r.field} · #${r.num} ${r.division} · ${r.teams} · ${r.role}`).join('\n') + (note ? `\n\n${note}` : '') + `\n\nMy games: ${myGames}`
      const r = await sendEmail({ to: p.email, subject: `Your games at ${t.name}${date ? ` · ${dayName(date)}` : ''}`, html, text, ...orgSender(org as any) })
      if (r.ok) { emailed++; ok = true } else failed.push(p.name)
    }
    if (p.email) {
      const n = await pushToStaffEmails([p.email], { title: `Your games at ${t.name}`, body: `${p.rows.length} game${p.rows.length === 1 ? '' : 's'}. First: ${dayName(p.rows[0].date)} ${time12(p.rows[0].time)}, ${p.rows[0].field}.`, url: '/dashboard/ref', tag: `games:${params.id}` })
      if (n) { pushed += n; ok = true }
    }
    if (ok) sent[p.id] = { sig: sigOf(p.rows), sentAt: now }
  }
  for (let i = 0; i < targets.length; i += 8) await Promise.all(targets.slice(i, i + 8).map(sendOne))
  try {
    const value = JSON.stringify(sent)
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  } catch { /* the send happened; only "changed since" loses its memory */ }
  return NextResponse.json({ ok: true, emailed, pushed, noEmail, failed, targets: targets.length })
}
