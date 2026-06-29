// Single source of truth for the public event page's section keys, labels, and
// default order. Used by the public event page (to render in order) and the
// event-page editor (the drag-to-reorder / show-hide panel).
export const SECTION_KEYS = ['overview', 'fees', 'divisions', 'locations', 'hotels', 'rules', 'contacts', 'sponsors'] as const
export type SectionKey = typeof SECTION_KEYS[number]

export const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  fees: 'Tournament fees',
  divisions: 'Divisions',
  locations: 'Location',
  hotels: 'Hotels',
  rules: 'Rules',
  contacts: 'Contacts',
  sponsors: 'Sponsors & partners',
}

// Resolve a saved order into a complete, valid order: keep saved keys (that are
// still real sections), then append any sections not present in the saved list
// (so newly added section types always show up).
export function resolveSectionOrder(saved?: string[]): string[] {
  const keys = SECTION_KEYS as readonly string[]
  const base = Array.isArray(saved) ? saved.filter(k => keys.includes(k)) : []
  return [...base, ...SECTION_KEYS.filter(k => !base.includes(k))]
}
