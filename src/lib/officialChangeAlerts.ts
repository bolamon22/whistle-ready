import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgForTournament } from '@/lib/org'
import { pushToStaffEmails } from '@/lib/staffAlerts'
import { confirmLinks, readAsk } from '@/lib/officialConfirm'
import { eventToday } from '@/lib/availabilityAnswers'
import { crewsOf, CREWS, type Crew } from '@/lib/staffRelease'
import { getRelease } from '@/lib/staffReleaseStore'
import { eventSideOf } from '@/lib/eventTeamsStore'

// TELL OFFICIALS WHEN THEIR GAMES CHANGE (Bo, Oct 17 2026: "a notification if a
// game changes once the referee schedule is published to let the referee know and
// the assigner. But if the assigner changes it, just the referee." Sent the moment
// it happens, by email and phone alert, his picks).
//
// Only once the schedule is "more or less final and published for them to see":
// a change is sent only for a crew the assigner has shown on the staff portal
// (lib/staffRelease) AND to an official who has already been sent Notify officials
// for that crew. Before that, edits are background work and nobody hears about it.
//
// Who hears:
//   - the official whose game moved, was canceled or brought back, or who was put
//     on or taken off a game;
//   - that crew's assigner too, unless the assigner made the change. Assigners
//     can't move games (api/games/[id]), so a move is always the scheduler's or a
//     director's, and the assigner should know a crew they staffed shifted.
// The crew's assigner is whoever last sent Notify officials to that crew
// (AppSetting officialCrewAssigner:<tid>, written by notify-officials).
//
// After telling someone, their "last sent" record (officialNotice:<tid>) is moved
// up to their current games, so Notify officials' "only those whose games changed"
// doesn't email them the same change again.
//
// Never throws: a failed alert must not fail the edit that caused it.

export type Spot = { gameId: string; date: string; time: string; field: string; num: string; division: string; teams: string; canceled: boolean }
export type OfficialChange =
  | { kind: 'added'; workerId: string; role: string; spot: Spot }
  | { kind: 'removed'; workerId: string; role: string; spot: Spot }
  | { kind: 'moved'; workerId: string; role: string; before: Spot; after: Spot }
export type Actor = { role: string; name: string; email: string }

type GameLike = { id: string; date: string; startTime: string; location: string; gameNumber: string; division: string; team1: string; team2: string; isCanceled?: boolean | null }
export function spotOf(g: GameLike): Spot {
  return { gameId: g.id, date: g.date || '', time: g.startTime || '', field: g.location || '', num: g.gameNumber || '', division: g.division || '', teams: `${g.team1} vs ${g.team2}`, canceled: !!g.isCanceled }
}
// Division counts: a game edited from a girls division to a boys one is news to its refs.
const sameSpot = (a: Spot, b: Spot) => a.date === b.date && a.time === b.time && a.field === b.field && a.num === b.num && a.canceled === b.canceled && a.teams === b.teams && a.division === b.division
const samePlace = (a: Spot, b: Spot) => a.date === b.date && a.time === b.time && a.field === b.field

