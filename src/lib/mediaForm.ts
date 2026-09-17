// Media credential config for an org, stored in AppSetting `orgForms:{orgId}`
// under `media`. Same pattern as vendorForm.ts -- one normalizer every surface
// reads, so the public page, the application, the review list and the approval
// email can never disagree about what a credential means.
//
// WHY THIS EXISTS AS ITS OWN THING: a photographer is not a vendor. They pay us
// nothing, they show up with a press pass rather than a booth, and what they
// want from us is access, credit and clients -- in that order. The application
// is free on purpose; the gate is the portfolio link, not a fee.
//
// THREE LEVELS, ONE APPLICATION. They are checkboxes rather than a dropdown
// because they stack: everyone contributes, some also take bookings, some also
// sell. Ticking "sell" is the only thing that ever turns on money, and leaving
// it unticked keeps someone a free contributor forever.

export type MediaLevel = {
  id: 'contribute' | 'book' | 'sell'
  name: string
  /** The line under the name on the public page and the application. */
  note: string
  /** Listed but not selectable -- e.g. selling before the release wording is updated. */
  closed: boolean
  /** The pill beside the name: 'Open to all', 'Apply after your first event'. */
  status?: string
  /** Why this rung is gated and how somebody reaches it. Replaces the old
   *  `limited` flag, which could say a spot was capped but never how to earn
   *  one -- which is the half that stops a cap reading as favouritism. */
  gate?: string
  /** A misreading worth heading off before it happens. */
  clarify?: string
  /** The status this rung confers, shown as a badge. `{org}` is replaced with
   *  the organization's SHORT name at render (see `orgShort`), so the default is
   *  not hardcoded to one tournament series. Blank means no badge. */
  badge?: string
  /** How this rung reads ON THE CREDENTIAL, where it is a status somebody
   *  already holds rather than something to apply for. `name` is written for the
   *  application -- "Become SEG Certified" is the right label beside a checkbox
   *  and the wrong thing to print on a badge somebody is wearing (Bo, Sep 17
   *  2026). Falls back to `name` when blank. */
  credential?: string
}

/** Everything an approved photographer needs to turn up and shoot correctly.
 *  Blank blocks are omitted from the credential page rather than rendered
 *  empty, so this can be filled in a piece at a time as the event firms up. */
export type MediaInstructions = {
  where: string
  checkIn: string
  eventTimes: string
  fieldRules: string
  upload: string
  contact: string
}

/**
 * What the org asks for in return for the credential.
 *
 * A credential is a trade -- field access for content -- and saying so plainly is
 * better for both sides than hoping people contribute. Stated as numbers rather
 * than "please share your work": a photographer can tell whether they met it, and
 * the org can tell whether to credential them again.
 *
 * Note the scope: photos they are HAPPY to have used, not everything they shot.
 * A pro doing paid team sessions is not going to hand over their best frames, and
 * a term that pretends otherwise just gets ignored.
 */
export type MediaCommitments = {
  show: boolean
  /** How many photos, and by when. 0 disables that line. */
  minPhotos: number
  withinDays: number
  /** Posts promoting the event BEFORE it, saying they will be there. 0 disables.
   *  A TIER 2 ask, not a general one: promotion is what the booking spot is
   *  traded for, and leaving it off tier 1 keeps that rung a light enough ask
   *  that the two are a real choice rather than one obvious one (Bo, Sep 17). */
  prePosts: number
  /** What a booking profile costs: a bigger set, faster. The gallery is what
   *  sells their profile, so it has to fill while parents are still looking. */
  bookMinPhotos: number
  bookWithinHours: number
  /** The org's handle, without the @. Blank hides the social lines. */
  socialHandle: string
  tagRequired: boolean
  /** Instagram Collab: one post, both grids, one set of likes. */
  collabRequired: boolean
  /** Anything else, one per line. */
  extra: string[]
}

export type MediaConfig = {
  levels: MediaLevel[]
  heroImage: string
  headline: string
  subhead: string
  /** Bullets on the recruiting page -- what a photographer actually gets. */
  benefits: string[]
  /** The org's cut. 30 means the photographer keeps 70%. */
  orgSharePct: number
  /** Extra numbers for the reach bar. Teams and players are counted live. */
  stats: { value: string; label: string }[]
  /** Where "a photographer applied" lands. Blank falls back to the org contact. */
  notifyEmail: string
  /** Shown above the submit button -- applications are reviewed, not automatic. */
  approvalNotice: string
  /** The rights paragraph on the application. Legal text, so it is editable and
   *  never generated. */
  terms: string
  /** The minors paragraph. Separate from `terms` because it is the one an org
   *  is most likely to have its own counsel rewrite. */
  minorsNotice: string
  /** What `{org}` resolves to on badges and credentials. Blank derives it from
   *  the org's name -- see `orgShort`. */
  orgShort: string
  confirmationTitle: string
  confirmationMessage: string
  commitments: MediaCommitments
  instructions: MediaInstructions
}

