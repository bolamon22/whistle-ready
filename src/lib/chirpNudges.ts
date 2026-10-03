// What the public Chirp says first, picked from where the visitor is and what
// is happening (Bo, Oct 3 2026: "maybe when they go on the website it prompts
// different questions, not all of the time"). Pure function, runs in the
// browser. `pageSpecific` nudges (register, waiver, pay, schedule) show on
// their page once per visit; general ones at most every couple of days.

export type NudgeEvent = { id: string; name: string; startDate: string; endDate: string; regOpen: boolean; scheduleOut?: boolean } | null
export type Nudge = { id: string; title: string; body: string; chips: { label: string; q: string }[]; pageSpecific: boolean }

function daysUntil(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const start = new Date(y, m - 1, d), now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start.getTime() - today.getTime()) / 86400000)
}

export function pickNudge(o: { path: string; event: NudgeEvent; orgName: string; returning: boolean; audience?: AudienceId | null }): Nudge {
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
  // The schedule page before game times are published: don't offer "when does
  // my team play?" -- there's nothing to show yet.
  if (/\/tournaments\/[^/]+\/(public|today)(\/|$)/.test(p) && o.event?.scheduleOut === false) return {
    id: 'schedule-pending', pageSpecific: true, title: 'The schedule isn\'t out yet',
    body: "Your team's games will show here once it's released. Meanwhile I can check your team is listed, or help with waivers and fields.",
    chips: [{ label: 'Is my team listed?', q: 'Is my team listed, and what pool are we in?' }, { label: 'Sign the player waiver', q: 'How do I sign the player waiver?' }, { label: 'Where are the fields?', q: 'Where are the fields and where do we park?' }],
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
      body: o.audience === 'coach' ? 'Have you signed the coach waiver? I can also help with the schedule, rules and fields.'
        : o.audience === 'club_director' ? "Are your teams confirmed and paid? I can also help with your players' waivers."
        : o.audience && !['parent', 'player'].includes(o.audience) ? 'I can help with dates, fields, parking and anything else about the event.'
        : "Has your player signed the waiver yet? I can also help with parking, fields and your team's schedule.",
      chips: o.audience && !['parent', 'player'].includes(o.audience) ? audienceTopics(o.audience, true).slice(0, 3)
        : [{ label: 'Sign the player waiver', q: 'How do I sign the player waiver?' }, { label: 'Parking & fields', q: 'Where are the fields and where do we park?' }, { label: 'When does my team play?', q: 'When does my team play?' }],
    }
  }
  if (o.event && o.event.regOpen && days !== null && days > 14 && (!o.audience || ['coach', 'club_director', 'browsing'].includes(o.audience))) return {
    id: `reg-${o.event.id}`, pageSpecific: false, title: `${o.returning ? 'Welcome back! ' : ''}Is your team registered for ${name}?`,
    body: 'Registration is open. I can walk you through divisions, fees and payment.',
    chips: o.audience && !['coach', 'club_director', 'browsing'].includes(o.audience) ? audienceTopics(o.audience, false).slice(0, 3)
      : [{ label: 'Register a team', q: `How do I register a team for ${name}?` }, { label: 'How much does it cost?', q: 'How much does it cost to register a team?' }, { label: 'Upcoming events', q: 'What events are coming up?' }],
  }
  return {
    id: 'general', pageSpecific: false, title: `${o.returning ? 'Welcome back! ' : "Hi! "}I'm Chirp, the ${o.orgName || 'event'} help desk.`,
    body: 'Ask me about schedules, registration, waivers or payments. Type or tap the mic and talk.',
    chips: audienceTopics(o.audience || null, false).slice(0, 3),
  }
}

// ---- Who's asking ----
// The public Chirp asks visitors what brings them here once, remembers the
// answer on the device, and fits its suggestions (and its answers) to it.

export type AudienceId = 'parent' | 'coach' | 'club_director' | 'player' | 'official' | 'vendor' | 'media' | 'browsing'
export const AUDIENCES: { id: AudienceId; label: string; prompt: string }[] = [
  { id: 'parent', label: 'Parent', prompt: 'a parent of a player' },
  { id: 'coach', label: 'Coach', prompt: 'a team coach' },
  { id: 'club_director', label: 'Club director', prompt: 'a club director who registers and pays for teams' },
  { id: 'player', label: 'Player', prompt: 'a player' },
  { id: 'official', label: 'Ref or official', prompt: 'a referee or official, or someone who wants to work the events' },
  { id: 'vendor', label: 'Vendor or sponsor', prompt: 'a vendor or sponsor' },
  { id: 'media', label: 'Photographer or media', prompt: 'a photographer or media member' },
  { id: 'browsing', label: 'Just looking', prompt: 'a visitor looking around' },
]
export const isAudience = (v: unknown): v is AudienceId => typeof v === 'string' && AUDIENCES.some(a => a.id === v)

