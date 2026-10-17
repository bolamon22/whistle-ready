// Who the tournament director is for one event on the Assigner plan (Bo, Oct 17 2026:
// "I don't see where ... I can add them to an existing tournament. Do they need to be
// invited first? We should be able to just add their name in at least."). Just a name
// is enough; email and phone are for reaching them and for inviting them to log in.
// AppSetting `eventClient:{tournamentId}` = { name, email, phone, by, at }.
//
// An invite sent from the event carries the event with it: AppSetting
// `clientInviteEvents:{token}` = { events }. Whoever accepts THAT invite gets those
// events (lib/clientEvents); nothing is ever granted because an email matches.
// Server only.

import prisma from '@/lib/db'

export type EventClient = { name: string; email: string; phone: string }

const contactKey = (tournamentId: string) => 'eventClient:' + tournamentId
const inviteKey = (token: string) => 'clientInviteEvents:' + token
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export function normalizeEventClient(v: unknown): EventClient {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { name: clip(o.name, 120), email: clip(o.email, 200).toLowerCase(), phone: clip(o.phone, 40) }
}

export async function eventClientOf(tournamentId: string): Promise<EventClient | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: contactKey(tournamentId) } })
    if (!row?.value) return null
    const c = normalizeEventClient(JSON.parse(row.value))
    return c.name ? c : null
  } catch { return null }
}

/** Saves the tournament director's name, email and phone; an empty name clears them. */
export async function saveEventClient(tournamentId: string, c: EventClient, by: string): Promise<EventClient | null> {
  if (!c.name) {
    await prisma.appSetting.deleteMany({ where: { key: contactKey(tournamentId) } })
    return null
  }
  const value = JSON.stringify({ ...c, by, at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: contactKey(tournamentId) }, create: { key: contactKey(tournamentId), value }, update: { value } })
  return c
}

/** The events an invite was sent for (accepting it gives the new login these). */
export async function inviteEvents(token: string): Promise<string[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: inviteKey(token) } })
    const v = row?.value ? JSON.parse(row.value) : null
    return Array.isArray(v?.events) ? v.events.map(String).filter(Boolean) : []
  } catch { return [] }
}

export async function saveInviteEvents(token: string, events: string[]): Promise<void> {
  const value = JSON.stringify({ events: Array.from(new Set(events.map(String).filter(Boolean))), at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: inviteKey(token) }, create: { key: inviteKey(token), value }, update: { value } })
}

/** The invites still waiting that were sent for this event, newest first. */
export async function pendingInvitesFor(tournamentId: string): Promise<{ token: string; email: string; name: string | null; createdAt: string }[]> {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'clientInviteEvents:' } } })
    const tokens = rows.filter(r => { try { return (JSON.parse(r.value)?.events ?? []).includes(tournamentId) } catch { return false } }).map(r => r.key.slice('clientInviteEvents:'.length))
    if (!tokens.length) return []
    const invites = await prisma.staffInvite.findMany({ where: { token: { in: tokens }, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
    return invites.map(i => ({ token: i.token, email: i.email, name: i.name, createdAt: i.createdAt.toISOString() }))
  } catch { return [] }
}