// A LADDER, NOT A MENU. Three independent checkboxes made booking strictly
// better than contributing at the same price, so everyone ticked everything and
// the answer carried no signal about who was serious. Each rung is now reached
// through the one below it, and costs more, so people self-select instead of
// being turned down (Bo, Sep 17 2026).
export const DEFAULT_MEDIA_LEVELS: MediaLevel[] = [
  { id: 'contribute', name: 'Contribute to the gallery', closed: false,
    status: 'Open to all',
    credential: 'Gallery contributor',
    note: 'Free. Sideline access all weekend, and you keep the copyright. Your name and link go under everything you upload, and on anything of yours we post ourselves.' },

  // "Through our site" is load-bearing. Without it this reads as though the
  // tournament is granting permission to be booked at all, which is not ours to
  // grant and is exactly what a working photographer would bristle at. What is
  // on offer is the promotion, and the clarify line says so outright.
  // THE ORG NAME IS THE WHOLE POINT. "Certified photographer" on its own claims
  // we vouch for somebody's ability behind a camera, which is a professional
  // credential and not ours to issue; "{org} Certified" says we cleared them for
  // OUR events, which is exactly what we did (Bo, Sep 17 2026). The `{org}`
  // token resolves to the SHORT name, because "Sunshine Events Group Certified
  // Photographer" is a mouthful nobody says and "SEG Certified Photographer" is
  // what Bo calls it. The verb is on the application, the noun on the badge.
  { id: 'book', name: 'Become {org} Certified', closed: false,
    status: 'After your first event',
    badge: '{org} Certified Photographer',
    credential: '{org} Certified Photographer',
    note: 'A profile page on our site with your packages, a listing on our photographers page, and booking requests from teams and families sent straight to you. You keep 100% — we take no cut.',
    clarify: 'This does not gate your business. Teams and families can hire you directly, any time, whether or not you have this. What you are applying for is the promotion: a profile on our site, and the booking form participants fill in coming to you.',
    gate: 'Apply after your first event. Shoot a weekend as a contributor, get your photos into the gallery, then apply. Someone booking through our form is trusting our name alongside yours, so we only put it behind a shooter we have watched work.' },

  // TWO gates, and the release is the real one. Every player is registered under
  // a waiver covering event photography -- promotion. Selling a family's photo
  // commercially is a different permission we do not have, and no amount of
  // track record substitutes for it. Saying only "earned over a season" would
  // set up a conversation a year from now that still ends in no.
  { id: 'sell', name: 'Sell your work in the gallery', closed: true,
    status: 'Not open yet',
    credential: 'Gallery sales',
    note: 'We handle watermarking, hosting and payment; you set your prices and keep most of it.',
    gate: 'Two things have to happen first. Our photo release has to cover commercial use — every player here is registered under a waiver for event photography, and selling a family\u2019s photo is a different permission we do not have yet. And this rung is for shooters who have contributed and taken bookings through our site across several events, not one.' },
]

export const DEFAULT_MEDIA_BENEFITS = [
  'Sideline access for the whole weekend',
  'Your name and link under every photo and clip you upload',
  'A profile page on this site that parents and coaches can book from, if you take a booking spot',
  'Team and player requests sent straight to you',
  'You keep the copyright — when we post your work, your credit goes with it',
]

// WHY THE LICENCE IS SPELT OUT RATHER THAN IMPLIED: "you keep the copyright" on
// its own reads as "they get nothing", which is not the deal -- we post this work
// on our own channels and in our own promotion, and a photographer who finds that
// out afterwards is right to be annoyed (Bo, Sep 17 2026). Both halves belong in
// the same sentence: they own it, we may use it, their credit rides along.
export const DEFAULT_MEDIA_TERMS =
  'You keep full copyright in everything you shoot. You grant us a non-exclusive, royalty-free license ' +
  'to use the photos and video you upload here on our website, our social channels and in our own ' +
  'promotion of our events, with your credit attached — we do not resell your work, and you can ask us ' +
  'to take any photo down at any time. You agree to follow the field rules we send with your ' +
  'credential, to wear it visibly, and to stay out of team areas and behind the restraining line.'

export const DEFAULT_MEDIA_MINORS =
  'Every player at our events is registered under a waiver covering event photography. A parent may ask ' +
  'for any photo of their child to be removed, and we will take it down without asking why. Do not ' +
  'photograph anyone who asks you not to.'

export const DEFAULT_COMMITMENTS: MediaCommitments = {
  show: true,
  minPhotos: 20,
  withinDays: 7,
  prePosts: 2,
  bookMinPhotos: 40,
  bookWithinHours: 72,
  socialHandle: '',
  tagRequired: true,
  collabRequired: true,
  extra: [],
}

