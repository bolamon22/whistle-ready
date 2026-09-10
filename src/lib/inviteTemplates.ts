// Letter templates for the Returning Teams invite (Bo, Sep 10: "sometimes I'd
// like to just invite teams to attend the tournament as some of them may not
// have participated in the past. or invite them to multiple events we host").
//
// One list, shared by the page (the preset chips + preview) and the send
// (src/lib/returningInvite.ts), so the default a scheduled send falls back to is
// literally the same text Bo saw on screen. Pure strings only — this file is
// imported by a client component, so it must never pull in prisma or email.

export type InviteTemplate = {
  key: string
  label: string
  /** One line under the chips: when you'd reach for this one. */
  hint: string
  subject: string
  body: string
}

export const INVITE_TEMPLATES: InviteTemplate[] = [
  {
    key: 'returning',
    label: 'Welcome back',
    hint: 'Clubs that have played with us before — references what they brought last time.',
    subject: `{{tournamentName}} — Registration Now Open`,
    body: `Hi {{contactName}},

We hope you had a great experience at our last event! We are excited to invite {{clubName}} back for {{tournamentName}}, taking place on {{dates}}.

Last year, your club brought {{lastYearTeams}} team(s) competing in: {{lastYearDivisions}}.

We would love to see you back on the field. Registration is now open — click the link below to secure your spot before divisions fill up.

{{registerUrl}}

Please don't hesitate to reach out with any questions.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'firstTime',
    label: 'First-time invite',
    hint: 'Clubs that have never played one of our events — no "last year" references.',
    subject: `An invitation for {{clubName}} — {{tournamentName}}`,
    body: `Hi {{contactName}},

I'd like to invite {{clubName}} to {{tournamentName}}, {{dates}}.

We run our events the way coaches ask for them: schedules published well ahead of the weekend, certified officials on every field, scorekeepers and game clocks, and live scores your families can follow from the sideline.

Registration is open now, and divisions fill in the order teams come in:

{{registerUrl}}

If it's easier to talk it through first — divisions, game guarantee, travel — just reply to this email and I'll get you whatever you need.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'season',
    label: 'Our full schedule',
    hint: 'Invite them to everything we host this season — inserts the event list.',
    subject: `{{orgName}} — our upcoming tournament schedule`,
    body: `Hi {{contactName}},

Here is what we have on the calendar, so {{clubName}} can pick the weekends that fit your season:

{{ourEvents}}

Registration for {{tournamentName}} ({{dates}}) is open now:

{{registerUrl}}

If you're looking at more than one weekend, reply and let me know which ones — I'll make sure your divisions line up across the events.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'lastCall',
    label: 'Last call',
    hint: 'Short deadline nudge for clubs that have not registered yet.',
    subject: `Last call — {{tournamentName}} is filling up`,
    body: `Hi {{contactName}},

Quick note: registration for {{tournamentName}} ({{dates}}) closes soon, and several divisions are close to full.

If {{clubName}} is planning to come, now is the time to get your teams in:

{{registerUrl}}

If you need a few more days or want to hold a spot while you count heads, reply to this email and I'll do what I can.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'shortNote',
    label: 'Short note',
    hint: 'Three lines from Bo — for directors who answer a quick email but not a letter.',
    subject: `{{tournamentName}} — {{dates}}`,
    body: `Hi {{contactName}},

Are you bringing teams to {{tournamentName}} this year? It's {{dates}}, and registration is open:

{{registerUrl}}

Just let me know how many teams and which divisions and I'll watch for you.

Bo
{{orgName}}`,
  },
]

export const RETURNING_TEMPLATE = INVITE_TEMPLATES[0]

/** 3/14/2026, or 3/14/2026 – 3/15/2026 for a multi-day event. */
export function fmtEventDates(startDate: string, endDate?: string): string {
  const one = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
  if (!startDate) return 'TBD'
  return endDate && endDate !== startDate ? `${one(startDate)} – ${one(endDate)}` : one(startDate)
}

export type EventLike = { name: string; startDate: string; endDate?: string }

/** Events that haven't happened yet, soonest first. */
export function upcomingEvents<T extends EventLike>(all: T[], today = new Date().toISOString().slice(0, 10)): T[] {
  return all.filter(e => e.startDate && e.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** The bullet list {{ourEvents}} drops into the letter. */
export function eventsList(events: EventLike[]): string {
  if (!events.length) return '(no upcoming events on the calendar yet)'
  return events.map(e => `• ${e.name} — ${fmtEventDates(e.startDate, e.endDate)}`).join('\n')
}
