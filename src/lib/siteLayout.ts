// Which home-page sections an org's website shows, and in what order.
//
// Stored on the orgSite content as `layout: { order, hidden }` and read by both the
// public home page (/o/[slug]) and the Website editor's live preview, so the two can
// never disagree. No database import: the editor is a client component.
//
// An org that has never touched the order gets DEFAULT_ORDER, which is the order the
// page had before sections could be moved. A key the page doesn't know is dropped, and a
// section added later lands where DEFAULT_ORDER puts it, so old saved layouts keep working.

export const SITE_SECTIONS = [
  { key: 'hero', label: 'Hero', note: 'Headline, photo and the Register button' },
  { key: 'events', label: 'Upcoming tournaments', note: 'Fills itself from your tournaments', auto: true },
  { key: 'stats', label: 'By the numbers', note: 'Counted from your results', auto: true },
  { key: 'about', label: 'About', note: 'Who you are' },
  { key: 'gallery', label: 'From the fields', note: 'Your photo gallery' },
  { key: 'sponsors', label: 'Our partners', note: 'Sponsor logos' },
  { key: 'instagram', label: 'Instagram', note: 'Your latest posts' },
  { key: 'register', label: 'Register band', note: 'Next event and a Register button', auto: true },
] as const

export type SiteSectionKey = typeof SITE_SECTIONS[number]['key']
export const DEFAULT_ORDER: SiteSectionKey[] = SITE_SECTIONS.map(s => s.key)
export type SiteLayout = { order: SiteSectionKey[]; hidden: SiteSectionKey[] }

const KNOWN = new Set<string>(DEFAULT_ORDER)

export function siteLayout(raw: unknown): SiteLayout {
  const r: any = raw && typeof raw === 'object' ? raw : {}
  const saved = (Array.isArray(r.order) ? r.order : []).map(String).filter((k: string) => KNOWN.has(k))
  const order: SiteSectionKey[] = []
  for (const k of saved) if (!order.includes(k)) order.push(k)
  // Sections missing from a saved order go back in after the section that precedes them
  // in DEFAULT_ORDER, not at the end.
  DEFAULT_ORDER.forEach((k, i) => {
    if (order.includes(k)) return
    const prev = DEFAULT_ORDER.slice(0, i).reverse().find(p => order.includes(p))
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k)
  })
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).map(String).filter((k: string) => KNOWN.has(k)) as SiteSectionKey[]
  return { order, hidden: Array.from(new Set(hidden)) }
}

export const sectionLabel = (k: string) => SITE_SECTIONS.find(s => s.key === k)?.label || k
