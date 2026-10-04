// A CLUB DIRECTOR ADDS ANOTHER DIRECTOR BY EMAIL
//
// Access is per registration (lib/clubAccess). A club that has two directors at
// once (Jupiter Revolution: "I would like to keep them both involved"), or a new
// director taking over mid-season, gets the second person in this way: a director
// already on the registration types their email in the portal, and that address
// gets a single-use link to set up a login, or sign in with an existing one, and
// open the registration (Bo, Oct 4 2026: "Director adds them").
//
// The link goes to the invited address, so following it proves the inbox, the
// same proof the claim link in a registration letter carries. It opens the claim
// page (/claim/<token>): lib/claim lookupClaimToken knows both kinds of token.
//
// Stored in AppSetting: dirinvite:<token> holds the invite, and dirinvites:<regId>
// lists a registration's open invites so the portal can show them.
import crypto from 'crypto'
import { prisma } from '@/lib/db'

export const INVITE_DAYS = 14
const INVITES_PER_DAY = 10

export type Invite = {
  token: string
  registrationId: string
  tournamentId: string
  email: string
  name: string
  by: string
  byUserId: string
  at: string
  exp: number
}
export type PendingInvite = { email: string; name: string; by: string; at: string }

const tokenKey = (t: string) => `dirinvite:${t}`
const listKey = (regId: string) => `dirinvites:${regId}`
const countKey = (regId: string) => `dirinvitecount:${regId}`

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    return row ? JSON.parse(row.value || 'null') ?? fallback : fallback
  } catch { return fallback }
}
async function writeJson(key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value)
  await prisma.appSetting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
}

type ListEntry = { token: string; email: string; name: string; by: string; at: string; exp: number }

async function openList(registrationId: string): Promise<ListEntry[]> {
  const list = await readJson<ListEntry[]>(listKey(registrationId), [])
  return Array.isArray(list) ? list.filter(e => e && e.exp > Date.now()) : []
}

/** A registration's invites still waiting to be used, newest first. */
export async function pendingInvites(registrationIds: string[]): Promise<Map<string, PendingInvite[]>> {
  const out = new Map<string, PendingInvite[]>()
  for (const id of [...new Set(registrationIds.filter(Boolean))]) {
    const list = await openList(id)
    if (list.length) out.set(id, list.slice().reverse().map(({ email, name, by, at }) => ({ email, name, by, at })))
  }
  return out
}

/**
 * Make an invite. Replaces an open one to the same address (a resend), and says no
 * after INVITES_PER_DAY for one registration in a day, so the portal can't be used
 * to flood someone's inbox.
 */
export async function createInvite(a: Omit<Invite, 'token' | 'at' | 'exp'>): Promise<{ ok: true; invite: Invite } | { ok: false; error: string }> {
  const email = a.email.trim().toLowerCase()
  const list = await openList(a.registrationId)
  // Counted separately from the open list, so cancelling and re-sending can't get
  // round the cap.
  const day = new Date().toISOString().slice(0, 10)
  const count = await readJson<{ day: string; n: number }>(countKey(a.registrationId), { day, n: 0 })
  const sentToday = count.day === day ? Number(count.n) || 0 : 0
  if (sentToday >= INVITES_PER_DAY) {
    return { ok: false, error: 'That is a lot of invites for one day. Try again tomorrow, or ask the tournament office.' }
  }
  await writeJson(countKey(a.registrationId), { day, n: sentToday + 1 })
  const invite: Invite = {
    ...a, email,
    token: crypto.randomBytes(32).toString('base64url'),
    at: new Date().toISOString(),
    exp: Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
  }
  for (const old of list.filter(e => e.email === email)) {
    try { await prisma.appSetting.delete({ where: { key: tokenKey(old.token) } }) } catch { /* already gone */ }
  }
  await writeJson(tokenKey(invite.token), invite)
  await writeJson(listKey(a.registrationId), [
    ...list.filter(e => e.email !== email),
    { token: invite.token, email, name: invite.name, by: invite.by, at: invite.at, exp: invite.exp },
  ])
  return { ok: true, invite }
}

/** The invite behind a token, if it is still good. */
export async function lookupInvite(token: string): Promise<Invite | null> {
  const t = String(token || '').trim()
  if (t.length < 20) return null
  const inv = await readJson<Invite | null>(tokenKey(t), null)
  if (!inv || !inv.registrationId || !inv.email || !(inv.exp > Date.now())) return null
  return inv
}

/** Used: the link stops working and it leaves the portal's open list. */
export async function consumeInvite(inv: Pick<Invite, 'token' | 'registrationId'>): Promise<void> {
  try { await prisma.appSetting.delete({ where: { key: tokenKey(inv.token) } }) } catch { /* already gone */ }
  try {
    const list = await openList(inv.registrationId)
    await writeJson(listKey(inv.registrationId), list.filter(e => e.token !== inv.token))
  } catch { /* the list entry expires on its own */ }
}

/** Take back an open invite to an address (a typo, or the wrong person). */
export async function cancelInvite(registrationId: string, email: string): Promise<boolean> {
  const addr = email.trim().toLowerCase()
  const list = await openList(registrationId)
  const gone = list.filter(e => e.email === addr)
  if (!gone.length) return false
  for (const e of gone) {
    try { await prisma.appSetting.delete({ where: { key: tokenKey(e.token) } }) } catch { /* already gone */ }
  }
  await writeJson(listKey(registrationId), list.filter(e => e.email !== addr))
  return true
}