export type Topic = { label: string; q: string; icon: 'calendar' | 'map' | 'pen' | 'card' | 'trophy' | 'clipboard' | 'bell' | 'camera' | 'store' | 'whistle' | 'hotel' | 'check' }

/** Four starter questions per kind of visitor. `soon`: the event is within two weeks. */
export function audienceTopics(a: AudienceId | null, soon: boolean): Topic[] {
  switch (a) {
    case 'parent': return [
      { label: "When does my child's team play?", q: "When does my child's team play?", icon: 'calendar' },
      { label: 'Sign the player waiver', q: 'How do I sign the player waiver?', icon: 'pen' },
      { label: 'Get alerts for my team', q: 'How do I get alerts when my team plays?', icon: 'bell' },
      { label: 'Fields & parking', q: 'Where are the fields and where do we park?', icon: 'map' },
    ]
    case 'coach': return [
      { label: 'When do we play?', q: 'When does my team play?', icon: 'calendar' },
      { label: 'Coach waiver & credential', q: 'How do I sign the coach waiver and get my coach credential?', icon: 'pen' },
      { label: 'Rules', q: 'What are the rules for this event?', icon: 'clipboard' },
      { label: 'Fields & parking', q: 'Where are the fields and where do we park?', icon: 'map' },
    ]
    case 'club_director': return [
      { label: 'Register our teams', q: 'How do I register our teams?', icon: 'clipboard' },
      { label: 'Pay our balance', q: 'How do I pay our team balance?', icon: 'card' },
      { label: 'Confirm our teams', q: 'How do I confirm our teams before the schedule?', icon: 'check' },
      { label: soon ? 'Player waivers for my club' : 'Hotels for our club', q: soon ? 'How do my players sign their waivers?' : 'Are there hotels for teams?', icon: soon ? 'pen' : 'hotel' },
    ]
    case 'player': return [
      { label: 'When do we play?', q: 'When does my team play?', icon: 'calendar' },
      { label: 'Sign the player waiver', q: 'How do I sign the player waiver?', icon: 'pen' },
      { label: 'Results & standings', q: 'Where can I see results and standings?', icon: 'trophy' },
      { label: 'Photos', q: 'Where can I see photos from the event?', icon: 'camera' },
    ]
    case 'official': return [
      { label: 'Work as a ref', q: 'How do I sign up to work as a referee?', icon: 'whistle' },
      { label: 'Upcoming events', q: 'What events are coming up?', icon: 'calendar' },
      { label: 'My staff ID', q: 'How do I get my staff ID card?', icon: 'card' },
      { label: 'Fields & parking', q: 'Where are the fields and where do we park?', icon: 'map' },
    ]
    case 'vendor': return [
      { label: 'Apply for a booth', q: 'How do I apply for a vendor booth?', icon: 'store' },
      { label: 'Sponsorship', q: 'How can my business sponsor an event?', icon: 'store' },
      { label: 'Upcoming events', q: 'What events are coming up?', icon: 'calendar' },
      { label: 'My application status', q: 'How do I check my vendor application?', icon: 'check' },
    ]
    case 'media': return [
      { label: 'Media credential', q: 'How do I apply for a media credential?', icon: 'camera' },
      { label: 'Photo bookings', q: 'How do families book a photographer?', icon: 'camera' },
      { label: 'Upcoming events', q: 'What events are coming up?', icon: 'calendar' },
      { label: 'Gallery', q: 'Where is the photo gallery?', icon: 'camera' },
    ]
    default: return [
      { label: 'Upcoming events', q: 'What events are coming up?', icon: 'calendar' },
      { label: 'Register a team', q: 'How do I register a team?', icon: 'clipboard' },
      { label: 'Sign the player waiver', q: 'How do I sign the player waiver?', icon: 'pen' },
      { label: 'Past results', q: 'Where can I see results?', icon: 'trophy' },
    ]
  }
}
