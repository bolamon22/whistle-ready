// Vendor application config for an org, stored in AppSetting `orgForms:{orgId}`
// under `vendor`.
//
// WHY THIS SHAPE: the old config was a flat `levels` list -- Food Vendor,
// Merchandise Vendor, Bronze/Silver/Gold Sponsor -- which mixed two unrelated
// things: what a vendor IS, and how much they sponsor for. Tiered sponsorships
// are gone. A vendor now picks a TYPE, and the type carries the booth fee,
// whether they sell product, and whether we're taking applications for it at
// all (food & beverage is under contract for our events).
//
// Nobody pays on the application form. Every application is reviewed first;
// approved vendors get a link to pay. That's deliberate -- charging up front
// means refunding everyone we turn down, including a category we can't accept.
//
// An org that customised `levels` keeps exactly its own list (migrated below).
// An org still on the old built-in defaults picks up the new types instead.

export type VendorType = {
  id: string
  name: string
  /** Booth fee in dollars. 0 renders as "confirmed when we approve you" -- no invented number. */
  price: number
  /** Sells product on site -> we ask what they're selling and the resale terms apply. */
  selling: boolean
  /** Listed but not selectable: a category already under contract for this event. */
  closed: boolean
  /** One line under the name -- what's included, or why it's closed. */
  note: string
}

/** Everything an approved vendor needs to show up correctly. Blank blocks are
 *  omitted from the approval page rather than rendered empty, so this can be
 *  filled in a piece at a time as the event firms up. */
export type VendorInstructions = {
  where: string
  eventTimes: string
  loadIn: string
  loadOut: string
  bring: string
  contact: string
}

export type SponsorTier = { name: string; price: number }

export type VendorConfig = {
  types: VendorType[]
  /** Photo behind the page header. Defaults to a shot from the SEG gallery that
   *  actually has the vendor row in it; swap it in the Forms editor. */
  heroImage: string
  headline: string
  subhead: string
  /** Sponsorship is a different sale -- a conversation and a deck, not a booth
   *  checkbox. The form points at it instead of trying to take the order. */
  sponsorShow: boolean
  sponsorBlurb: string
  sponsorTiers: SponsorTier[]
  sponsorEmail: string
  /** Where 'a vendor applied' lands. Blank falls back to the org contact address. */
  notifyEmail: string
  approvalNotice: string
  disclaimer: string
  confirmationTitle: string
  confirmationMessage: string
  instructions: VendorInstructions
}

export const DEFAULT_VENDOR_TYPES: VendorType[] = [
  // Prices carried over from the Cognito form (SEGVendorRequestForm) this replaced.
  // NOTE: that form held TWO price lists that disagreed -- the level dropdown a vendor
  // picked from, and a second "Credit Card Payment" dropdown that was the one actually
  // charging (Onsite Vendor $600 vs $500, Showcase $300 vs $250, and so on down the
  // list). These are the published numbers, the ones vendors were quoted.
  { id: 'vendor',   name: 'Onsite vendor',               price: 600,  selling: true,  closed: false, note: 'One booth space for the weekend. Sell from your own tent, your own setup.' },
  { id: 'vendor-2', name: 'Onsite vendor, two locations', price: 1000, selling: true,  closed: false, note: 'Two spaces at opposite ends of the complex, so you catch both field clusters.' },
  { id: 'showcase', name: 'Onsite showcase',             price: 300,  selling: false, closed: false, note: 'Present, demo or hand out samples. No sales from the booth \u2014 recruiting services, clinics, camps.' },
  { id: 'food',     name: 'Food & beverage',             price: 0,    selling: true,  closed: true,  note: 'Concessions are contracted for the full season. We aren\u2019t taking food or drink applications.' },
]

// A frame from the org gallery with the vendor row visible behind the play. Real,
// and already hosted -- so the page is never shipping a stock photo of someone
// else's event. Replace it in Org -> Forms once there's a proper booth shot.
export const DEFAULT_VENDOR_HERO = '/api/img/0875f7bb-2de6-40ef-8a04-831025c9f6e8'
export const DEFAULT_HEADLINE = 'Set up where the families already are.'
export const DEFAULT_SUBHEAD = 'A weekend of lacrosse, and a parent on the sideline for six hours with nothing to do between games.'
export const DEFAULT_SPONSOR_BLURB = "Field naming, presenting rights and web placement are a different conversation \u2014 they're built around what you're trying to reach, and they don't fit in a booth form. Tell us what you have in mind and we'll send the deck."
export const DEFAULT_SPONSOR_TIERS: SponsorTier[] = [
  { name: 'Presenting sponsor', price: 3000 },
  { name: 'Field name sponsor', price: 2000 },
  { name: 'Featured web sponsor', price: 500 },
]

export const DEFAULT_APPROVAL_NOTICE =
  'Every vendor is reviewed before a spot is confirmed — submitting this form does not reserve one, and nothing is charged today. ' +
  'We look at what you sell, how it fits a youth sports event, and what we already have under contract. ' +
  "If you're approved we'll email you a link with your booth details, load-in and load-out times, and payment."

