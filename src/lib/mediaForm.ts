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
  /** Selectable, but applying is not the same as getting it: a capped number of
   *  spots. Says so on the form rather than in a rejection email afterwards. */
  limited?: boolean
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
  confirmationTitle: string
  confirmationMessage: string
  commitments: MediaCommitments
  instructions: MediaInstructions
}

export const DEFAULT_MEDIA_LEVELS: MediaLevel[] = [
  { id: 'contribute', name: 'Contribute photos and video to the gallery', closed: false,
    note: 'Free. Your name and link under everything you upload — stills or clips.' },
  // Capped on purpose: a booking spot is only worth having if families are not
  // choosing between twenty profiles, and Bo cannot take everyone who applies
  // (Sep 17 2026). Better said here than in a rejection.
  { id: 'book', name: 'Take bookings from teams and families', closed: false, limited: true,
    note: 'A few spots per event, so applying does not guarantee one. If we approve you: a profile page with your packages, and you keep 100% of what you book — we take no cut.' },
  // Closed until the media release covers commercial use. Selling images of a
  // registered minor under a promotion-only waiver is not a gap to paper over,
  // so the level ships visible-but-locked rather than quietly missing.
  { id: 'sell', name: 'Sell your work in the gallery', closed: true,
    note: 'Opening soon. We handle watermarking, hosting and payment; you set your prices and keep most of it.' },
]

export const DEFAULT_MEDIA_BENEFITS = [
  'Sideline access for the whole weekend',
  'Your name and link under every photo and clip you upload',
  'A profile page on this site that parents and coaches can book from, if you take a booking spot',
  'Team and player requests sent straight to you',
  'You keep the copyright in everything you shoot',
]

export const DEFAULT_MEDIA_TERMS =
  'You keep full copyright in everything you shoot. You grant us a non-exclusive licence to use the ' +
  'photos and video you upload here to promote our events, with your credit attached — we do not resell your ' +
  'work, and you can pull any photo down at any time. You agree to follow the field rules we send with ' +
  'your credential, to wear it visibly, and to stay out of team areas and behind the restraining line.'

export const DEFAULT_MEDIA_MINORS =
  'Every player at our events is registered under a waiver covering event photography. A parent may ask ' +
  'for any photo of their child to be removed, and we will take it down without asking why. Do not ' +
  'photograph anyone who asks you not to.'

export const DEFAULT_COMMITMENTS: MediaCommitments = {
  show: true,
  minPhotos: 20,
  withinDays: 7,
  socialHandle: '',
  tagRequired: true,
  collabRequired: true,
  extra: [],
}

export const DEFAULT_MEDIA_HERO = '/api/img/0875f7bb-2de6-40ef-8a04-831025c9f6e8'

const str = (x: unknown): string => String(x ?? '').trim()

export function mediaConfig(raw: any): MediaConfig {
  const byId = new Map<string, any>(
    (Array.isArray(raw?.levels) ? raw.levels : []).map((l: any) => [str(l?.id), l])
  )
  // Always the three built-in levels in a fixed order -- an org edits the wording
  // and can close one, but cannot invent a fourth. The public page, the
  // application and the approval email all key off these ids.
  const levels: MediaLevel[] = DEFAULT_MEDIA_LEVELS.map(d => {
    const o = byId.get(d.id)
    return o
      ? { id: d.id, name: str(o.name) || d.name, note: str(o.note) || d.note, closed: o.closed === true, limited: o.limited === undefined ? d.limited : o.limited === true }
      : { ...d }
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
    confirmationTitle: str(raw?.confirmationTitle) || 'Application received',
    confirmationMessage: str(raw?.confirmationMessage) ||
      'Thanks — we have your application and we will come back to you within a few days.',
    commitments: {
      show: raw?.commitments?.show !== false,
      minPhotos: Number(raw?.commitments?.minPhotos) >= 0 && raw?.commitments?.minPhotos !== undefined
        ? Math.floor(Number(raw.commitments.minPhotos)) : DEFAULT_COMMITMENTS.minPhotos,
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
  // Leads with THEM inviting US, which is the direction that actually happens:
  // a working photographer posts far more often than the org does, so waiting
  // for our post to collab on means most of the reach never arrives (Bo,
  // Sep 16 2026). Ours is still offered, second.
  if (c.socialHandle && c.collabRequired) out.push(`Add @${c.socialHandle} as a collaborator on your posts from the event \u2014 and accept ours when we share yours`)
  return [...out, ...c.extra]
}

/** Level ids -> the names an email or a list can show. */
export function levelNames(cfg: MediaConfig, ids: unknown): string[] {
  const want = new Set((Array.isArray(ids) ? ids : []).map(x => String(x || '')))
  return cfg.levels.filter(l => want.has(l.id)).map(l => l.name)
}
