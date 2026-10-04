// "YOU'VE REGISTERED BEFORE WITH j•••@g•••.com"
//
// Bo, Oct 4 2026: "if they use a different email ... but have the same name, club
// name, and other similar things, we should probably ask if they want to log in with
// the email we have on file but allow them to say no if they want to set up a new
// account. ... this would only be if they are using the same person's name. It would
// be in the event they have multiple email addresses and could possibly be using the
// wrong one."
//
// The registration form asks api/registrations/login-hint once a signed-out person
// has typed a club, their name and an email. When the same person (contact name)
// registered the same club (club name) at one of this organizer's events, and their
// login there is under a different email, the form offers that login.
//
// The address is only ever shown masked, so typing a club and a director's name
// can't be used to read anyone's email. The hint token names the login without its
// email (signed with NEXTAUTH_SECRET, 30 minutes), and signing in with it still
// takes that login's password (api/registrations/login-hint/verify).
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { cleanName, nameKey } from '@/lib/names'
import { tournamentOrgId } from '@/lib/org'
import { directorsOf } from '@/lib/clubAccess'

/** "joe.frederick@gmail.com" -> "j•••@g•••.com": enough for the owner to recognize. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = String(email || '').trim().toLowerCase().split('@')
  const labels = domain.split('.').filter(Boolean)
  const tld = labels.length > 1 ? labels[labels.length - 1] : ''
  return `${local.slice(0, 1)}•••@${(labels[0] || '').slice(0, 1)}•••${tld ? `.${tld}` : ''}`
}

const secret = () => process.env.NEXTAUTH_SECRET || ''
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(`loginhint.${payload}`).digest('base64url')

export function signHint(userId: string, ttlMs = 30 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + ttlMs })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** The login a hint names, if the token is ours and still fresh. */
export function readHint(token: string): string | null {
  if (!secret()) return null
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig), b = Buffer.from(sign(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof u === 'string' && u && Number(e) > Date.now() ? u : null
  } catch { return null }
}

export type LoginOnFile = { userId: string; email: string }

/**
 * The login on file for this person at this club, under another email.
 * Null when there's nothing to ask: no earlier registration by this name for this
 * club at this organizer, the typed email is one they already used here, or the
 * only login is under the typed email.
 */
export async function findLoginOnFile(a: { tournamentId: string; clubName: string; contactName: string; email: string }): Promise<LoginOnFile | null> {
  const club = nameKey(a.clubName)
  const person = nameKey(a.contactName)
  const typed = String(a.email || '').trim().toLowerCase()
  if (club.length < 3 || person.length < 4 || !typed || !secret()) return null
  const orgId = await tournamentOrgId(a.tournamentId)
  if (!orgId) return null

  // Narrowed in SQL by the last word of the name, then matched on the loose keys.
  const last = cleanName(a.contactName).split(' ').pop()!.toLowerCase().replace(/[%_]/g, '')
  if (last.length < 2) return null
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT r.id AS id, r.clubName AS clubName, r.clubContact AS clubContact, r.contactEmail AS contactEmail
       FROM "TeamRegistration" r JOIN "Tournament" t ON t.id = r.tournamentId
      WHERE t.orgId = ? AND r.deletedAt IS NULL AND lower(r.clubContact) LIKE ?
      ORDER BY r.createdAt DESC LIMIT 200`, orgId, `%${last}%`)
  const mine = rows.filter(r => nameKey(r.clubName) === club && nameKey(r.clubContact) === person)
  if (!mine.length) return null
  const contactOf = (r: Record<string, unknown>) => String(r.contactEmail || '').trim().toLowerCase()
  if (mine.some(r => contactOf(r) === typed)) return null

  const directors = await directorsOf(mine.map(r => String(r.id)))
  if (mine.some(r => (directors.get(String(r.id)) || []).some(d => d.email === typed))) return null

  // Their logins, newest registration first: the account under that registration's
  // contact email, then a director on it with this person's name.
  const contacts = [...new Set(mine.map(contactOf).filter(Boolean))]
  const accounts = new Map<string, string>()
  if (contacts.length) {
    const users: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, lower(email) AS email FROM "User" WHERE lower(email) IN (${contacts.map(() => '?').join(', ')})`, ...contacts)
    for (const u of users) accounts.set(String(u.email), String(u.id))
  }
  for (const r of mine) {
    const c = contactOf(r)
    if (c && c !== typed && accounts.has(c)) return { userId: accounts.get(c)!, email: c }
    const d = (directors.get(String(r.id)) || []).find(x => x.email !== typed && nameKey(x.name) === person)
    if (d) return { userId: d.userId, email: d.email }
  }
  return null
}

/** A fixed-window counter in AppSetting, for the two public routes. */
export async function overLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    let v = { start: Date.now(), n: 0 }
    try { if (row) v = JSON.parse(row.value) } catch { /* reset */ }
    if (Date.now() - v.start > windowMs) v = { start: Date.now(), n: 0 }
    v.n += 1
    await prisma.appSetting.upsert({ where: { key }, update: { value: JSON.stringify(v) }, create: { key, value: JSON.stringify(v) } })
    return v.n > max
  } catch { return false }
}
