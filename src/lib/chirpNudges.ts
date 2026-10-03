// What the public Chirp says first, picked from where the visitor is and what
// is happening (Bo, Oct 3 2026: "maybe when they go on the website it prompts
// different questions, not all of the time"). Pure function, runs in the
// browser. `pageSpecific` nudges (register, waiver, pay, schedule) show on
// their page once per visit; general ones at most every couple of days.

export type NudgeEvent = { id: string; name: string; startDate: string; endDate: string; regOpen: boolean } | null
export type Nudge = { id: string; title: string; body: string; chips: { label: string; q: string }[]; pageSpecific: boolean }

function daysUntil(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const start = new Date(y, m - 1, d), now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start.getTime() - today.getTime()) / 86400000)
}

export function pickNudge(o: { path: string; event: NudgeEvent; orgName: string; returning: boolean }): Nudge {
  const p = o.path
  const name = o.event?.name || 'the event'
  if (/\/player-waiver(\/|$)|\/register\/player/.test(p)) return {
    id: 'waiver', pageSpecific: true, title: 'Questions about the waiver?',
    body: 'I can help with who signs, players on more than one team, and the player card.',
    chips: [{ label: 'Who needs to sign?', q: 'Who needs to sign the player waiver?' }, { label: 'My child is on two teams', q: 'My child is on two teams. Do I sign the waiver twice?' }, { label: "What's the player card?", q: 'What is the player card?' }],
  }
  if (/^\/pay\//.test(p)) return {
    id: 'pay', pageSpecific: true, title: 'Questions about paying?',
    body: 'I can explain the payment options and how long each one takes.',
    chips: [{ label: 'Which option has no fee?', q: 'Which payment option has no fee?' }, { label: 'How long does a bank transfer take?', q: 'How long does a bank transfer take to clear?' }, { label: 'Can I pay by check?', q: 'Can I pay by check or Zelle?' }],
  }
  if (/\/tournaments\/[^/]+\/register(\/|$)/.test(p)) return {
    id: 'register', pageSpecific: true, title: `Registering for ${name}?`,
    body: 'I can help you pick divisions, explain the fees and the payment options.',
    chips: [{ label: 'How much does it cost?', q: 'How much does it cost to register a team?' }, { label: 'Which division do we pick?', q: 'Which division should our team register in?' }, { label: 'How do we pay?', q: 'How do we pay for our registration?' }],
  }
  if (/\/tournaments\/[^/]+\/(public|today)(\/|$)/.test(p)) return {
    id: 'schedule', pageSpecific: true, title: 'Looking for your team?',
    body: 'Ask me when your team plays, or I can show you how to get alerts on your phone.',
    chips: [{ label: 'When does my team play?', q: 'When does my team play?' }, { label: 'Get alerts for my team', q: 'How do I get alerts when my team plays?' }, { label: 'Where are the fields?', q: 'Where are the fields and where do we park?' }],
  }
  const days = o.event ? daysUntil(o.event.startDate) : null
  if (o.event && days !== null && days >= 0 && days <= 14) {
    const when = days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `is in ${days} days`
    return {
      id: `soon-${o.event.id}`, pageSpecific: false, title: `${name} ${when}!`,
      body: "Has your player signed the waiver yet? I can also help with parking, fields and your team's schedule.",
      chips: [{ label: 'Sign the player waiver', q: 'How do I sign the player waiver?' }, { label: 'Parking & fields', q: 'Where are the fields and where do we park?' }, { label: 'When does my team play?', q: 'When does my team play?' }],
    }
  }
  if (o.event && o.event.regOpen && days !== null && days > 14) return {
    id: `reg-${o.event.id}`, pageSpecific: false, title: `${o.returning ? 'Welcome back! ' : ''}Is your team registered for ${name}?`,
    body: 'Registration is open. I can walk you through divisions, fees and payment.',
    chips: [{ label: 'Register a team', q: `How do I register a team for ${name}?` }, { label: 'How much does it cost?', q: 'How much does it cost to register a team?' }, { label: 'Upcoming events', q: 'What events are coming up?' }],
  }
  return {
    id: 'general', pageSpecific: false, title: `${o.returning ? 'Welcome back! ' : "Hi! "}I'm Chirp, the ${o.orgName || 'event'} help desk.`,
    body: 'Ask me about schedules, registration, waivers or payments. Type or tap the mic and talk.',
    chips: [{ label: 'Upcoming events', q: 'What events are coming up?' }, { label: 'Register a team', q: 'How do I register a team?' }, { label: 'Sign the player waiver', q: 'How do I sign the player waiver?' }],
  }
}
