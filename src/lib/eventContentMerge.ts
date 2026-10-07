// Folding one Tournament setup page's edits into a newer save of the same event
// page (Oct 7 2026).
//
// Tournament setup saves an event's whole page content (overview, hotels, blocks,
// rules, contacts ...) in one piece, and it saves it on every Save Changes. A setup
// page opened earlier used to put its old copy back over everything saved since:
// Monster Mash's 10 nearby hotels vanished twice that way on Oct 7. Now the site
// route turns down a save that wasn't based on the copy stored now (409, sending
// that copy back), and the page merges its own edits into it here and saves again:
//   - a part this page didn't change keeps the newer copy;
//   - a part only this page changed keeps this page's edit;
//   - a part changed in both places: the hotel list and the page blocks merge item
//     by item (hotels by hotelKey, blocks by id); anything else keeps this page's
//     edit, the one being saved now.
// Pure: no database, safe in client components.

import { hotelKey } from '@/lib/eventHotels'

type Obj = Record<string, any>

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const list = (v: unknown): any[] => Array.isArray(v) ? v : []

/**
 * Three-way merge of a list of items with ids. `mine` was edited on this page from
 * `base`; `theirs` was saved somewhere else since. Items keep this page's order,
 * and items added elsewhere go at the end. An item with no id (a blank row still
 * being filled in) always stays as this page has it.
 */
export function mergeById<T>(base: T[], mine: T[], theirs: T[], id: (x: T) => string): T[] {
  const was = new Map(base.map(x => [id(x), x] as const))
  const now = new Map(theirs.map(x => [id(x), x] as const))
  const out: T[] = []
  const placed = new Set<string>()
  for (const x of mine) {
    const k = id(x)
    placed.add(k)
    const b = was.get(k)
    if (!k || b === undefined || !sameJson(x, b)) out.push(x)  // added or edited on this page
    else if (now.has(k)) out.push(now.get(k) as T)            // untouched here: the newer copy
    // else: untouched here and removed elsewhere, so it stays removed
  }
  for (const t of theirs) {
    const k = id(t)
    if (k && !placed.has(k) && !was.has(k)) { out.push(t); placed.add(k) }  // added elsewhere
  }
  return out
}

/** `mine` (edited on this page from `base`) folded into `theirs` (saved since). */
export function mergeEventContent<C extends Obj>(base: C, mine: C, theirs: C): C {
  const out: Obj = {}
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)])) {
    const b = base[k], m = mine[k], t = theirs[k]
    let v: unknown
    if (sameJson(m, b)) v = t                                // not changed here
    else if (sameJson(t, b) || sameJson(t, m)) v = m         // changed only here
    else if (k === 'hotelList') v = mergeById(list(b), list(m), list(t), (h: any) => hotelKey(h))
    else if (k === 'blocks') v = mergeById(list(b), list(m), list(t), (x: any) => typeof x?.id === 'string' ? x.id : '')
    else v = m                                               // changed in both places
    if (v !== undefined) out[k] = v
  }
  return out as C
}
