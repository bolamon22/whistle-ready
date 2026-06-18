import { SECTION_KEYS, SECTION_LABELS, resolveSectionOrder } from '@/lib/eventSections'

// Built-in section types are singletons whose content lives in dedicated fields
// (overview, locations, etc.). Custom block types are repeatable and store their
// content inline in the block's `props`.
export const BUILTIN_TYPES = SECTION_KEYS as readonly string[]
export const CUSTOM_TYPES = ['custom', 'cta', 'faq', 'countdown'] as const

export type Block = { id: string; type: string; hidden?: boolean; props?: any }

export const CUSTOM_BLOCK_LABELS: Record<string, string> = {
  custom: 'Custom text',
  cta: 'Call-to-action button',
  faq: 'FAQ',
  countdown: 'Countdown',
}

export function isBuiltin(type: string): boolean {
  return BUILTIN_TYPES.includes(type)
}

export function blockTypeLabel(type: string): string {
  return SECTION_LABELS[type] || CUSTOM_BLOCK_LABELS[type] || type
}

let _seq = 0
export function newBlockId(): string {
  _seq++
  return 'b' + Date.now().toString(36) + _seq.toString(36) + Math.random().toString(36).slice(2, 6)
}

export function newBlock(type: string): Block {
  const id = newBlockId()
  switch (type) {
    case 'custom': return { id, type, props: { title: 'New section', body: '' } }
    case 'cta': return { id, type, props: { label: 'Register now', url: '', style: 'primary' } }
    case 'faq': return { id, type, props: { title: 'FAQ', items: [{ q: '', a: '' }] } }
    case 'countdown': return { id, type, props: { title: 'Countdown to kickoff' } }
    default: return { id, type, props: {} }
  }
}

// Returns the complete ordered block list. Migrates from the POC's
// sectionOrder/hiddenSections when c.blocks is absent, and always guarantees
// each built-in section appears exactly once (missing ones appended).
export function resolveBlocks(c: any): Block[] {
  let blocks: Block[] = []
  if (Array.isArray(c?.blocks) && c.blocks.length) {
    blocks = c.blocks
      .filter((b: any) => b && typeof b.type === 'string')
      .map((b: any) => ({
        id: typeof b.id === 'string' && b.id ? (isBuiltin(b.type) ? b.type : b.id) : (isBuiltin(b.type) ? b.type : newBlockId()),
        type: b.type,
        hidden: !!b.hidden,
        props: b.props || {},
      }))
  } else {
    const order = resolveSectionOrder(c?.sectionOrder)
    const hidden = new Set(Array.isArray(c?.hiddenSections) ? c.hiddenSections : [])
    blocks = order.map((k: string) => ({ id: k, type: k, hidden: hidden.has(k), props: {} }))
  }
  const seen = new Set<string>()
  blocks = blocks.filter(b => {
    if (isBuiltin(b.type)) { if (seen.has(b.type)) return false; seen.add(b.type) }
    return true
  })
  for (const k of BUILTIN_TYPES) if (!seen.has(k)) blocks.push({ id: k, type: k, props: {} })
  return blocks
}
