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
  /** What the one link in this message is for — the button's words when the
   *  message is copied as rich text. */
  linkLabel: string
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
  /** False when the org has no booking URL set and hotelUrl is only the event
   *  page. The message then stops telling families to "book through this link",
   *  because that link does not book anything. */
  hasBookingUrl: boolean
}

// A link must sit in a paragraph of its OWN -- blank line above and below.
// messageBlocks() only promotes a paragraph that is nothing but a URL into the
// worded link, so "Register here:\n<url>" stays a sentence with a raw address
// hanging off it (Bo, Oct 5 2026: the waiver and coach cards still showed the
// URL while the hotel card did not).
const sign = (contactName: string) => (contactName.trim() ? `Thanks,\n${contactName.trim()}` : 'Thanks')
const where = (location: string) => (location.trim() ? ` in ${location.trim()}` : '')

export function buildFamilyMessages(i: FamilyMessageInput): FamilyMessage[] {
  const when = i.dates ? ` (${i.dates})` : ''
  const msgs: FamilyMessage[] = [
    {
      key: 'waivers',
      title: 'Player waivers',
      blurb: 'To your player families. Every player needs one before their first game.',
      linkLabel: 'Complete the waiver',
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
      linkLabel: 'Register as a coach',
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
      linkLabel: i.hasBookingUrl ? 'Click here to book your rooms' : 'Hotel and travel details',
      subject: `${i.eventName} — hotel rooms for ${i.clubName} families`,
      body: `Hi everyone,

${i.hasBookingUrl
  ? `For ${i.eventName}${when}${where(i.location)}, please book your rooms through the tournament's hotel link below. Booking through it keeps our club's rooms together and counted with the team.`
  : `For ${i.eventName}${when}${where(i.location)}, the hotel and travel details are on the tournament's event page below.`}

${i.hotelUrl}
${i.hasHousingContact ? `
If you would rather we were all in the same hotel, tell me and I'll arrange it with the tournament's housing coordinator.
` : ''}
${sign(i.contactName)}`,
    },
  ]
  return msgs
}

const escHtml = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/**
 * The same message as HTML, with the bare link turned into a real button.
 *
 * This is what goes on the clipboard as text/html. Gmail, Outlook on the web
 * and Apple Mail all compose in a rich-text editor, so a paste keeps the button
 * — which is the only route to one. A compose deep link (?body=) carries plain
 * text and nothing else, so the Gmail and Outlook buttons can never do this.
 *
 * Works off the body the director may have edited: a paragraph that is just a
 * URL becomes the button, and any other URL is left as a normal link.
 */
export type MessageBlock =
  | { kind: 'link'; url: string }
  | { kind: 'text'; text: string }

/**
 * Split a message body into the blocks it is made of: a paragraph that is
 * nothing but a URL is THE link, everything else is text.
 *
 * One parser, two renderers. messageHtml() below turns these into the rich
 * text that goes on the clipboard, and the share page / portal card renders the
 * same blocks on screen, so what a director sees is what their families get.
 */
export function messageBlocks(body: string): MessageBlock[] {
  return String(body || '')
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(t => (/^https?:\/\/\S+$/.test(t) ? { kind: 'link' as const, url: t } : { kind: 'text' as const, text: t }))
}

export function messageHtml(body: string, linkLabel = 'Open the link'): string {
  // Single quotes inside the stack on purpose: this string lands inside a
  // double-quoted style="..." attribute, and a double quote here closes it
  // early and strips the formatting straight back off the paste.
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
  return messageBlocks(body).map(b => {
    if (b.kind === 'link') {
      return `<p style="${font};font-size:15px;line-height:1.6;margin:0 0 14px"><a href="${b.url}" style="color:#0f766e;font-weight:bold">${escHtml(linkLabel)}</a></p>`
    }
    const withLinks = escHtml(b.text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    return `<p style="${font};font-size:15px;line-height:1.6;color:#111111;margin:0 0 14px">${withLinks.replace(/\n/g, '<br>')}</p>`
  }).join('')
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
