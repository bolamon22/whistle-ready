// Deleting an organization (Bo, Oct 18 2026: test organizations "were just test
// organizations ... I need to be able to delete orgs or archive ones that actually
// have a history"). Bo's picks: its logins are kept but taken out of it; any money
// on record blocks the delete (archive those instead, lib/orgArchive); Sunshine
// Events Group can never be deleted.
//
// What goes: its events and everything under them (games, assignments, roster,
// availability, time entries, registrations, pools and brackets), its Staff Pool,
// its settings (AppSetting keys ending in the org's or an event's id), its tasks,
// costs, contacts, gallery, form submissions and social accounts, its pending
// invites, and the organization. Children are deleted before parents and the
// organization last, so a run that stops partway can simply be run again.
// Server only.

import { prisma } from '@/lib/db'
import { MAIN_ORG_SLUG, forgetArchived } from '@/lib/orgArchive'

export type OrgImpact = {
  org: { id: string; name: string; slug: string }
  events: number; games: number; registrations: number; staffPool: number; logins: number; forms: number
  /** Team payments, staff pay records and event income or expenses: any of these blocks the delete. */
  payments: number
  /** Its Staff Pool people's games or pay at other organizations' events (blocks it too). */
  elsewhere: number
  /** Why it can't be deleted, if it can't. */
  blocked: string | null
}

const chunk = <T,>(a: T[], n = 400): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }
async function each(ids: string[], fn: (part: string[]) => Promise<unknown>): Promise<void> { for (const part of chunk(ids)) await fn(part) }
async function count(ids: string[], fn: (part: string[]) => Promise<number>): Promise<number> { let n = 0; for (const part of chunk(ids)) n += await fn(part); return n }
const raw = async (sql: string, ...args: unknown[]) => { try { return Number(await prisma.$executeRawUnsafe(sql, ...args)) } catch { return 0 } }   // table may not exist yet
const rawCount = async (sql: string, ...args: unknown[]) => { try { const r = await prisma.$queryRawUnsafe<{ n: number | bigint }[]>(sql, ...args); return Number(r[0]?.n ?? 0) } catch { return 0 } }

async function eventsOf(orgId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Tournament" WHERE orgId = ?`, orgId)
  return rows.map(r => String(r.id))
}

export async function orgImpact(orgId: string): Promise<OrgImpact | null> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; name: string; slug: string }[]>(`SELECT id, name, slug FROM "Organization" WHERE id = ?`, orgId)
  if (!rows[0]) return null
  const org = { id: String(rows[0].id), name: String(rows[0].name || ''), slug: String(rows[0].slug || '') }
  const tids = await eventsOf(orgId)
  const workers = (await prisma.worker.findMany({ where: { orgId }, select: { id: true } })).map(w => w.id)
  const [games, registrations, teamPay, staffPay, ledger, elsewhereGames, elsewherePay] = await Promise.all([
    count(tids, p => prisma.game.count({ where: { tournamentId: { in: p } } })),
    count(tids, p => prisma.teamRegistration.count({ where: { tournamentId: { in: p } } })),
    count(tids, p => prisma.registrationPayment.count({ where: { registration: { tournamentId: { in: p } } } })),
    count(tids, p => prisma.paymentRecord.count({ where: { tournamentId: { in: p } } })),
    count(tids, p => prisma.tournamentTransaction.count({ where: { tournamentId: { in: p } } })),
    count(workers, p => prisma.assignment.count({ where: { workerId: { in: p }, game: { tournamentId: { notIn: tids } } } })),
    count(workers, p => prisma.paymentRecord.count({ where: { workerId: { in: p }, tournamentId: { notIn: tids } } })),
  ])
  const logins = await rawCount(`SELECT COUNT(*) AS n FROM (SELECT id FROM "User" WHERE orgId = ? AND role <> 'admin' UNION SELECT "userId" FROM "OrgMember" WHERE "orgId" = ?)`, orgId, orgId)
    || await rawCount(`SELECT COUNT(*) AS n FROM "User" WHERE orgId = ? AND role <> 'admin'`, orgId)
  const forms = await rawCount(`SELECT COUNT(*) AS n FROM "OrgFormSubmission" WHERE "orgId" = ?`, orgId)
  // Approved receipts are money spent (lib/eventExpenses).
  const receipts = await rawCount(`SELECT COUNT(*) AS n FROM "EventExpense" WHERE "orgId" = ? AND "deletedAt" = '' AND "status" = 'approved'`, orgId)
  const payments = teamPay + staffPay + ledger + receipts
  const elsewhere = elsewhereGames + elsewherePay
  const blocked = org.slug === MAIN_ORG_SLUG ? 'Sunshine Events Group can’t be deleted.'
    : payments ? `Its events have ${payments} payment${payments === 1 ? '' : 's'} on record (team payments, staff pay, receipts or event income and expenses). Archive it instead.`
    : elsewhere ? `${elsewhere} game${elsewhere === 1 ? '' : 's'} or pay record${elsewhere === 1 ? '' : 's'} of its Staff Pool belong to other organizations' events. Archive it instead.`
    : null
  return { org, events: tids.length, games, registrations, staffPool: workers.length, logins, forms, payments, elsewhere, blocked }
}