export const DEFAULT_MEDIA_HERO = '/api/img/0875f7bb-2de6-40ef-8a04-831025c9f6e8'

const str = (x: unknown): string => String(x ?? '').trim()

/**
 * The org's name as it reads on something somebody wears.
 *
 * A credential is small and read at arm's length, so the full legal name loses:
 * "Sunshine Events Group Certified Photographer" wraps to three lines and nobody
 * says it out loud. Initials only kick in once the name is long enough to need
 * them, so a genuinely short org keeps its real name rather than being reduced
 * to two letters. An org can always override this outright.
 */
export function orgShort(name: string, override?: string): string {
  const set = str(override)
  if (set) return set
  const n = str(name).replace(/[,.]?\s*\b(llc|inc|ltd|co)\.?$/i, '').trim()
  if (n.length <= 14) return n
  const initials = n
    .split(/\s+/)
    .filter(w => !/^(of|the|and|for|&|at|in)$/i.test(w))
    .map(w => w[0])
    .join('')
    .toUpperCase()
  return initials.length >= 2 ? initials : n
}

/**
 * `orgName` resolves the `{org}` token in level names, badges and credential
 * labels. It is resolved HERE, in the one normalizer, rather than at each of the
 * six places that render a level -- the public page, the application, the
 * credential preview, the issued credential, the staff review list and the
 * approval email. Miss one and a photographer gets a badge reading
 * "{org} Certified Photographer", which is worse than no badge at all. With no
 * org name the token is dropped cleanly, never left showing.
 */
export function mediaConfig(raw: any, orgName?: string): MediaConfig {
  const short = orgShort(str(orgName), str(raw?.orgShort))
  const tok = (t?: string) => (t || '').replace(/\{org\}/g, short).replace(/\s+/g, ' ').trim()
  const byId = new Map<string, any>(
    (Array.isArray(raw?.levels) ? raw.levels : []).map((l: any) => [str(l?.id), l])
  )
  // Always the three built-in levels in a fixed order -- an org edits the wording
  // and can close one, but cannot invent a fourth. The public page, the
  // application and the approval email all key off these ids.
  const levels: MediaLevel[] = DEFAULT_MEDIA_LEVELS.map(d => {
    const o = byId.get(d.id)
    return o
      ? { id: d.id, name: tok(str(o.name) || d.name), note: str(o.note) || d.note, closed: o.closed === true,
          // status/gate/clarify/badge/credential fall back to the default rung
          // rather than to blank: a stored config written before the ladder
          // existed would otherwise silently drop the thing that explains the
          // gate, and drop the badge off the credential entirely.
          status: str(o.status) || d.status, gate: str(o.gate) || d.gate, clarify: str(o.clarify) || d.clarify,
          badge: tok(str(o.badge) || d.badge), credential: tok(str(o.credential) || d.credential) }
      : { ...d, name: tok(d.name), badge: tok(d.badge), credential: tok(d.credential) }
  })
  const benefits = Array.isArray(raw?.benefits) ? raw.benefits.map(str).filter(Boolean) : []
  const stats = Array.isArray(raw?.stats)
    ? raw.stats.map((s: any) => ({ value: str(s?.value), label: str(s?.label) })).filter((s: any) => s.value && s.label)
    : []
  const pct = Number(raw?.orgSharePct)
  return {
    levels,
    heroImage: str(raw?.heroImage) || DEFAULT_MEDIA_HERO,
    headline: str(raw?.headline) || 'Shoot our tournaments. Keep your work. Get the clients.',
    subhead: str(raw?.subhead) ||
      'Photo or video, field access at every event, your name on every frame, and a page on this site where coaches and parents book you directly. Credentials are free.',
    benefits: benefits.length ? benefits : DEFAULT_MEDIA_BENEFITS,
    orgSharePct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 30,
    stats,
    notifyEmail: str(raw?.notifyEmail),
    approvalNotice: str(raw?.approvalNotice) ||
      'Every application is reviewed. We look at the work, not the gear — you will hear back either way.',
    terms: str(raw?.terms) || DEFAULT_MEDIA_TERMS,
    minorsNotice: str(raw?.minorsNotice) || DEFAULT_MEDIA_MINORS,
    orgShort: str(raw?.orgShort),
    confirmationTitle: str(raw?.confirmationTitle) || 'Application received',
    confirmationMessage: str(raw?.confirmationMessage) ||
      'Thanks — we have your application and we will come back to you within a few days.',
    commitments: {
      show: raw?.commitments?.show !== false,
      minPhotos: Number(raw?.commitments?.minPhotos) >= 0 && raw?.commitments?.minPhotos !== undefined
        ? Math.floor(Number(raw.commitments.minPhotos)) : DEFAULT_COMMITMENTS.minPhotos,
      prePosts: Number(raw?.commitments?.prePosts) >= 0 && raw?.commitments?.prePosts !== undefined
        ? Math.floor(Number(raw.commitments.prePosts)) : DEFAULT_COMMITMENTS.prePosts,
      bookMinPhotos: Number(raw?.commitments?.bookMinPhotos) >= 0 && raw?.commitments?.bookMinPhotos !== undefined
        ? Math.floor(Number(raw.commitments.bookMinPhotos)) : DEFAULT_COMMITMENTS.bookMinPhotos,
      bookWithinHours: Number(raw?.commitments?.bookWithinHours) >= 0 && raw?.commitments?.bookWithinHours !== undefined
        ? Math.floor(Number(raw.commitments.bookWithinHours)) : DEFAULT_COMMITMENTS.bookWithinHours,
      withinDays: Number(raw?.commitments?.withinDays) >= 0 && raw?.commitments?.withinDays !== undefined
        ? Math.floor(Number(raw.commitments.withinDays)) : DEFAULT_COMMITMENTS.withinDays,
      socialHandle: str(raw?.commitments?.socialHandle).replace(/^@/, ''),
      tagRequired: raw?.commitments?.tagRequired !== false,
      collabRequired: raw?.commitments?.collabRequired !== false,
      extra: Array.isArray(raw?.commitments?.extra) ? raw.commitments.extra.map(str).filter(Boolean) : [],
    },
    instructions: {
      where: str(raw?.instructions?.where),
      checkIn: str(raw?.instructions?.checkIn),
      eventTimes: str(raw?.instructions?.eventTimes),
      fieldRules: str(raw?.instructions?.fieldRules),
      upload: str(raw?.instructions?.upload),
      contact: str(raw?.instructions?.contact),
    },
  }
}

