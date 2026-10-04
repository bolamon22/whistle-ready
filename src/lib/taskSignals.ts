import { prisma } from '@/lib/db'
import { getPublicVisibility, todayET } from '@/lib/publicView'
import { waiverCounts } from '@/lib/waiverCounts'
import { ensureHousingCols } from '@/lib/housing'
import { addDays, shortDate } from '@/lib/taskTemplate'

// What the app can already see about some starter-checklist tasks.
//
// A task like "Publish the schedule" or "Payment reminder to unpaid clubs" is
// answered by data Whistle Ready keeps anyway, so the task shows it live ("4
// clubs unpaid") instead of Bo looking it up. Four of them can check
// themselves off (AUTO_DONE): when the schedule is published, when every club
// has paid, when every balance is paid, and when every game has its refs. The
// rest only report -- an affidavit still has to be notarized and filed even
// when every background check is current, and "enough trainers" is Bo's call.
//
// Each signal is computed only for the keys asked for, one tournament at a
// time, and a signal that fails is simply left out: the task list must load
// even when one of these queries doesn't.

export type Signal = { label: string; done?: boolean }

/** Tracked tasks the app checks off by itself, once (lib/tasks applySignals). */
export const AUTO_DONE = new Set(['publish', 'payrem', 'unpaid', 'refs'])

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function isTrainer(w: { defaultRole?: string | null; roles?: string | null }): boolean {
  if (w.defaultRole === 'athletic_trainer') return true
  try {
    const r = JSON.parse(w.roles || '[]')
    return Array.isArray(r) && r.includes('athletic_trainer')
  } catch { return false }
}

async function money(tournamentId: string, keys: Set<string>, out: Record<string, Signal>) {
  const regs: { invoiceAmount: number; discountAmount: number; payments: { amount: number }[] }[] = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: null },
    select: { invoiceAmount: true, discountAmount: true, payments: { select: { amount: true } } },
  })
  const owing = regs.filter(r => (r.invoiceAmount - r.discountAmount) - r.payments.reduce((s, p) => s + p.amount, 0) > 0.005).length
  if (keys.has('payrem')) {
    out.payrem = !regs.length ? { label: 'No clubs registered yet', done: false }
      : owing ? { label: count(owing, 'club unpaid', 'clubs unpaid'), done: false }
      : { label: 'Every club has paid', done: true }
  }
  if (keys.has('unpaid')) {
    out.unpaid = !regs.length ? { label: 'No clubs registered yet', done: false }
      : owing ? { label: count(owing, 'club owes a balance', 'clubs owe a balance'), done: false }
      : { label: 'Every balance is paid', done: true }
  }
}

async function publish(tournamentId: string, out: Record<string, Signal>) {
  const vis = await getPublicVisibility(tournamentId)
  const day = String(vis.publishedAt || '').slice(0, 10)
  out.publish = vis.publishedAt
    ? { label: day ? `Published ${shortDate(day)}` : 'Published', done: true }
    : { label: 'Not published yet', done: false }
}

async function refs(tournamentId: string, out: Record<string, Signal>) {
  const games: { refCount: number; assignments: { role: string }[] }[] = await prisma.game.findMany({
    where: { tournamentId, isCanceled: false },
    select: { refCount: true, assignments: { select: { role: true } } },
  })
  // Refs only -- a scorekeeper on the game is not one of its officials. The
  // game's own refCount (2 unless set otherwise) is how many it needs.
  const short = games.filter(g => g.assignments.filter(a => String(a.role || '').startsWith('ref')).length < (g.refCount || 2)).length
  out.refs = !games.length ? { label: 'No games yet', done: false }
    : short ? { label: count(short, 'game short of refs', 'games short of refs'), done: false }
    : { label: 'Every game has its refs', done: true }
}

