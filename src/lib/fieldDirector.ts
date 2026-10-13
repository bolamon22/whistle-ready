// Field directors work only the events they are assigned to (Bo, Oct 13 2026: Jamie
// Wolf "is just going to be working the event", and there can be several field
// directors on one event). The admin picks each field director's events on Logins,
// a director on Your team; both save AppSetting `fieldDirectorEvents:{userId}` =
// { events: [tournamentId], by, at }.
//
// The list also rides in the login token (lib/auth refreshes it every minute), so
// middleware can turn a field director away from any other event's staff pages and
// API routes in one place. Routes that take the event from the body or the query
// (availability, invites, training sends, a game by id) check it with eventGate() in
// lib/apiAuth. Server only: it reads the database.

import prisma from '@/lib/db'

const PREFIX = 'fieldDirectorEvents:'

function parse(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const v = JSON.parse(value)
    const list = Array.isArray(v?.events) ? v.events : []
    return Array.from(new Set<string>(list.map(String).filter(Boolean)))
  } catch { return [] }
}

/** The events one field director works. */
export async function fieldDirectorEvents(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return []
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PREFIX + userId } })
    return parse(row?.value)
  } catch { return [] }
}

/** The events of several field directors at once (Logins, Your team). */
export async function fieldDirectorEventsMany(userIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (const id of userIds) out[id] = []
  if (!userIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: userIds.map(id => PREFIX + id) } } })
    for (const r of rows) out[r.key.slice(PREFIX.length)] = parse(r.value)
  } catch { /* nobody has events yet */ }
  return out
}

export async function saveFieldDirectorEvents(userId: string, events: string[], by: string): Promise<string[]> {
  const list = Array.from(new Set(events.map(String).filter(Boolean)))
  const value = JSON.stringify({ events: list, by, at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: PREFIX + userId }, create: { key: PREFIX + userId, value }, update: { value } })
  return list
}

/** Every Staff Pool id on the staff roster of these events. */
export async function rosterWorkerIds(tournamentIds: string[]): Promise<Set<string>> {
  if (!tournamentIds.length) return new Set()
  const rows = await prisma.rosterEntry.findMany({ where: { tournamentId: { in: tournamentIds } }, select: { workerId: true } })
  return new Set(rows.map(r => r.workerId))
}
