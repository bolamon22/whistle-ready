import { prisma } from '@/lib/db'
import { sendEmail, orgSender, OFFICE_CC } from '@/lib/email'
import { orgForTournament } from '@/lib/org'

// A club asking the tournament office to change something on its registration.
//
// Two doors lead here: "Something changed" in the confirm-your-teams email
// (api/registrations/[id]/confirm) and Request a change in the club portal
// (api/club-director/request). Both raise the same amber flag on the
// registrations page -- confirmStatus 'change_requested', with the request in
// confirmNote -- and send the office a heads-up, so staff work one queue.
// "Change made" there files the note into the registration's notes and asks the
// club to confirm the updated list.
//
// The confirm columns are raw (not in the Prisma schema), added by a guarded
// ALTER like the app's other late columns.

export const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

export async function ensureConfirmCols(): Promise<void> {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmStatus" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmNote" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
}

export type ConfirmState = { status: string; note: string; at: string }

/** Confirm state for several registrations at once (empty strings when unset). */
export async function readConfirmMany(regIds: string[]): Promise<Map<string, ConfirmState>> {
  const out = new Map<string, ConfirmState>()
  if (!regIds.length) return out
  await ensureConfirmCols()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, "confirmStatus", "confirmNote", "confirmAt" FROM "TeamRegistration" WHERE id IN (${regIds.map(() => '?').join(',')})`,
    ...regIds)
  for (const r of rows) {
    out.set(String(r.id), { status: String(r.confirmStatus || ''), note: String(r.confirmNote || ''), at: String(r.confirmAt || '') })
  }
  return out
}

/** "Oct 3, 4:12 PM" on the office's clock. Vercel runs in UTC, so an evening
 *  request would otherwise read as the next morning. */
export function officeStamp(d: Date = new Date()): string {
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export type ChangeSource = 'email' | 'portal'

/**
 * Put a request on the registration and tell the office.
 *
 * A request made while another is still open goes under it, not over it. The
 * confirm route used to replace the note, so a club that wrote twice left the
 * office looking at only the second message. The flag keeps the time the first
 * open request came in; each later one carries its own time in the text.
 */
export async function fileChangeRequest(
  reg: { id: string; tournamentId: string; clubName: string },
  message: string,
  source: ChangeSource,
): Promise<{ status: 'change_requested'; at: string; note: string }> {
  const text = message.trim().slice(0, 1200)
  const cur = (await readConfirmMany([reg.id])).get(reg.id) || { status: '', note: '', at: '' }
  const now = new Date().toISOString()
  const line = source === 'portal' ? `From the club portal, ${officeStamp()}: ${text}` : text
  const open = cur.status === 'change_requested' && cur.note.trim() !== ''
  const note = open
    ? `${cur.note.trim()}\n${source === 'portal' ? line : `Also, ${officeStamp()}: ${text}`}`.slice(-4000)
    : line
  const at = open && cur.at ? cur.at : now
  await prisma.$executeRawUnsafe(
    `UPDATE "TeamRegistration" SET "confirmStatus" = 'change_requested', "confirmNote" = ?, "confirmAt" = ? WHERE id = ?`,
    note, at, reg.id)

  // Office heads-up, so a request never sits unseen until the next page visit.
  try {
    const t = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true } })
    const org = await orgForTournament(reg.tournamentId)
    const from = source === 'portal' ? 'from the club portal' : 'from the confirm-your-teams email'
    await sendEmail({
      ...orgSender(org),
      to: OFFICE_CC,
      subject: `Change request — ${reg.clubName} (${t?.name || 'tournament'})`,
      html: `<div style="font-family: sans-serif; max-width: 440px; margin: 0 auto; padding: 28px 24px;">
        <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 4px;">${esc(reg.clubName)} requested a change</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0 0 14px;">${esc(t?.name || 'the tournament')} · ${from}</p>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 14px; color: #713f12; font-size: 14px; white-space: pre-line;">${esc(text)}</div>
        ${open ? `<p style="color: #64748b; font-size: 13px; margin: 12px 0 0;">They have an earlier request open too. Both are on the registration.</p>` : ''}
        <a href="${APP_URL}/tournaments/${reg.tournamentId}/registrations"
          style="display: inline-block; margin-top: 18px; background: #14b8a6; color: white; font-weight: 600; font-size: 13px; padding: 10px 22px; border-radius: 10px; text-decoration: none;">
          Open registrations &rarr;
        </a>
      </div>`,
    })
  } catch { /* the flag on the page is the record; the email is a bonus */ }

  return { status: 'change_requested', at, note }
}
