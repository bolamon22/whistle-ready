// The tournament director area (Bo, Oct 17 2026): on the Assigner plan, Whistle Ready's
// customer is the head assigner, and the head assigner's customer is the tournament
// director. "He needs to be able to add a tournament director because that is their
// customer ... they have to be able to share information with their organization so
// they can see the game schedule or the referee schedule, the fees they got to pay and
// everything else." The tournament director logs in with the role `client` and sees
// only the events picked for them, the same way a field director works
// (lib/fieldDirector). The head assigner picks them on Your team, an admin on Logins;
// both save AppSetting `clientEvents:{userId}` = { events: [tournamentId], by, at }.
// Server only: it reads the database.

import prisma from '@/lib/db'

const PREFIX = 'clientEvents:'

function parse(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const v = JSON.parse(value)
    const list = Array.isArray(v?.events) ? v.events : []
    return Array.from(new Set<string>(list.map(String).filter(Boolean)))
  } catch { return [] }
}

/** The events one tournament director sees. */
export async function clientEvents(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return []
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PREFIX + userId } })
    return parse(row?.value)
  } catch { return [] }
}

/** The events of several tournament directors at once (Your team, Logins). */
export async function clientEventsMany(userIds: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (const id of userIds) out[id] = []
  if (!userIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: userIds.map(id => PREFIX + id) } } })
    for (const r of rows) out[r.key.slice(PREFIX.length)] = parse(r.value)
  } catch { /* nobody has events yet */ }
  return out
}

export async function saveClientEvents(userId: string, events: string[], by: string): Promise<string[]> {
  const list = Array.from(new Set(events.map(String).filter(Boolean)))
  const value = JSON.stringify({ events: list, by, at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: PREFIX + userId }, create: { key: PREFIX + userId, value }, update: { value } })
  return list
}

/** Everyone who sees one event as its tournament director (Staff pay names them). */
export async function clientsOfEvent(tournamentId: string): Promise<string[]> {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } } })
    return rows.filter(r => parse(r.value).includes(tournamentId)).map(r => r.key.slice(PREFIX.length))
  } catch { return [] }
}