export type DeleteResult = { ok: true; impact: OrgImpact } | { ok: false; status: number; error: string }

/** Deletes the organization. `confirm` must be its name (any capitals). */
export async function deleteOrg(orgId: string, confirm: string, by: string): Promise<DeleteResult> {
  const impact = await orgImpact(orgId)
  if (!impact) return { ok: false, status: 404, error: 'Not found' }
  if (impact.blocked) return { ok: false, status: 409, error: impact.blocked }
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  if (norm(confirm || '') !== norm(impact.org.name)) return { ok: false, status: 400, error: `Type ${impact.org.name} to delete it.` }

  const tids = await eventsOf(orgId)
  const workers = (await prisma.worker.findMany({ where: { orgId }, select: { id: true } })).map(w => w.id)
  const games: string[] = [], regs: string[] = [], players: string[] = [], brackets: string[] = [], posts: string[] = []
  await each(tids, async p => {
    games.push(...(await prisma.game.findMany({ where: { tournamentId: { in: p } }, select: { id: true } })).map(x => x.id))
    regs.push(...(await prisma.teamRegistration.findMany({ where: { tournamentId: { in: p } }, select: { id: true } })).map(x => x.id))
    players.push(...(await prisma.playerRegistration.findMany({ where: { tournamentId: { in: p } }, select: { id: true } })).map(x => x.id))
    brackets.push(...(await prisma.bracket.findMany({ where: { tournamentId: { in: p } }, select: { id: true } })).map(x => x.id))
  })
  try { posts.push(...(await prisma.scheduledPost.findMany({ where: { orgId }, select: { id: true } })).map(x => x.id)) } catch { /* none */ }

  // Each step on its own: a table this database doesn't have yet is skipped, and any
  // other failure stops short of deleting the organization, so it is still listed
  // and Delete can be run again.
  const failed: string[] = []
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn() } catch (e) {
      const msg = String((e as Error)?.message || e)
      if (!/does not exist|no such table|P2021/i.test(msg)) failed.push(`${name}: ${msg.split('\n').filter(Boolean).pop()?.slice(0, 160)}`)
    }
  }
  // Children first.
  await step('assignments', () => each(games, p => prisma.assignment.deleteMany({ where: { gameId: { in: p } } })))
  await step('assignments', () => each(workers, p => prisma.assignment.deleteMany({ where: { workerId: { in: p } } })))
  await step('team payments', () => each(regs, p => prisma.registrationPayment.deleteMany({ where: { registrationId: { in: p } } })))
  await step('teams', () => each(regs, p => prisma.registeredTeam.deleteMany({ where: { registrationId: { in: p } } })))
  await step('parent links', () => each(players, p => prisma.parentPlayerLink.deleteMany({ where: { playerRegistrationId: { in: p } } })))
  await step('bracket games', () => each(brackets, p => prisma.bracketGame.deleteMany({ where: { bracketId: { in: p } } })))
  await step('post insights', () => each(posts, p => prisma.postInsightSnapshot.deleteMany({ where: { scheduledPostId: { in: p } } })))
  await step('roster', () => each(workers, p => prisma.rosterEntry.deleteMany({ where: { workerId: { in: p } } })))
  await step('availability', () => each(workers, p => prisma.availability.deleteMany({ where: { workerId: { in: p } } })))
  await step('time entries', () => each(workers, p => prisma.timeEntry.deleteMany({ where: { workerId: { in: p } } })))
  await step('staff pay', () => each(workers, p => prisma.paymentRecord.deleteMany({ where: { workerId: { in: p } } })))
  const byEvent: [string, (w: { tournamentId: { in: string[] } }) => Promise<unknown>][] = [
    ['games', w => prisma.game.deleteMany({ where: w })],
    ['registrations', w => prisma.teamRegistration.deleteMany({ where: w })],
    ['player registrations', w => prisma.playerRegistration.deleteMany({ where: w })],
    ['individual registrations', w => prisma.individualRegistration.deleteMany({ where: w })],
    ['roster', w => prisma.rosterEntry.deleteMany({ where: w })],
    ['availability', w => prisma.availability.deleteMany({ where: w })],
    ['time entries', w => prisma.timeEntry.deleteMany({ where: w })],
    ['staff pay', w => prisma.paymentRecord.deleteMany({ where: w })],
    ['event income and expenses', w => prisma.tournamentTransaction.deleteMany({ where: w })],
    ['brackets', w => prisma.bracket.deleteMany({ where: w })],
    ['pools', w => prisma.pool.deleteMany({ where: w })],
    ['audit log', w => prisma.auditLog.deleteMany({ where: w })],
    ['event follows', w => prisma.userTournamentFollow.deleteMany({ where: w })],
    ['team follows', w => prisma.userTeamFollow.deleteMany({ where: w })],
    ['club director links', w => prisma.clubDirectorLink.deleteMany({ where: w })],
    ['coach profiles', w => prisma.coachProfile.deleteMany({ where: w })],
    ['event invites', w => prisma.staffInvite.deleteMany({ where: w })],
  ]
  for (const [name, del] of byEvent) await step(name, () => each(tids, p => del({ tournamentId: { in: p } })))
  if (failed.length) return { ok: false, status: 500, error: `Not everything could be deleted, so the organization is still here. Try again. (${failed.join('; ')})` }
  await step('events', () => each(tids, p => prisma.tournament.deleteMany({ where: { id: { in: p } } })))
  // Each event's own settings (keys like staffRelease:<id>, eventTeams:<id>).
  for (const tid of tids) await raw(`DELETE FROM "AppSetting" WHERE key LIKE ? OR key LIKE ?`, `%:${tid}`, `%:${tid}:%`)
  await step('Staff Pool', () => each(workers, p => prisma.worker.deleteMany({ where: { id: { in: p } } })))
  if (failed.length) return { ok: false, status: 500, error: `Not everything could be deleted, so the organization is still here. Try again. (${failed.join('; ')})` }
  for (const table of ['EventCost', 'EventPlanLine', 'EventExpense', 'ExpenseReceipt', 'GalleryMedia', 'OrgContact', 'OrgFormSubmission', 'OrgTask', 'ParentWaiverLink', 'ScheduledPost', 'SocialAccount', 'StaffInvite', 'OrgMember']) {
    await raw(`DELETE FROM "${table}" WHERE "orgId" = ?`, orgId)
  }
  // Its logins stay, out of it; an admin's is never touched.
  await raw(`UPDATE "User" SET orgId = NULL WHERE orgId = ? AND role <> 'admin'`, orgId)
  await raw(`DELETE FROM "AppSetting" WHERE key LIKE ? OR key LIKE ?`, `%:${orgId}`, `%:${orgId}:%`)
  await prisma.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id = ?`, orgId)
  forgetArchived()

  // A record of it, since the rows themselves are gone.
  try {
    const key = 'orgDeleteLog'
    const row = await prisma.appSetting.findUnique({ where: { key } })
    const log = (() => { try { const v = JSON.parse(row?.value || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } })()
    log.unshift({ at: new Date().toISOString(), by: String(by || '').slice(0, 120), ...impact.org, events: impact.events, games: impact.games, registrations: impact.registrations, staffPool: impact.staffPool, logins: impact.logins, forms: impact.forms })
    const value = JSON.stringify(log.slice(0, 200))
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  } catch { /* the delete stands */ }
  return { ok: true, impact }
}