// Girls or boys, from the division name. Bo (Oct 20 2026): for officials, a game
// going from girls to boys (or back) matters more than which teams are playing, so
// the alert calls it out on top. Teams changing is still noted, just lower down.
export function genderOf(division: string): 'girls' | 'boys' | '' {
  const d = String(division || '').toLowerCase()
  if (/\bgirls?\b|\bwomen'?s?\b/.test(d)) return 'girls'
  if (/\bboys?\b|\bmen'?s?\b/.test(d)) return 'boys'
  return ''
}

/** One 'moved' change per official on a game whose day, time, field, number, teams or canceled state changed. */
export function gameMoveChanges(before: GameLike & { assignments: { workerId: string; role: string }[] }, after: GameLike): OfficialChange[] {
  const b = spotOf(before), a = spotOf(after)
  if (sameSpot(a, b)) return []
  return before.assignments.map(x => ({ kind: 'moved' as const, workerId: x.workerId, role: x.role, before: b, after: a }))
}

export function actorOf(gate: { role: string; session?: any }): Actor {
  return { role: String(gate.role || ''), name: String(gate.session?.user?.name || ''), email: String(gate.session?.user?.email || '').trim().toLowerCase() }
}

const ROLE_LABEL: Record<string, string> = { ref1: 'Referee', ref2: 'Referee', ref3: 'Referee', scorekeeper: 'Scorekeeper' }
const roleLabel = (r: string) => ROLE_LABEL[r] || r.replace(/^\w/, c => c.toUpperCase())
const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
const time12 = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); if (!m) return t || ''; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}` }
const dayShort = (d: string) => { const [y, mo, da] = (d || '').split('-').map(Number); return y ? new Date(Date.UTC(y, mo - 1, da)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'no time yet' }
const fieldName = (f: string) => (f || '').split(' - ').pop() || f || 'no field yet'
const when = (s: Spot) => s.date && s.time ? `${dayShort(s.date)} ${time12(s.time)}, ${fieldName(s.field)}` : 'not scheduled yet'

function line(c: OfficialChange): string {
  if (c.kind === 'added') return `You're on #${c.spot.num} (${c.spot.division}, ${c.spot.teams}): ${when(c.spot)}, ${roleLabel(c.role)}.`
  if (c.kind === 'removed') return `You're off #${c.spot.num} (${c.spot.division}, ${c.spot.teams}), ${when(c.spot)}.`
  if (c.after.canceled && !c.before.canceled) return `#${c.after.num} (${c.after.division}, ${c.after.teams}) is canceled. It was ${when(c.before)}.`
  if (!c.after.canceled && c.before.canceled) return `#${c.after.num} (${c.after.division}, ${c.after.teams}) is back on: ${when(c.after)}.`
  const renum = c.before.num !== c.after.num ? ` (was #${c.before.num})` : ''
  if (samePlace(c.before, c.after) && c.before.teams === c.after.teams && c.before.division !== c.after.division) return `#${c.after.num}${renum}, ${when(c.after)}, ${c.after.teams}, is now ${c.after.division}. It was ${c.before.division}.`
  if (samePlace(c.before, c.after)) return `#${c.after.num}${renum}, ${when(c.after)}, is now ${c.after.teams} (${c.after.division}). It was ${c.before.teams}.`
  return `#${c.after.num}${renum} (${c.after.division}, ${c.after.teams}) moved from ${when(c.before)} to ${when(c.after)}.`
}

type DayGame = { gameId: string; date: string; time: string; field: string; division: string }

/** Girls/boys switches these changes cause in one official's day: a game that is a
 *  different side than the game they had in the same slot before, or than their
 *  game just before or after it that day. */
export function genderSwitches(mine: OfficialChange[], day: DayGame[]): string[] {
  const out: string[] = []
  const cap = (g: string) => g.toUpperCase()
  for (const c of mine) {
    if (c.kind === 'removed') continue
    const s = c.kind === 'moved' ? c.after : c.spot
    if (!s.date || !s.time || s.canceled) continue
    const g = genderOf(s.division); if (!g) continue
    const at = `${dayShort(s.date)} ${time12(s.time)}, ${fieldName(s.field)}`
    // Same slot, other side: they were on a girls game here and now it's boys.
    const gone = mine.some(o => {
      if (o === c || o.kind === 'added') return false
      const b = o.kind === 'removed' ? o.spot : o.before
      const bg = genderOf(b.division)
      return b.date === s.date && b.time === s.time && !!bg && bg !== g
    })
    if (gone) { out.push(`${at} is now a ${cap(g)} game. It was ${g === 'boys' ? 'girls' : 'boys'}.`); continue }
    // Next to their other games that day.
    const same = day.filter(d => d.date === s.date && d.gameId !== s.gameId).sort((x, y) => mins(x.time) - mins(y.time))
    const prev = same.filter(d => mins(d.time) < mins(s.time)).pop()
    const next = same.find(d => mins(d.time) > mins(s.time))
    const other = [prev && genderOf(prev.division) && genderOf(prev.division) !== g ? `before it (${time12(prev.time)})` : '', next && genderOf(next.division) && genderOf(next.division) !== g ? `after it (${time12(next.time)})` : ''].filter(Boolean)
    if (other.length) out.push(`${at} is a ${cap(g)} game. Your ${other.length > 1 ? `games ${other.join(' and ')} are` : `game ${other[0]} is`} ${g === 'boys' ? 'girls' : 'boys'}.`)
  }
  return Array.from(new Set(out))
}

type Sent = Record<string, { sig: string; sentAt: string }>

