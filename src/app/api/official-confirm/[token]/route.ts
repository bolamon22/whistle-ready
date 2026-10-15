import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgForTournament } from '@/lib/org'
import { pushToStaffEmails } from '@/lib/staffAlerts'
import { availLocked, availChangeBy, dayTitle, eventToday, minutesOf, time12 } from '@/lib/availabilityAnswers'
import { type OfficialSlot, answerOf, answersFor, officialSlots, readAsk, resolveConfirmLink, saveAnswer, stateOf, upcoming } from '@/lib/officialConfirm'

// The no-login page an official's "Confirm my games" button opens (/confirm-games/<token>,
// lib/officialConfirm has the why). The token is the key, like the teams' confirm
// link, and it reaches only that official's own games at that event.
//
// GET   their games from today on, each with its answer, and the games they said no to.
// POST  { answers: [{ gameId, role, answer: 'yes' | 'no', note? }] } -> { confirmed,
//       declinedNow (game numbers), locked, gone, page (what GET returns) }
//       yes: they'll work it. no: the game comes off their schedule right away (the
//       slot opens on the board) and whoever asked them to confirm gets an email and a
//       phone alert. A game within 48 hours (Saturday from Thursday on, the same rule
//       as availability) can't be turned down here: call or text the assigner.

const ROLE_LABEL: Record<string, string> = { ref1: 'Referee', ref2: 'Referee', ref3: 'Referee', scorekeeper: 'Scorekeeper' }
const roleLabel = (r: string) => ROLE_LABEL[r] || r.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const byTime = (a: { date: string; time: string }, b: { date: string; time: string }) => a.date !== b.date ? (a.date < b.date ? -1 : 1) : (minutesOf(a.time) || 0) - (minutesOf(b.time) || 0)
const notFound = () => NextResponse.json({ error: 'This link isn’t working. Open My games in Whistle Ready instead, or ask your assigner for a new email.' }, { status: 404 })
const BASE = 'https://whistleready.app'

async function pageData(tournamentId: string, workerId: string) {
  const [t, w] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, name: true, startDate: true, endDate: true, location: true } }),
    prisma.worker.findUnique({ where: { id: workerId }, select: { id: true, name: true } }),
  ])
  if (!t || !w) return null
  const [ask, slots, answers, org] = await Promise.all([readAsk(tournamentId), officialSlots(tournamentId, workerId), answersFor(tournamentId, workerId), orgForTournament(tournamentId).catch(() => null)])
  const today = eventToday()
  const mine = upcoming(slots, today).sort(byTime)
  const held = new Set(mine.map(s => `${s.gameId}|${s.role}`))
  // Games they turned down that aren't theirs again, so they can see it went through.
  const noIds = Array.from(answers.values()).filter(a => a.answer === 'no' && !held.has(`${a.gameId}|${a.role}`))
  const noGames = noIds.length ? await prisma.game.findMany({ where: { id: { in: noIds.map(a => a.gameId) } }, select: { id: true, date: true, startTime: true, location: true, gameNumber: true, team1: true, team2: true } }) : []
  const gameById = new Map(noGames.map(g => [g.id, g]))
  return {
    event: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, location: t.location },
    orgName: org?.name || '',
    name: w.name, first: String(w.name || '').split(/\s+/)[0] || w.name,
    asked: !!ask, confirmBy: ask?.confirmBy || '',
    games: mine.map(s => {
      const state = stateOf(s, answers)
      return {
        key: `${s.gameId}|${s.role}`, gameId: s.gameId, role: s.role, roleLabel: roleLabel(s.role),
        date: s.date, time: s.time, field: s.field, num: s.num, division: s.division, teams: s.teams,
        state, at: state === 'yes' ? answerOf(s, answers)?.at || '' : '',
        locked: availLocked(s.date), changeBy: availChangeBy(s.date),
      }
    }),
    declined: noIds.map(a => ({ a, g: gameById.get(a.gameId) })).filter(x => x.g && x.g.date >= today)
      .map(({ a, g }) => ({ num: g!.gameNumber, date: g!.date, time: g!.startTime, field: g!.location, teams: `${g!.team1} vs ${g!.team2}`, note: a.note, at: a.at }))
      .sort(byTime),
  }
}

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const link = await resolveConfirmLink(params.token)
  if (!link) return notFound()
  const data = await pageData(link.tournamentId, link.workerId)
  return data ? NextResponse.json(data) : notFound()
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const link = await resolveConfirmLink(params.token)
  if (!link) return notFound()
  const { tournamentId, workerId } = link
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const asked = (Array.isArray(b.answers) ? b.answers : []).slice(0, 300) as { gameId?: unknown; role?: unknown; answer?: unknown; note?: unknown }[]
  if (!asked.length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  const worker = await prisma.worker.findUnique({ where: { id: workerId }, select: { id: true, name: true } })
  if (!worker) return notFound()

  // Only games that are theirs right now, from today on: the board can change
  // between the page loading and the tap.
  const slots = upcoming(await officialSlots(tournamentId, workerId))
  const byKey = new Map(slots.map(s => [`${s.gameId}|${s.role}`, s]))
  let confirmed = 0, gone = 0
  const declined: (OfficialSlot & { note: string })[] = []
  const locked: string[] = []
  for (const x of asked) {
    const s = byKey.get(`${String(x.gameId)}|${String(x.role)}`)
    if (!s) { gone++; continue }
    if (x.answer === 'yes') {
      await saveAnswer(tournamentId, { gameId: s.gameId, role: s.role, workerId, answer: 'yes', sig: s.sig, note: '', by: 'self' })
      confirmed++
    } else if (x.answer === 'no') {
      if (availLocked(s.date)) { locked.push(s.num); continue }
      const note = String(x.note ?? '').trim().slice(0, 300)
      await saveAnswer(tournamentId, { gameId: s.gameId, role: s.role, workerId, answer: 'no', sig: s.sig, note, by: 'self' })
      // Off the game now: the slot shows open on the board, and pay never counts a
      // game they didn't work. Only their own place, even if the slot changed hands.
      await prisma.assignment.deleteMany({ where: { gameId: s.gameId, role: s.role, workerId } })
      declined.push({ ...s, note })
    }
  }
  if (declined.length) await tellAssigner(tournamentId, worker.name, declined).catch(e => console.error('[official-confirm] notify', e))
  const data = await pageData(tournamentId, workerId)
  return NextResponse.json({ ok: true, confirmed, declinedNow: declined.map(d => d.num), locked, gone, page: data })
}

