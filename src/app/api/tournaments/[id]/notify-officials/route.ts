import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgForTournament, tournamentOrgId } from '@/lib/org'
import { pushToStaffEmails } from '@/lib/staffAlerts'
import { addDaysISO, dayTitle, eventToday } from '@/lib/availabilityAnswers'
import { answersFor, confirmLinks, gameSig, readAsk, stateOf, writeAsk } from '@/lib/officialConfirm'

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
//
// confirm: true + confirmBy (Bo, Oct 15 2026) also asks each official to confirm their
// games (lib/officialConfirm): the email gets a Confirm button to their no-login
// page, and the ask is saved for the Confirmations page. Someone with nothing left
// to confirm gets the plain email. workerIds sends to just those officials
// (reminders from the Confirmations page), whatever onlyChanged says; reminder: true
// marks the subject "Reminder:". Preview also returns the ask and a suggested date.

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
  const confirm = !!b.confirm
  const reminder = !!b.reminder
  const only = Array.isArray(b.workerIds) ? new Set((b.workerIds as unknown[]).map(String)) : null

  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true, name: true, startDate: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId) {
    const org = await tournamentOrgId(params.id)
    if (org && org !== gate.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const ask = await readAsk(params.id)
  // Confirm by: what they picked, else the last ask's date, else 3 days before the event.
  const today = eventToday()
  const suggestBy = ask?.confirmBy || (t.startDate ? [addDaysISO(t.startDate, -3), today].sort()[1] : '')
  const confirmBy = typeof b.confirmBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.confirmBy) ? b.confirmBy : suggestBy
  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, isCanceled: false, ...(date ? { date } : {}) },
    include: { assignments: { include: { worker: true } } },
  })

  // Each official's games, in time order.
  type Row = { date: string; time: string; field: string; division: string; num: string; teams: string; role: string; gameId: string; roleKey: string; sig: string }
  const people = new Map<string, { id: string; name: string; email: string; rows: Row[] }>()
  for (const g of games) {
    if (!g.startTime || !g.location) continue   // parked games aren't on the schedule yet
    for (const a of g.assignments) {
      const w: any = a.worker
      if (!w) continue
      const p = people.get(w.id) || { id: w.id, name: String(w.name || ''), email: String(w.email || '').trim(), rows: [] }
      p.rows.push({ date: g.date, time: g.startTime, field: g.location, division: g.division, num: g.gameNumber, teams: `${g.team1} vs ${g.team2}`, role: roleLabel(a.role), gameId: g.id, roleKey: a.role, sig: gameSig(g) })
      people.set(w.id, p)
    }
  }
  for (const p of Array.from(people.values())) p.rows.sort((x, y) => x.date !== y.date ? (x.date < y.date ? -1 : 1) : mins(x.time) - mins(y.time))

  const key = `officialNotice:${params.id}`
  let sent: Record<string, { sig: string; sentAt: string }> = {}
  try { const r = await prisma.appSetting.findUnique({ where: { key } }); if (r?.value) sent = JSON.parse(r.value) || {} } catch {}
  const sigOf = (rows: Row[]) => (date ? date + '|' : '') + rows.map(r => [r.date, r.time, r.field, r.num, r.teams, r.role].join('~')).join('|')

  const all = Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name))
  const targets = all.filter(p => only ? only.has(p.id) : !onlyChanged || sent[p.id]?.sig !== sigOf(p.rows))
  const noEmail = targets.filter(p => !p.email).map(p => p.name)
  const lastSentAt = Object.values(sent).map(v => v.sentAt).sort().pop() || ''

  if (b.preview) {
    return NextResponse.json({
      officials: all.length, targets: targets.length, games: targets.reduce((n, p) => n + p.rows.length, 0),
      unchanged: all.length - targets.length, noEmail, lastSentAt,
      emailOn: emailEnabled(),
      ask, suggestBy,
    })
  }

  // Asking them to confirm: which of each official's games still need an answer, and
  // their links. The ask is saved first, so a "can't work" from the first email to
  // land already knows who to tell.
  const answers = confirm ? await answersFor(params.id) : null
  // Games from today on only: the confirm page doesn't offer ones that are over.
  const pendingOf = (p: (typeof all)[number]) => answers ? p.rows.filter(r => r.date >= today && stateOf({ gameId: r.gameId, role: r.roleKey, workerId: p.id, sig: r.sig } as any, answers) !== 'yes').length : 0
  const links = confirm ? await confirmLinks(params.id, targets.map(p => p.id)) : new Map<string, string>()
  if (confirm) {
    await writeAsk(params.id, { confirmBy, at: new Date().toISOString(), by: String(gate.session?.user?.name || ''), byUserId: gate.userId || '', byEmail: String(gate.session?.user?.email || '') })
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
    const n = p.rows.length, pending = pendingOf(p), nUp = p.rows.filter(r => r.date >= today).length
    const asking = confirm && pending > 0
    const token = links.get(p.id) || ''
    const confirmUrl = asking && token ? `${base}/confirm-games/${token}` : ''
    const isYes = (r: Row) => !!answers && stateOf({ gameId: r.gameId, role: r.roleKey, workerId: p.id, sig: r.sig } as any, answers) === 'yes'
    const gamesWord = (k: number) => `${k} game${k === 1 ? '' : 's'}`
    if (p.email && emailEnabled()) {
      const byDay = new Map<string, Row[]>()
      p.rows.forEach(r => byDay.set(r.date, [...(byDay.get(r.date) || []), r]))
      const tables = Array.from(byDay.entries()).map(([d, rows]) => `
        <p style="margin:18px 0 6px;font:700 13px Arial,Helvetica,sans-serif;color:#0f172a">${esc(dayName(d))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">
          ${rows.map(r => `<tr>
            <td style="padding:7px 8px 7px 0;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:700;color:#0f172a;vertical-align:top">${esc(time12(r.time))}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${esc(r.field)}<br><span style="color:#64748b;font-size:12px">#${esc(r.num)} · ${esc(r.division)}</span></td>
            <td style="padding:7px 0 7px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${esc(r.teams)}<br><span style="color:#0f766e;font-size:12px;font-weight:700">${esc(r.role)}${asking && isYes(r) ? ' · ✓ Confirmed' : ''}</span></td>
          </tr>`).join('')}
        </table>`).join('')
      const first = p.name.split(/\s+/)[0] || p.name
      const html = renderEmail({
        orgName: org?.name || 'Sunshine Events Group',
        eyebrow: t.name,
        title: `${first}, here are your games`,
        body: `<p style="margin:0 0 6px">You're on ${gamesWord(n)} at ${esc(t.name)}${date ? ` on ${esc(dayName(date))}` : ''}.${
            asking ? ` Please confirm ${pending === nUp ? (nUp === 1 ? 'it' : 'them') : `the ${pending === 1 ? 'one that is' : `${pending} that are`} new or changed`}${confirmBy ? ` by <b>${esc(dayTitle(confirmBy))}</b>` : ''}.`
            : confirm ? ' You’ve confirmed all of them. Thank you!' : ''}</p>
          ${note ? `<p style="margin:12px 0;padding:12px 14px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;color:#0f172a">${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
          ${tables}
          ${asking ? `<div style="margin-top:22px">${button(confirmUrl, pending === nUp ? `Confirm my ${gamesWord(nUp)}` : `Confirm ${gamesWord(pending)}`)}</div>
          <p style="margin:6px 0 0;font-size:13px"><a href="${confirmUrl}" style="color:#0f766e">Can't work one of them? Tell the assigner</a></p>
          <p style="margin:14px 0 0;font-size:12px;color:#64748b">No login needed. If your games change, we'll ask you to confirm the new ones. <a href="${myGames}" style="color:#64748b">My games</a> always shows the latest.</p>`
          : `<div style="margin-top:22px">${button(myGames, 'Open My games')}</div>
          <p style="margin:14px 0 0;font-size:12px;color:#64748b">Games can still change. If they do, you'll get a new email, and My games always shows the latest.</p>`}`,
        footerNote: 'Questions about your games? Reply to this email.',
      })
      const text = `${first}, here are your games at ${t.name}:\n\n` + p.rows.map(r => `${dayName(r.date)} ${time12(r.time)} · ${r.field} · #${r.num} ${r.division} · ${r.teams} · ${r.role}${asking && isYes(r) ? ' (confirmed)' : ''}`).join('\n') + (note ? `\n\n${note}` : '')
        + (asking ? `\n\nPlease confirm${confirmBy ? ` by ${dayTitle(confirmBy)}` : ''}, or tell the assigner which ones you can't work: ${confirmUrl}` : '') + `\n\nMy games: ${myGames}`
      const subject = asking
        ? `${reminder ? 'Reminder: please' : 'Please'} confirm ${pending === nUp ? `your ${gamesWord(nUp)}` : `${gamesWord(pending)}`} · ${t.name}${date ? ` · ${dayName(date)}` : ''}`
        : `Your games at ${t.name}${date ? ` · ${dayName(date)}` : ''}`
      const r = await sendEmail({ to: p.email, subject, html, text, ...orgSender(org as any) })
      if (r.ok) { emailed++; ok = true } else failed.push(p.name)
    }
    if (p.email) {
      const k = await pushToStaffEmails([p.email], asking
        ? { title: reminder ? 'Reminder: confirm your games' : 'Please confirm your games', body: `${t.name}: ${gamesWord(pending)} to confirm${confirmBy ? ` by ${dayTitle(confirmBy, true)}` : ''}.`, url: `/confirm-games/${token}`, tag: `confirm:${params.id}` }
        : { title: `Your games at ${t.name}`, body: `${gamesWord(n)}. First: ${dayName(p.rows[0].date)} ${time12(p.rows[0].time)}, ${p.rows[0].field}.`, url: '/dashboard/ref', tag: `games:${params.id}` })
      if (k) { pushed += k; ok = true }
    }
    if (ok) sent[p.id] = { sig: sigOf(p.rows), sentAt: now }
  }
  for (let i = 0; i < targets.length; i += 8) await Promise.all(targets.slice(i, i + 8).map(sendOne))
  try {
    const value = JSON.stringify(sent)
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  } catch { /* the send happened; only "changed since" loses its memory */ }
  return NextResponse.json({ ok: true, emailed, pushed, noEmail, failed, targets: targets.length, asked: confirm ? targets.filter(p => pendingOf(p) > 0).length : 0 })
}