async function roster(tournamentId: string, keys: Set<string>, out: Record<string, Signal>) {
  const entries: { workerId: string; worker: { defaultRole: string | null; roles: string | null } }[] = await prisma.rosterEntry.findMany({
    where: { tournamentId },
    select: { workerId: true, worker: { select: { defaultRole: true, roles: true } } },
  })
  if (keys.has('trainers')) {
    const n = entries.filter(e => isTrainer(e.worker)).length
    out.trainers = { label: n ? count(n, 'athletic trainer on the roster', 'athletic trainers on the roster') : 'No athletic trainers on the roster yet' }
  }
  if (keys.has('affidavit')) {
    if (!entries.length) { out.affidavit = { label: 'No staff on the roster yet' }; return }
    // Counties re-screen every 12 months, the same rule the Exhibit A page flags.
    const yearAgo = addDays(todayET(), -365)
    const dates = new Map<string, string>()
    try {
      const ids = entries.map(e => e.workerId)
      const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
        `SELECT id, "bgCheckDate" FROM "Worker" WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      for (const r of rows) dates.set(String(r.id), String(r.bgCheckDate || '').slice(0, 10))
    } catch { /* column not created yet: nobody has a date on file */ }
    const need = entries.filter(e => { const d = dates.get(e.workerId) || ''; return !d || d < yearAgo }).length
    out.affidavit = need
      ? { label: count(need, 'staff member needs a background check', 'staff need a background check') }
      : { label: 'Every rostered staff member has a current check' }
  }
}

async function waivers(tournamentId: string, out: Record<string, Signal>) {
  const regs: { clubName: string; teams: { clubName: string; teamName: string; waitlisted: boolean }[] }[] = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: null },
    select: { clubName: true, teams: { select: { clubName: true, teamName: true, waitlisted: true } } },
  })
  const teams = regs.flatMap(r => r.teams.filter(t => !t.waitlisted).map(t => ({ club: t.clubName || r.clubName, team: t.teamName })))
  if (!teams.length) { out.waivers = { label: 'No teams registered yet' }; return }
  const counts = await waiverCounts(tournamentId)
  const none = teams.filter(t => counts.forTeam(t.club, t.team) === 0).length
  out.waivers = none
    ? { label: count(none, 'team with no waivers yet', 'teams with no waivers yet') }
    : { label: 'Every team has waivers in' }
}

async function roomNights(tournamentId: string, keys: Set<string>, out: Record<string, Signal>) {
  await ensureHousingCols()
  // hotelRooms x hotelNights is kept equal to the club's real room-night total
  // across all its bookings (lib/housing syncRegAggregates) -- the Travel page's figure.
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM("hotelRooms" * "hotelNights"), 0) AS n FROM "TeamRegistration" WHERE "tournamentId" = ? AND "deletedAt" IS NULL`,
    tournamentId)
  const n = Number(rows?.[0]?.n) || 0
  const s: Signal = { label: n ? `${n} room nights so far` : 'No room nights recorded yet' }
  if (keys.has('rooms')) out.rooms = s
  if (keys.has('report')) out.report = s
}

/** Signals for the given template keys of one tournament. Never throws. */
export async function signalsFor(tournamentId: string, keys: Set<string>): Promise<Record<string, Signal>> {
  const out: Record<string, Signal> = {}
  const has = (...k: string[]) => k.some(x => keys.has(x))
  const jobs: Promise<void>[] = []
  if (has('payrem', 'unpaid')) jobs.push(money(tournamentId, keys, out))
  if (has('publish')) jobs.push(publish(tournamentId, out))
  if (has('refs')) jobs.push(refs(tournamentId, out))
  if (has('trainers', 'affidavit')) jobs.push(roster(tournamentId, keys, out))
  if (has('waivers')) jobs.push(waivers(tournamentId, out))
  if (has('rooms', 'report')) jobs.push(roomNights(tournamentId, keys, out))
  const results = await Promise.allSettled(jobs)
  for (const r of results) if (r.status === 'rejected') console.error('[taskSignals] a signal failed (left out):', r.reason)
  return out
}