/** Whoever asked the officials to confirm hears about a "can't work" right away. */
async function tellAssigner(tournamentId: string, name: string, declined: (OfficialSlot & { note: string })[]) {
  const ask = await readAsk(tournamentId)
  const to = String(ask?.byEmail || '').trim()
  if (!to) return
  const [t, org] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
    orgForTournament(tournamentId).catch(() => null),
  ])
  const eventName = t?.name || 'your event'
  const list = declined.slice().sort(byTime)
  const what = list.length === 1 ? `game #${list[0].num}` : `${list.length} games`
  const board = `${BASE}/tournaments/${tournamentId}?day=${list[0].date}`
  const confirmations = `${BASE}/tournaments/${tournamentId}/confirmations`
  if (emailEnabled()) {
    const rows = list.map(d => `<tr>
      <td style="padding:8px 8px 8px 0;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:700;color:#0f172a;vertical-align:top">${esc(dayTitle(d.date, true))}<br>${esc(time12(d.time))}</td>
      <td style="padding:8px 0 8px 8px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top">${esc(d.field)} · #${esc(d.num)} · ${esc(roleLabel(d.role))}<br><span style="color:#64748b;font-size:12px">${esc(d.teams)}</span>${d.note ? `<br><span style="color:#b91c1c">“${esc(d.note)}”</span>` : ''}</td>
    </tr>`).join('')
    const html = renderEmail({
      orgName: org?.name || 'Sunshine Events Group',
      eyebrow: eventName,
      title: `${name} can't work ${list.length === 1 ? 'a game' : `${list.length} games`}`,
      body: `<p style="margin:0 0 10px">${esc(name)} answered your request to confirm. ${list.length === 1 ? 'This game is' : 'These games are'} off their schedule, and the ${list.length === 1 ? 'slot is' : 'slots are'} open on the Assigner.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">${rows}</table>
        <div style="margin-top:20px">${button(board, list.length === 1 ? 'Fill it on the Assigner' : 'Fill them on the Assigner')}</div>
        <p style="margin:12px 0 0;font-size:13px"><a href="${confirmations}" style="color:#0f766e">See who has confirmed</a></p>`,
      footerNote: 'You asked your officials to confirm their games, so their answers come to you.',
    })
    const text = `${name} can't work ${what} at ${eventName}:\n\n` + list.map(d => `${dayTitle(d.date, true)} ${time12(d.time)} · ${d.field} · #${d.num} · ${d.teams}${d.note ? `\n  "${d.note}"` : ''}`).join('\n') + `\n\nThe slot is open on the Assigner: ${board}\nWho has confirmed: ${confirmations}`
    await sendEmail({ to, subject: `${name} can't work ${what} · ${eventName}`, html, text, ...orgSender(org as any) })
  }
  await pushToStaffEmails([to], { title: `${name} can't work ${list.length === 1 ? `#${list[0].num}` : what}`, body: `${dayTitle(list[0].date, true)} ${time12(list[0].time)} · ${list[0].field}. The slot is open.`, url: `/tournaments/${tournamentId}/confirmations`, tag: `decline:${tournamentId}` })
}
