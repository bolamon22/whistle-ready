// Giving a tournament director a login (lib/clientEvents), from Your team or from the
// event's Tournament director page (lib/eventClient). A login that exists already is
// put in the organization as its tournament director right away (with the event, when
// there is one); anyone else gets an invite letter saying the head assigner's
// organization shared their tournament, and the event rides with that invite.
// Server only.

import crypto from 'crypto'
import { createClient } from '@libsql/client'
import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { orgById } from '@/lib/org'
import { addToOrg, roleIn } from '@/lib/orgMembers'
import { clientEvents, saveClientEvents } from '@/lib/clientEvents'
import { saveInviteEvents } from '@/lib/eventClient'
import { ensureStaffInviteTable } from '@/lib/staffInviteTable'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app'
const esc = (v: string) => v.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))

export type ClientInviteResult =
  | { ok: true; assigned: true; member: boolean; userId: string }
  | { ok: true; assigned: false; inviteUrl: string }
  | { ok: false; status: number; error: string }

/** keepRole: from an event's page, where one button must never change the role of
 *  someone already on the team (a referee, or the head assigner himself). Your team
 *  leaves it off: picking a role there is how roles change. */
export async function inviteClient(o: { email: string; name: string | null; orgId: string; by: string; events?: string[]; keepRole?: boolean }): Promise<ClientInviteResult> {
  const email = String(o.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'Add their email first.' }
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  await ensureStaffInviteTable()
  const events = (o.events ?? []).map(String).filter(Boolean)

  // Already has a login: their tournament director now, with the event.
  const had = await db.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [email] })
  if (had.rows[0]?.id) {
    const userId = String(had.rows[0].id)
    if (o.keepRole) {
      const now = await roleIn(userId, o.orgId)
      if (now && now !== 'client') return { ok: false, status: 409, error: 'That email already has a role on your team, so it stays as it is. Use a different email, or change their role on Your team.' }
    }
    const r = await addToOrg(userId, o.orgId, 'client', o.by)
    if (!r.ok) return r
    if (events.length) await saveClientEvents(userId, [...(await clientEvents(userId)), ...events], o.by)
    return { ok: true, assigned: true, member: r.how === 'member', userId }
  }

  // Otherwise an invite, with the event riding on it.
  await prisma.staffInvite.updateMany({ where: { email, usedAt: null }, data: { expiresAt: new Date() } })
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.staffInvite.create({ data: { token, email, name: o.name, tournamentId: null, expiresAt: new Date(Date.now() + 7 * 864e5) } })
  await db.execute({ sql: `UPDATE "StaffInvite" SET orgId = ?, loginRole = 'client' WHERE token = ?`, args: [o.orgId, token] })
  if (events.length) await saveInviteEvents(token, events)
  const inviteUrl = `${APP_URL}/invite/${token}`
  const orgName = (await orgById(o.orgId))?.name || 'Your assigner'
  await sendEmail({
    to: email, subject: `${orgName} shared your tournament on Whistle Ready`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px"><h2 style="color:#0f172a">${esc(orgName)} shared your tournament</h2><p style="color:#475569">${o.name ? `Hi ${esc(o.name)}, ` : ''}${esc(orgName)} assigns your officials in Whistle Ready. Set up your login to see the schedule with who is on each game and their phone numbers, and Staff pay: what each person earned and how they want to be paid.</p><a href="${inviteUrl}" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">Set up my login →</a><p style="color:#94a3b8;font-size:13px;margin-top:24px">Link expires in 7 days.</p></div>`,
  })
  return { ok: true, assigned: false, inviteUrl }
}
