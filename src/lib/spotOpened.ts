// "A spot opened" -- the email a club gets when staff take one of its teams off
// the waiting list.
//
// Promoting a team used to be a checkbox plus an email Bo had to remember to write:
// the invoice re-rated correctly (a waitlisted team is unbilled, so it moves from
// $0 to the schedule price), but nothing told the club they were in. Three weeks
// out, a club that does not know it has a spot is a club that has made other plans.
//
// Rides the payment-letter machinery on purpose: the invoice table, Pay button and
// ACH/card fee note are the same fixed chrome every pay email carries, so a
// promoted club gets the exact same, already-trusted way to pay.
import { prisma } from '@/lib/db'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { renderEmail } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetter'
import { buildPayReminderEmail, mergePayLetter, countdownPhrase } from '@/lib/payLetter'
import { clubRecipients, clubDirectorEmailMap } from '@/lib/clubDirectorLinks'

export type PromotedTeam = { teamName: string; division: string }

const listJoin = (xs: string[]) => xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]

/** The letter text. Plain text, not markdown: letterBodyHtml escapes and splits on
 *  blank lines, so ** would ship as literal asterisks. */
export function spotOpenedText(promoted: PromotedTeam[], owes: boolean): { subject: string; body: string } {
  const one = promoted.length === 1
  const names = listJoin(promoted.map(p => p.teamName || 'your team'))
  const where = one && promoted[0].division ? ` in ${promoted[0].division}` : ''
  const subject = `Good news — ${one ? 'a spot opened' : 'spots opened'} for ${names} at {event}`
  const opening = one
    ? `Good news — a spot opened up${where}, and ${names} is now in for {event}!`
    : `Good news — spots opened up, and ${listJoin(promoted.map(p => `${p.teamName || 'your team'}${p.division ? ` (${p.division})` : ''}`))} are now in for {event}!`
  const middle = owes
    ? `{event} is {countdown}, so we'd love to get you confirmed. Your updated balance is {balance}, and payment is what locks in the spot — the button below takes about a minute.

• Bank transfer (ACH) — no fee
• Credit card — 3% processing fee

If anything has changed and you can no longer make it, just reply and let us know so we can offer the spot to the next team on the list.`
    : `You're all paid up, so there's nothing else to do. If anything has changed and you can no longer make it, just reply and let us know so we can offer the spot to the next team on the list.`
  return { subject, body: `Hi {contact},\n\n${opening}\n\n${middle}\n\nWe can't wait to see you out on the field.\n\n— {org}` }
}

export async function sendSpotOpened(registrationId: string, promoted: PromotedTeam[]): Promise<{ ok: boolean; to: string[]; error?: string }> {
  if (!promoted.length) return { ok: false, to: [], error: 'Nothing was promoted' }
  const reg = await prisma.teamRegistration.findUnique({
    where: { id: registrationId },
    include: { teams: true, payments: true },
  })
  if (!reg || reg.deletedAt) return { ok: false, to: [], error: 'Registration not found' }

  const recipients = clubRecipients(reg.clubName, reg.contactEmail, await clubDirectorEmailMap(reg.tournamentId))
  if (!recipients.length) return { ok: false, to: [], error: 'No contact email on this registration' }

  const t = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true, startDate: true } })
  const org = await orgForTournament(reg.tournamentId)
  const paid = reg.payments.reduce((s, p) => s + (p.amount || 0), 0)
  const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
  const balance = Math.round(Math.max(0, due - paid) * 100) / 100
  const eventTeams = await prisma.registeredTeam.count({ where: { registration: { tournamentId: reg.tournamentId, deletedAt: null } } })
  const tName = t?.name || 'the tournament'
  const orgName = org?.name || 'the tournament team'
  const letter = spotOpenedText(promoted, balance > 0)

  let built: { subject: string; html: string; text: string }
  if (balance > 0) {
    built = buildPayReminderEmail({
      clubName: reg.clubName, clubContact: reg.clubContact, teamsCount: reg.teams.length,
      tName, link: tournamentAbs((org as { slug?: string } | null)?.slug, `/pay/${reg.id}`),
      due, paid, balance, orgName,
      subjectTpl: letter.subject, bodyTpl: letter.body,
      startDate: t?.startDate, eventTeams,
    })
  } else {
    // Nothing owed (paid ahead): no invoice table or Pay button, just the news.
    const vals = {
      contact: reg.clubContact || reg.clubName, club: reg.clubName, event: tName, balance: '$0.00',
      teams: `${reg.teams.length} team${reg.teams.length !== 1 ? 's' : ''}`, org: orgName,
      countdown: countdownPhrase(t?.startDate), eventTeams: String(eventTeams || ''),
    }
    const text = mergePayLetter(letter.body, vals)
    built = {
      subject: mergePayLetter(letter.subject, vals),
      html: renderEmail({ orgName, eyebrow: tName, body: letterBodyHtml(text) }),
      text,
    }
  }

  const sent = await sendEmail({ to: recipients, subject: built.subject, html: built.html, text: built.text, ...orgSender(org) })
  return sent.ok ? { ok: true, to: recipients } : { ok: false, to: recipients, error: sent.error || 'Email failed to send' }
}
