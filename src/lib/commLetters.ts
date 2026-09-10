import { prisma } from '@/lib/db'

// Pre-tournament club communications (Bo, Sep 10): three org-editable letters sent
// from the team registrations page — to one club or the whole field at once.
//   waiver   — team directors forward it so parents/players complete the online waiver
//   schedule — announce the schedule the moment it's posted
//   confirm  — a week or two out: reply-to-confirm the team list is right
// Same pattern as the pay/invite letters: AppSetting commLetter:{kind}:{orgId},
// tokens merged at send time, fixed CTA button below the editable note.

export type CommKind = 'waiver' | 'schedule' | 'confirm'

export const COMM_KINDS: Record<CommKind, { label: string; cta: 'waiver' | 'schedule' | null; ctaLabel: string; defaults: { subject: string; body: string } }> = {
  waiver: {
    label: 'Player waiver reminder',
    cta: 'waiver',
    ctaLabel: 'Open the player waiver',
    defaults: {
      subject: 'Action needed — player waivers for {event}',
      body: `Hi {contact} — {event} is coming up, and every player needs a completed online waiver before they can take the field.

Here's where {club} stands right now:

{playerCounts}

Please forward this to your parents and players today — each family fills it out once at the link below and it takes about two minutes. Players without a waiver can't check in on game day, so if a team looks light, now's the time to push it out. Reply here with any questions.`,
    },
  },
  schedule: {
    label: 'Schedule is ready',
    cta: 'schedule',
    ctaLabel: 'View the schedule',
    defaults: {
      subject: 'The {event} schedule is posted — {club}',
      body: `Hi {contact} — the game schedule for {event} is up. Your {club} teams' games, fields, and times are all at the link below.

Share it with your families — it's live, so if anything shifts it always shows the latest version. Standings and scores will post there during the event too.

See you out there.`,
    },
  },
  confirm: {
    label: 'Confirm your teams',
    cta: null,
    ctaLabel: '',
    defaults: {
      subject: 'Confirm your {club} teams for {event}',
      body: `Hi {contact} — {event} ({eventDates}) is almost here and we're locking in the field. We have {club} down for:

{teamsList}

Can you reply to confirm these teams are set — right names, right divisions? If anything changed (a team added, dropped, or renamed), reply with the update and we'll fix it before the schedule locks.`,
    },
  },
}

export async function commLetterFor(orgId: string | null, kind: CommKind): Promise<{ subject: string; body: string; custom: boolean }> {
  if (orgId) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `commLetter:${kind}:${orgId}` } })
      if (row?.value) {
        const v = JSON.parse(row.value) as { subject?: unknown; body?: unknown }
        if (typeof v?.subject === 'string' && typeof v?.body === 'string' && v.body.trim()) {
          return { subject: v.subject, body: v.body, custom: true }
        }
      }
    } catch { /* bad JSON — fall through to default */ }
  }
  return { ...COMM_KINDS[kind].defaults, custom: false }
}

export function mergeCommLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(contact|club|event|teams|org|waiverLink|scheduleLink|teamsList|eventDates|playerCounts|playerCount)\}/g, (_m, k: string) => vals[k] ?? '')
}
