// Coach waiver + credential config for an org, stored in AppSetting
// `orgForms:{orgId}` under `coach`. Same shape as vendorForm.ts / mediaForm.ts —
// one normalizer every surface reads, so the public form, the staff list and the
// credential can never disagree about what a coach agreed to.
//
// WHY A COACH IS ITS OWN FORM TYPE: a coach is not a player and not staff. They
// stand inside the fence without working for us, they are responsible for other
// people's children, and they can be on the sideline for several teams at once.
// The player waiver covers none of that.
//
// VERSIONED WAIVER TEXT. A signature only means something against the wording
// that was on screen when it was typed, so a submission stores waiverVersion and
// never a copy of the text. Change a clause => bump the version; old records stay
// attached to the words their signer actually agreed to.
//
// NOT REVIEWED BY COUNSEL — see the note at the bottom.

export const COACH_WAIVER_VERSION = '2026.09'

export const COACH_ROLES = ['Head Coach', 'Assistant Coach', 'Team Manager'] as const
export type CoachRole = typeof COACH_ROLES[number]

export const COACH_LEVELS = [
  'Youth / Rec',
  'Select / Travel Club',
  'High School Varsity / JV',
  'Collegiate NCAA / MCLA',
  'Professional / National Team',
] as const

export const COACH_CERTS = [
  'USA Lacrosse Certified',
  'NFHS / State Certified',
  'CPR / First Aid / AED Certified',
  'SafeSport / Abuse Prevention Trained',
] as const

/** Short forms for the credential — the full names do not fit on a badge. */
export const CERT_SHORT: Record<string, string> = {
  'USA Lacrosse Certified': 'USAL',
  'NFHS / State Certified': 'NFHS',
  'CPR / First Aid / AED Certified': 'CPR/AED',
  'SafeSport / Abuse Prevention Trained': 'SafeSport',
}

export type WaiverSection = {
  key: 'conduct' | 'safety' | 'risk'
  title: string
  /** Shown under the title — why this section exists, in plain words. */
  intro: string
  body: string[]
  /** The sentence beside the checkbox: what they are actually agreeing to. */
  agree: string
}

export const COACH_WAIVER: WaiverSection[] = [
  {
    key: 'conduct',
    title: 'Coach Code of Conduct & Sideline Privilege',
    intro: 'What we expect on the sideline, and what happens if it is not met.',
    agree: 'I have read the Coach Code of Conduct and accept that my sideline credential may be revoked without refund.',
    body: [
      'A sideline credential is a privilege extended to me for this event. It is not a ticket, it is not property, and it carries no refund value.',
      'I will conduct myself with sportsmanship toward players, coaches, officials, event staff, volunteers, and spectators — my own team’s and every other team’s — before, during, and after every game, on and off the playing field.',
      'I understand there is zero tolerance for harassment of officials or event staff. That includes verbal abuse, profanity directed at a person, threats, physical intimidation, following or confronting an official or staff member, and persistent dissent after a ruling has been made. Disagreement is not misconduct; how it is expressed can be.',
      'I accept responsibility for the conduct of the players on my roster and for the spectators, parents, and guests attending in support of my team. If a spectator connected to my team is asked to leave, I will support that instruction rather than contest it on their behalf.',
      'I will not coach, or be present on the sideline, while under the influence of alcohol or any substance that impairs judgment.',
      'I understand my credential may be suspended or revoked at any time — for the remainder of a game, a day, or the entire event — at the event director’s sole discretion and without refund of any entry fee, travel cost, or other expense. That decision is final for the duration of the event.',
      'I understand that conduct serious enough to warrant removal may be reported to my club and to the governing bodies my club is affiliated with, and may affect my eligibility for future events.',
    ],
  },
  {
    key: 'safety',
    title: 'Youth Safety & Background Attestation',
    intro: 'Coaches work around other people’s children. This is the attestation that makes that acceptable.',
    agree: 'I attest that every statement in the Youth Safety & Background Attestation is true and complete as of today.',
    body: [
      'I attest that I am legally authorized to coach, supervise, or otherwise work with youth athletes, and that I am in good standing with every club, league, school, and governing body I am currently affiliated with.',
      'I attest that I am not currently suspended, banned, barred, under investigation, or otherwise restricted by any athletic organization, governing body, school district, or SafeSport or equivalent authority from participating in youth athletics.',
      'I attest that I have never been convicted of, pled guilty to, pled no contest to, or entered any diversionary program for: any offense involving a minor; any sexual offense; any offense involving violence, assault, or abuse; or any offense requiring registration as a sex offender in any jurisdiction.',
      'I attest that I am not the subject of any pending criminal charge, protective order, or civil action of the kinds described above.',
      'I understand that a background screening, proof of SafeSport or equivalent training, or verification of my standing with my club may be required at any time, and that declining to provide it will result in my credential being withheld.',
      'I understand that a false statement here is grounds for immediate removal from the event without refund, and that a knowingly false attestation may be reported to my club, to the relevant governing bodies, and where the law requires it, to law enforcement.',
      'I agree to give written notice if anything attested to above changes between signing this form and the end of the event.',
    ],
  },
  {
    key: 'risk',
    title: 'Coach Waiver & Assumption of Risk',
    intro: 'The physical risk of standing on a lacrosse sideline, and who carries it.',
    agree: 'I have read the Waiver & Assumption of Risk, I accept the physical risk, and I release the parties named.',
    body: [
      'I understand that lacrosse is a contact sport played at speed, and that the area around a playing field is not a spectator-safe distance. Risks to an adult on or near the sideline include, without limitation: being struck by a ball, a stick, a player, or equipment; collisions with players, officials, or coaches leaving the field of play; slips, trips, and falls on natural or artificial turf, uneven ground, wet surfaces, or field equipment; heat illness, dehydration, sun exposure, and lightning; and injury while handling goals, benches, coolers, tents, or other event equipment.',
      'I am voluntarily present at this event. I accept and assume all risk of bodily injury, illness, permanent disability, death, and property loss or damage arising from my presence, whether caused by the ordinary negligence of the parties released below or otherwise.',
      'To the fullest extent permitted by law, I release, waive, discharge, and agree not to sue the event organizer, its owners, officers, employees, contractors, event staff, volunteers, officials, and sponsors, together with the host municipality and the owners and operators of the facility and fields used for this event, from any and all claims, demands, causes of action, and liability for loss, damage, or injury to my person or property arising out of my attendance at this event.',
      'I agree to hold harmless and indemnify the parties released above against any claim brought by or on behalf of me or my family arising from my presence at this event.',
      'This release does not apply to gross negligence or willful or wanton misconduct, and nothing in it limits any right that cannot be waived by law.',
      'I confirm that I am physically able to be present in this environment and that I am responsible for my own medical insurance. I authorize event staff to arrange emergency medical care on my behalf if I am unable to consent, and I accept financial responsibility for that care.',
      'I understand this release binds me, my heirs, my personal representatives, and my estate.',
    ],
  },
]