/** What the photographer keeps, as a whole number. */
export function photographerSharePct(cfg: MediaConfig): number {
  return Math.max(0, Math.min(100, 100 - cfg.orgSharePct))
}

/** The commitments as plain sentences, for the page, the form and the email. */
export function commitmentLines(c: MediaCommitments): string[] {
  if (!c.show) return []
  const out: string[] = []
  if (c.minPhotos > 0) {
    // Photos OR clips: a videographer who turns in twenty ten-second clips has
    // done what was asked, and the old wording told them they had not.
    out.push(c.withinDays > 0
      ? `Upload at least ${c.minPhotos} photos or clips you\u2019re happy for us to use, within ${c.withinDays} days of the event`
      : `Upload at least ${c.minPhotos} photos or clips you\u2019re happy for us to use`)
  }
  if (c.socialHandle && c.tagRequired) out.push(`Tag @${c.socialHandle} in anything you post from the event`)
  // One direction only, and it is theirs. Instagram lets ONLY the account that
  // creates a post send the Collab invite, so on their post it has to come from
  // them. The reciprocal half was dropped (Bo, Sep 17 2026): the org posts
  // rarely, so promising to invite them on ours was a commitment that mostly
  // would not happen, and the ask reads better without a promise attached that
  // we cannot keep.
  if (c.socialHandle && c.collabRequired) out.push(`Send @${c.socialHandle} a Collab invite when you post from the event`)
  return [...out, ...c.extra]
}

/**
 * What a rung asks ON TOP of the base commitments above.
 *
 * Tier 2 is the only one with extras today, and all three are the same trade in
 * different forms: we put our name behind you, so help fill the event, feed the
 * gallery while parents are still looking, and have something worth clicking
 * when they land on your profile.
 */
export function levelAsks(levelId: MediaLevel['id'], c: MediaCommitments): string[] {
  if (levelId !== 'book') return []
  const out: string[] = []
  if (c.prePosts > 0 && c.socialHandle) {
    const n = c.prePosts === 1 ? 'One post' : `${c.prePosts} posts`
    const inv = c.prePosts === 1 ? 'a Collab invite' : 'a Collab invite on each'
    out.push(`${n} before the event, saying you’ll be there — tagging @${c.socialHandle}, with ${inv}`)
  }
  if (c.bookMinPhotos > 0) {
    out.push(c.bookWithinHours > 0
      ? `${c.bookMinPhotos} photos or clips instead of ${c.minPhotos}, within ${c.bookWithinHours} hours`
      : `${c.bookMinPhotos} photos or clips instead of ${c.minPhotos}`)
  }
  out.push('Your portfolio and packages live before we switch the profile on')
  return out
}

/** Level ids -> the names an email or a list can show. */
export function levelNames(cfg: MediaConfig, ids: unknown): string[] {
  const want = new Set((Array.isArray(ids) ? ids : []).map(x => String(x || '')))
  return cfg.levels.filter(l => want.has(l.id)).map(l => l.name)
}
