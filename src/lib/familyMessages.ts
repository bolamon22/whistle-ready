// The three messages a club director has to send their own people before an
// event: player waivers, coach registration, hotel rooms (Bo, Oct 4 2026).
//
// Writing them is the job nobody does, so the app writes them and the director
// just sends. They go out FROM the director, to their families — we never send
// to a club's parents ourselves, and we do not hold their addresses.
//
// Pure: no database import, because the share page renders this in the browser.
// Plain text on purpose — these end up in a mailto/compose URL, where HTML does
// not survive and length is capped (see composeUrls below).

export type FamilyMessage = {
  key: 'waivers' | 'coaches' | 'hotel'
  /** Card heading on the share page. */
  title: string
  /** One line on who this goes to and when. */
  blurb: string
  subject: string
  body: string
}

export type FamilyMessageInput = {
  clubName: string
  contactName: string
  eventName: string
  dates: string
  location: string
  waiverUrl: string
  coachUrl: string
  hotelUrl: string
  /** Blank hides the "same hotel" offer rather than promising something. */
  hasHousingContact: boolean
}

const sign = (contactName: string) => (contactName.trim() ? `Thanks,\n${contactName.trim()}` : 'Thanks')
const where = (location: string) => (location.trim() ? ` in ${location.trim()}` : '')

export function buildFamilyMessages(i: FamilyMessageInput): FamilyMessage[] {
  const when = i.dates ? ` (${i.dates})` : ''
  const msgs: FamilyMessage[] = [
    {
      key: 'waivers',
      title: 'Player waivers',
      blurb: 'To your player families. Every player needs one before their first game.',
      subject: `${i.eventName} — please complete your player's waiver`,
      body: `Hi everyone,

${i.clubName} is playing in ${i.eventName}${when}${where(i.location)}. Before your player can take the field, every player needs a completed online waiver. It takes about two minutes and you only do it once.

Complete it here:
${i.waiverUrl}

Please get this done before we travel — players without a waiver can't check in on game day.

${sign(i.contactName)}`,
    },
    {
      key: 'coaches',
      title: 'Coach registration',
      blurb: "To your coaching staff. Every coach on the sideline has to register, same as the players.",
      subject: `${i.eventName} — coaches, please register`,
      body: `Hi coaches,

${i.clubName} is playing in ${i.eventName}${when}${where(i.location)}. Every coach on our sideline needs to register with the tournament beforehand, the same as the players do.

Register here:
${i.coachUrl}

Please take care of it this week so we're covered at check-in.

${sign(i.contactName)}`,
    },
    {
      key: 'hotel',
      title: 'Hotel rooms',
      blurb: 'To your player families. They book their own rooms; this keeps them together.',
      subject: `${i.eventName} — hotel rooms for ${i.clubName} families`,
      body: `Hi everyone,

For ${i.eventName}${when}${where(i.location)}, please book your rooms through the tournament's hotel link below. Booking through it keeps our club's rooms together and counted with the team.

${i.hotelUrl}
${i.hasHousingContact ? `
If you would rather we were all in the same hotel, tell me and I'll arrange it with the tournament's housing coordinator.
` : ''}
${sign(i.contactName)}`,
    },
  ]
  return msgs
}

/** Deep links that open a compose window with the subject and body already in
 *  it. Nothing sends: the director reviews and hits send themselves.
 *
 *  Why a page and not buttons in the email: a compose URL is length-capped
 *  (Outlook has historically truncated past ~2000 characters) and an email can
 *  hold no Copy button, since it cannot run script. The page can do both. */
export function composeUrls(subject: string, body: string): { gmail: string; outlook: string; mailto: string } {
  const s = encodeURIComponent(subject)
  const b = encodeURIComponent(body)
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${b}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?subject=${s}&body=${b}`,
    mailto: `mailto:?subject=${s}&body=${b}`,
  }
}
