// Invite letters for photographers and content creators.
//
// The media credential program has an application page, a review queue, a
// credential and a booking page -- and no way to ask anybody. Every good shooter
// at a lacrosse event is already standing on somebody else's sideline, so the
// program only fills if the organizer reaches out first. This is that reach-out:
// pick a letter, pick who it goes to, send.
//
// Pure strings only. The tournament page imports this file into a client
// component, so it must never pull in prisma or the mailer -- the same rule
// inviteTemplates.ts follows for the returning-teams invite.
//
// The link in every letter is the application itself, pre-filled with the event
// and with whatever we already know about the person. Someone who says yes to an
// email will not also fill in a form from scratch.

export type MediaInviteTemplate = {
  key: string
  label: string
  /** One line under the chips: when you'd reach for this one. */
  hint: string
  subject: string
  body: string
}

export const MEDIA_INVITE_TEMPLATES: MediaInviteTemplate[] = [
  {
    key: 'invite',
    label: 'Come shoot with us',
    hint: "Someone who hasn't shot our events before — explains what the credential is.",
    subject: `Media credential for {{tournamentName}} — {{dates}}`,
    body: `Hi {{name}},

I run {{orgName}}, and I'd like to credential you for {{tournamentName}} on {{dates}}.

Here's the deal, plainly. The credential is free and gets you field access for the weekend. Every photo you contribute to our gallery carries your credit, and that credit links to your own booking page on our site — so a parent who likes a shot is one click from hiring you. We take nothing from what you book.

What we ask in return is a set of photos from the weekend for the event gallery, and a tag when you post.

The application takes about two minutes:

{{applyUrl}}

This is what the gallery looks like now: {{galleryUrl}}

If you'd rather talk it through first, just reply to this email.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'returning',
    label: 'Back again',
    hint: "Someone who has already shot for us — no explaining, just the date.",
    subject: `{{tournamentName}} — {{dates}}. Shooting it?`,
    body: `Hi {{name}},

{{tournamentName}} is {{dates}}, and I'd like you back on the field.

Same arrangement as always: field access for the weekend, your credit on every photo in the gallery, and your booking page stays right where it is so families can find you.

Confirm your credential for this one here:

{{applyUrl}}

If you're planning to shoot more than one of our weekends, tick them all on the form and I'll credential you once for the set.

Best regards,
Bo Lamon
{{orgName}}`,
  },
  {
    key: 'short',
    label: 'Short note',
    hint: 'Three lines — for someone who answers a text but not a letter.',
    subject: `{{tournamentName}}, {{dates}} — any chance you're free?`,
    body: `Hi {{name}},

Any chance you're free to shoot {{tournamentName}} on {{dates}}? Credential's free, you keep your work, you keep everything you book.

Two-minute form: {{applyUrl}}

Bo
{{orgName}}`,
  },
  {
    key: 'season',
    label: 'Join for the season',
    hint: 'Sets the whole year up at once \u2014 links to the form with every weekend already ticked.',
    subject: `Shooting lacrosse this season? {{orgName}} media list`,
    body: `Hi {{name}},

I run {{orgName}}, and I'm putting together the group of photographers and content creators who shoot our weekends this season.

I'd rather set this up once than email you event by event, so here is the whole arrangement.

The credential is free and gets you field access for any weekend you pick. Everything you shoot stays yours. Your credit goes on every photo or clip you add to the event gallery, and that credit links to your own booking page on our site \u2014 a parent who likes a shot is one click from hiring you, and we take nothing from what you book.

What we ask back, for each weekend you work: a set of photos or clips for the gallery, a tag when you post, and a Collab invite on your posts from the event. Instagram only lets whoever makes the post send that invite, so it has to come from you \u2014 and it puts your name in front of our whole audience.

One form covers the season. Every upcoming weekend is already ticked \u2014 untick any you can't make:

{{seasonUrl}}

This is what the gallery looks like now: {{galleryUrl}}

Happy to talk it through first if you'd rather. Just reply.

Best regards,
Bo Lamon
{{orgName}}`,
  },
]

export const MEDIA_INVITE_DEFAULT = MEDIA_INVITE_TEMPLATES[0]

/** Fields a letter can merge. Anything else is left alone, visibly, so a typo in
 *  a hand-edited letter shows up as {{typo}} rather than silently vanishing. */
export type MediaInviteVars = {
  name: string
  business: string
  orgName: string
  tournamentName: string
  dates: string
  applyUrl: string
  /** The same form with NO event preselected, which ticks every upcoming
   *  weekend — what a season-wide invite should link to. */
  seasonUrl: string
  galleryUrl: string
}

export function mergeMediaInvite(template: string, vars: Partial<MediaInviteVars>): string {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k]
    return v === undefined || v === '' ? `{{${k}}}` : v
  })
}

/**
 * The application link, carrying the event and whoever we're writing to.
 *
 * Pre-filling matters more here than on most forms: the person opening it was
 * asked by name in an email, and being made to retype their own name and address
 * is exactly the friction that turns a yes into a maybe.
 *
 * Pass an empty tournamentId for a season invite: with no event in the query the
 * form ticks every upcoming weekend, which is the behaviour the season letter
 * leans on.
 */
export function mediaApplyUrl(base: string, tournamentId: string, who?: { name?: string; business?: string; email?: string }): string {
  const q = new URLSearchParams()
  if (tournamentId) q.set('event', tournamentId)
  if (who?.name) q.set('name', who.name)
  if (who?.business) q.set('co', who.business)
  if (who?.email) q.set('email', who.email)
  const qs = q.toString()
  return `${String(base || '').replace(/\/$/, '')}/gallery/shoot${qs ? `?${qs}` : ''}`
}

/** One person an invite goes to. `business` and `name` are both optional because
 *  a cold invite often has only an address off a watermark. */
export type MediaInvitee = { email: string; name?: string; business?: string }

/** What the letter calls them. Never blank -- a letter opening "Hi ," is worse
 *  than one opening "Hi there". */
export function inviteeGreeting(p: MediaInvitee): string {
  const first = String(p.name || '').trim().split(/\s+/)[0] || ''
  return first || String(p.business || '').trim() || 'there'
}

/** One address per person, lowercased, in the order given. A double-click or a
 *  pasted list with a repeat must never mail the same shooter twice. */
export function dedupeInvitees(list: MediaInvitee[]): MediaInvitee[] {
  const seen = new Set<string>()
  const out: MediaInvitee[] = []
  for (const p of list || []) {
    const e = String(p?.email || '').trim().toLowerCase()
    if (!e || !e.includes('@') || seen.has(e)) continue
    seen.add(e)
    out.push({ email: e, name: String(p?.name || '').trim(), business: String(p?.business || '').trim() })
  }
  return out
}

/** Addresses pasted as a blob: "Name <a@b.com>, c@d.com" or one per line. */
export function parseInvitees(text: string): MediaInvitee[] {
  const out: MediaInvitee[] = []
  for (const chunk of String(text || '').split(/[\n,;]+/)) {
    const t = chunk.trim()
    if (!t) continue
    const angled = /^(.*?)<([^>]+)>$/.exec(t)
    if (angled) out.push({ name: angled[1].trim().replace(/^["']|["']$/g, ''), email: angled[2].trim() })
    else out.push({ email: t })
  }
  return dedupeInvitees(out)
}