export const DEFAULT_VENDOR_DISCLAIMER =
  'Vendors are not allowed to sell tournament merchandise unless receiving prior approval from the organizer. ' +
  'Items not pre-approved on this application must be removed from the booth or may result in denied future access. ' +
  'Products that do not fit the mission of the event or are deemed not family-friendly will not be allowed to be sold.'

export const DEFAULT_CONFIRMATION_TITLE = 'Application received'
export const DEFAULT_CONFIRMATION_MESSAGE =
  "Thanks! We've received your vendor application. We review every application before confirming a spot — " +
  "you'll hear from us by email either way. Nothing has been charged."

const EMPTY_INSTRUCTIONS: VendorInstructions = { where: '', eventTimes: '', loadIn: '', loadOut: '', bring: '', contact: '' }

// The level list this app shipped as its built-in default before booth types existed.
// An org whose saved `levels` is exactly this never actually chose anything -- opening
// the Forms editor once was enough to persist the defaults -- so it should move to the
// current types rather than be frozen on Bronze/Silver/Gold forever. A list that
// differs in any way WAS a real choice and is preserved.
const LEGACY_DEFAULT_LEVELS = ['Food Vendor', 'Merchandise Vendor', 'Bronze Sponsor', 'Silver Sponsor', 'Gold Sponsor']
export function isUntouchedLegacyLevels(levels: unknown): boolean {
  if (!Array.isArray(levels) || levels.length !== LEGACY_DEFAULT_LEVELS.length) return false
  const a = levels.map(x => String(x).trim().toLowerCase()).sort()
  const b = LEGACY_DEFAULT_LEVELS.map(x => x.toLowerCase()).sort()
  return a.every((v, i) => v === b[i])
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'type'

/** Normalise whatever is stored (new shape, legacy `levels`, or nothing) into one config. */
export function vendorConfig(raw: any): VendorConfig {
  const vf = raw && typeof raw === 'object' ? raw : {}

  let types: VendorType[]
  if (Array.isArray(vf.types) && vf.types.length) {
    types = vf.types.map((t: any, i: number) => ({
      id: String(t?.id || slug(String(t?.name || `type-${i}`))),
      name: String(t?.name || '').trim() || `Vendor type ${i + 1}`,
      price: Number(t?.price) > 0 ? Number(t.price) : 0,
      selling: t?.selling !== false,
      closed: Boolean(t?.closed),
      note: String(t?.note || ''),
    }))
  } else if (Array.isArray(vf.levels) && vf.levels.length && !isUntouchedLegacyLevels(vf.levels)) {
    // Legacy: an org that customised its own list keeps it verbatim. Names are all
    // we had, so everything is open and priced at approval until they edit it.
    types = vf.levels.map((name: string, i: number) => ({
      id: slug(String(name)) || `level-${i}`,
      name: String(name),
      price: 0,
      selling: !/sponsor/i.test(String(name)),
      closed: false,
      note: '',
    }))
  } else {
    types = DEFAULT_VENDOR_TYPES
  }

  const tiers: SponsorTier[] = Array.isArray(vf.sponsorTiers)
    ? vf.sponsorTiers.map((t: any) => ({ name: String(t?.name || ''), price: Number(t?.price) || 0 })).filter((t: SponsorTier) => t.name)
    : DEFAULT_SPONSOR_TIERS

  const ins = (vf.instructions && typeof vf.instructions === 'object' ? vf.instructions : {}) as any
  return {
    types,
    heroImage: typeof vf.heroImage === 'string' ? vf.heroImage : DEFAULT_VENDOR_HERO,
    headline: typeof vf.headline === 'string' && vf.headline.trim() ? vf.headline : DEFAULT_HEADLINE,
    subhead: typeof vf.subhead === 'string' ? (vf.subhead || DEFAULT_SUBHEAD) : DEFAULT_SUBHEAD,
    sponsorShow: vf.sponsorShow !== false,
    sponsorBlurb: typeof vf.sponsorBlurb === 'string' && vf.sponsorBlurb.trim() ? vf.sponsorBlurb : DEFAULT_SPONSOR_BLURB,
    sponsorTiers: tiers,
    sponsorEmail: String(vf.sponsorEmail || ''),
    notifyEmail: String(vf.notifyEmail || ''),
    approvalNotice: typeof vf.approvalNotice === 'string' ? vf.approvalNotice : DEFAULT_APPROVAL_NOTICE,
    disclaimer: vf.disclaimer || DEFAULT_VENDOR_DISCLAIMER,
    confirmationTitle: vf.confirmationTitle || DEFAULT_CONFIRMATION_TITLE,
    confirmationMessage: vf.confirmationMessage || DEFAULT_CONFIRMATION_MESSAGE,
    instructions: { ...EMPTY_INSTRUCTIONS, ...Object.fromEntries(Object.keys(EMPTY_INSTRUCTIONS).map(k => [k, String(ins[k] || '')])) },
  }
}

/** "$450" / "" for a fee that's set at approval time. */
export function priceLabel(price: number): string {
  return price > 0 ? `$${price.toLocaleString('en-US', { minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 })}` : ''
}