export async function sendOfficialChanges(tournamentId: string, changes: OfficialChange[], actor: Actor): Promise<void> {
  try {
    if (!tournamentId || !changes.length) return
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, name: true, startDate: true, endDate: true } })
    if (!t) return
    const last = String(t.endDate || t.startDate || '').slice(0, 10)
    if (last && last < eventToday()) return   // the event is over
    const [release, side] = await Promise.all([getRelease(tournamentId), eventSideOf(tournamentId)])
    const noticeKey = `officialNotice:${tournamentId}`
    let sent: Sent = {}
    try { const r = await prisma.appSetting.findUnique({ where: { key: noticeKey } }); if (r?.value) sent = JSON.parse(r.value) || {} } catch {}
    const told = (wid: string, c: Crew) => !!(sent[`${wid}|${c}`] || sent[wid])
    const spotFor = (c: OfficialChange) => c.kind === 'moved' ? c.after : c.spot
    const live = (c: OfficialChange) => crewsOf(c.role, spotFor(c).division, side).filter(cr => !!release[cr] && told(c.workerId, cr))
    const keep = changes.filter(c => live(c).length > 0)
    if (!keep.length) return

    const ids = Array.from(new Set(keep.map(c => c.workerId)))
    const workers = await prisma.worker.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    const byId = new Map(workers.map(w => [w.id, w]))
    const org = await orgForTournament(tournamentId).catch(() => null)
    const ask = await readAsk(tournamentId).catch(() => null)
    const links = ask ? await confirmLinks(tournamentId, ids).catch(() => new Map<string, string>()) : new Map<string, string>()
    const base = 'https://whistleready.app'
    const now = new Date().toISOString()
    // Their games as they stand now: for girls/boys switches, then for "last sent".
    const games = await prisma.game.findMany({
      where: { tournamentId, isCanceled: false, assignments: { some: { workerId: { in: ids } } } },
      include: { assignments: { where: { workerId: { in: ids } }, select: { workerId: true, role: true } } },
    })
    const dayOf = (wid: string): DayGame[] => games.filter(g => g.startTime && g.assignments.some(a => a.workerId === wid)).map(g => ({ gameId: g.id, date: g.date, time: g.startTime, field: g.location, division: g.division }))
    const flips = new Map<string, string[]>()

    // ── The officials ──
    for (const wid of ids) {
      const w = byId.get(wid); if (!w) continue
      const mine = keep.filter(c => c.workerId === wid)
      const lines = mine.map(line)
      const warn = genderSwitches(mine, dayOf(wid))
      flips.set(wid, warn)
      const first = String(w.name || '').split(/\s+/)[0] || 'Hi'
      const email = String(w.email || '').trim()
      const token = links.get(wid) || ''
      const confirmUrl = token ? `${base}/confirm-games/${token}` : ''
      if (email && emailEnabled()) {
        const html = renderEmail({
          orgName: (org as any)?.name || 'Sunshine Events Group',
          eyebrow: t.name,
          title: warn.length ? `${first}, heads up: a girls/boys switch` : `${first}, your games changed`,
          body: `${warn.length ? `<div style="margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;color:#7c2d12"><b>Girls/boys switch</b><ul style="margin:6px 0 0;padding-left:18px">${warn.map(l => `<li style="margin:0 0 4px">${esc(l)}</li>`).join('')}</ul></div>` : ''}<ul style="margin:0 0 6px;padding-left:18px">${lines.map(l => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>
            <div style="margin-top:20px">${button(confirmUrl || `${base}/dashboard/ref`, confirmUrl ? 'See and confirm my games' : 'Open My games')}</div>
            <p style="margin:14px 0 0;font-size:12px;color:#64748b">Can't make a change work? Reply to this email or call your assigner.</p>`,
          footerNote: 'You get this because you’re on the officials’ schedule for this event.',
        })
        const text = `${first}, your games at ${t.name} changed:\n\n${warn.map(l => `GIRLS/BOYS SWITCH: ${l}\n`).join('')}${warn.length ? '\n' : ''}${lines.map(l => `- ${l}`).join('\n')}\n\n${confirmUrl || `${base}/dashboard/ref`}`
        await sendEmail({ to: email, subject: `${warn.length ? 'Girls/boys switch · ' : ''}Your games changed · ${t.name}`, html, text, ...orgSender(org as any) }).catch(() => null)
      }
      if (email) {
        await pushToStaffEmails([email], { title: warn.length ? 'Heads up: girls/boys switch' : 'Your games changed', body: warn.length ? warn[0] : lines.length === 1 ? lines[0] : `${lines.length} changes at ${t.name}. Tap to see them.`, url: confirmUrl ? `/confirm-games/${token}` : '/dashboard/ref', tag: `chg:${tournamentId}:${wid}:${now}` }).catch(() => 0)
      }
    }

    // ── The assigner, unless they made the change ──
    if (actor.role !== 'assigner') {
      let assigners: Record<string, { email: string; name: string }> = {}
      try { const r = await prisma.appSetting.findUnique({ where: { key: `officialCrewAssigner:${tournamentId}` } }); if (r?.value) assigners = JSON.parse(r.value) || {} } catch {}
      const perEmail = new Map<string, { name: string; lines: string[] }>()
      for (const c of keep) {
        for (const cr of live(c)) {
          const a = assigners[cr]; const to = String(a?.email || '').trim().toLowerCase()
          if (!to || to === actor.email) continue
          const who = byId.get(c.workerId)?.name || 'An official'
          const l = `${who} (${roleLabel(c.role)}): ${line(c).replace(/^You're on /, 'now on ').replace(/^You're off /, 'off ')}`
          const e = perEmail.get(to) || { name: a.name, lines: [] }
          if (!e.lines.includes(l)) e.lines.push(l)
          for (const w of flips.get(c.workerId) || []) { const fl = `${who}: GIRLS/BOYS SWITCH. ${w}`; if (!e.lines.includes(fl)) e.lines.push(fl) }
          perEmail.set(to, e)
        }
      }
      for (const [to, e] of Array.from(perEmail.entries())) {
        const by = actor.name || 'Someone'
        if (emailEnabled()) {
          const html = renderEmail({
            orgName: (org as any)?.name || 'Sunshine Events Group',
            eyebrow: t.name,
            title: 'A game your officials are on changed',
            body: `<p style="margin:0 0 10px">${esc(by)} changed the schedule. These officials were told:</p>
              <ul style="margin:0 0 6px;padding-left:18px">${e.lines.map(l => `<li style="margin:0 0 6px">${esc(l)}</li>`).join('')}</ul>
              <div style="margin-top:20px">${button(`${base}/tournaments/${tournamentId}`, 'Open the Assigner')}</div>`,
            footerNote: 'You get this as the assigner who sent these officials their games.',
          })
          const text = `${by} changed the schedule at ${t.name}. These officials were told:\n\n${e.lines.map(l => `- ${l}`).join('\n')}`
          await sendEmail({ to, subject: `Officials' games changed · ${t.name}`, html, text, ...orgSender(org as any) }).catch(() => null)
        }
        await pushToStaffEmails([to], { title: "Officials' games changed", body: e.lines.length === 1 ? e.lines[0] : `${e.lines.length} changes to officials' games at ${t.name}.`, url: `/tournaments/${tournamentId}`, tag: `chga:${tournamentId}:${now}` }).catch(() => 0)
      }
    }

    // ── Move their "last sent" up to now, so Notify officials doesn't resend this ──
    type Row = { date: string; time: string; field: string; num: string; teams: string; role: string; roleKey: string; division: string }
    let fresh: Sent = {}
    try { const r = await prisma.appSetting.findUnique({ where: { key: noticeKey } }); if (r?.value) fresh = JSON.parse(r.value) || {} } catch {}
    for (const wid of ids) {
      const rows: Row[] = []
      for (const g of games) {
        if (!g.startTime || !g.location) continue
        for (const a of g.assignments) if (a.workerId === wid) rows.push({ date: g.date, time: g.startTime, field: g.location, num: g.gameNumber, teams: `${g.team1} vs ${g.team2}`, role: roleLabel(a.role), roleKey: a.role, division: g.division })
      }
      rows.sort((x, y) => x.date !== y.date ? (x.date < y.date ? -1 : 1) : mins(x.time) - mins(y.time))
      const sigOf = (rs: Row[]) => rs.map(r => [r.date, r.time, r.field, r.num, r.teams, r.role].join('~')).join('|')
      for (const c of CREWS) {
        if (!told(wid, c)) continue
        fresh[`${wid}|${c}`] = { sig: sigOf(rows.filter(r => crewsOf(r.roleKey, r.division, side).includes(c))), sentAt: now }
      }
    }
    const value = JSON.stringify(fresh)
    await prisma.appSetting.upsert({ where: { key: noticeKey }, update: { value }, create: { key: noticeKey, value } }).catch(() => null)
  } catch (e) {
    console.error('[officialChangeAlerts]', e)
  }
}

/** Remember who sent Notify officials to each crew: they're the one told of later changes. */
export async function rememberCrewAssigner(tournamentId: string, crews: Crew[], who: { email: string; name: string }): Promise<void> {
  const email = String(who.email || '').trim().toLowerCase()
  if (!email || !crews.length) return
  const key = `officialCrewAssigner:${tournamentId}`
  try {
    let cur: Record<string, { email: string; name: string }> = {}
    const r = await prisma.appSetting.findUnique({ where: { key } }); if (r?.value) cur = JSON.parse(r.value) || {}
    for (const c of crews) cur[c] = { email, name: String(who.name || '') }
    const value = JSON.stringify(cur)
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  } catch {}
}