export const COACH_SIGNATURE_PROMPT =
  'Type your full legal name below. This is your electronic signature and carries the same weight as signing on paper.'

export type CoachConfig = {
  enabled: boolean
  title: string
  intro: string
  /** Optional per-org replacement for a clause, keyed by section. Blank = ship default. */
  overrides: Partial<Record<WaiverSection['key'], string>>
  /** Ask whether the team is staying in paid accommodation (feeds the housing report). */
  hotelQuestion: boolean
  /** Collect level coached + certifications. Off makes the form two screens shorter. */
  qualifications: boolean
  /** Let a coach add a photo to their credential. */
  photo: boolean
  confirmationTitle: string
  confirmationMessage: string
}

const str = (x: unknown): string => String(x ?? '').trim()
const bool = (x: unknown, dflt: boolean): boolean => (typeof x === 'boolean' ? x : dflt)

export const DEFAULT_COACH_TITLE = 'Coach Waiver & Registration'
export const DEFAULT_COACH_INTRO =
  'Every coach, assistant coach, and team manager on the sideline completes this once per event. Coaching more than one team? Select them all — you get one credential covering all of them.'

/** One normalizer. Never read forms.coach directly; come through here. */
export function coachConfig(raw: any): CoachConfig {
  const c = raw && typeof raw === 'object' ? raw : {}
  const ov = c.overrides && typeof c.overrides === 'object' ? c.overrides : {}
  return {
    enabled: bool(c.enabled, true),
    title: str(c.title) || DEFAULT_COACH_TITLE,
    intro: str(c.intro) || DEFAULT_COACH_INTRO,
    overrides: {
      conduct: str(ov.conduct) || undefined,
      safety: str(ov.safety) || undefined,
      risk: str(ov.risk) || undefined,
    },
    hotelQuestion: bool(c.hotelQuestion, true),
    qualifications: bool(c.qualifications, true),
    photo: bool(c.photo, true),
    confirmationTitle: str(c.confirmationTitle) || 'You are credentialed',
    confirmationMessage: str(c.confirmationMessage) ||
      'Your coach credential is ready. Show it at the coaches’ tent when you arrive — the QR is your check-in.',
  }
}

/** The sections to render, with any org override swapped in. */
export function coachWaiverFor(cfg: CoachConfig): WaiverSection[] {
  return COACH_WAIVER.map(s => {
    const o = cfg.overrides[s.key]
    return o ? { ...s, body: o.split(/\n{2,}/).map(x => x.trim()).filter(Boolean) } : s
  })
}

// ── Before this collects a real signature ────────────────────────────────────
// Have the org's attorney read all three sections. Three things specifically:
//   1. The release names the organizer, the host municipality and the facility
//      generically here. Florida enforces pre-injury releases for adults but is
//      strict about naming the released party, so per-event wording may be needed.
//   2. The background section is a SELF-ATTESTATION, not a background check. If a
//      venue, grant, insurer or partner requires screening, this does not satisfy it.
//   3. Venue permits often require the municipality's own indemnity wording, which
//      is not in here.
