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
  instructions: MediaInstructions
}

export const DEFAULT_MEDIA_LEVELS: MediaLevel[] = [
  { id: 'contribute', name: 'Contribute photos to the gallery', closed: false,
    note: 'Free. Your name and link under every shot you upload.' },
  { id: 'book', name: 'Take bookings from teams and families', closed: false,
    note: 'You get a profile page with your packages. You keep 100% of what you book — we take no cut.' },
  // Closed until the media release covers commercial use. Selling images of a
  // registered minor under a promotion-only waiver is not a gap to paper over,
  // so the level ships visible-but-locked rather than quietly missing.
  { id: 'sell', name: 'Sell individual photos in the gallery', closed: true,
    note: 'Opening soon. We handle watermarking, hosting and payment; you set your prices and keep most of it.' },
]

export const DEFAULT_MEDIA_BENEFITS = [
  'Sideline access for the whole weekend',
  'Your name and link under every photo you upload',
  'A profile page on this site that parents and coaches can book from',
  'Team and player requests sent straight to you',
  'You keep the copyright in everything you shoot',
]

export const DEFAULT_MEDIA_TERMS =
  'You keep full copyright in everything you shoot. You grant us a non-exclusive licence to use the ' +
  'photos you upload here to promote our events, with your credit attached — we do not resell your ' +
  'work, and you can pull any photo down at any time. You agree to follow the field rules we send with ' +
  'your credential, to wear it visibly, and to stay out of team areas and behind the restraining line.'

export const DEFAULT_MEDIA_MINORS =
  'Every player at our events is registered under a waiver covering event photography. A parent may ask ' +
  'for any photo of their child to be removed, and we will take it down without asking why. Do not ' +
  'photograph anyone who asks you not to.'

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
      ? { id: d.id, name: str(o.name) || d.name, note: str(o.note) || d.note, closed: o.closed === true }
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
      'Field access at every event, your name on every frame, and a page on this site where coaches and parents book you directly. Credentials are free.',
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

/** Level ids -> the names an email or a list can show. */
export function levelNames(cfg: MediaConfig, ids: unknown): string[] {
  const want = new Set((Array.isArray(ids) ? ids : []).map(x => String(x || '')))
  return cfg.levels.filter(l => want.has(l.id)).map(l => l.name)
}
