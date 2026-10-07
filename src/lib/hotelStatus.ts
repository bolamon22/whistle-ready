import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { cleanHotels, hotelKey } from '@/lib/eventHotels'

// Sold-out marks for an event's block hotels (lib/eventHotels says why they live
// apart from the hotel list). Server only.
//
// AppSetting hotelStatus:<tournamentId> =
//   { "soldOut": { "<hotelKey>": { "at": ISO time, "by": "housing board" | staff name } } }
//
// Two doors write it: Vinny's housing board (/api/housing/board, the board link is
// the key) and Builder › Hotels (/api/tournaments/<id>/hotel-status, setup access).

export type SoldOutMarks = Record<string, { at: string; by: string }>
export type HotelSwitch = { key: string; name: string; soldOut: boolean }

const settingKey = (tournamentId: string) => `hotelStatus:${tournamentId}`

export async function soldOutMarks(tournamentId: string): Promise<SoldOutMarks> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: settingKey(tournamentId) } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    const out: SoldOutMarks = {}
    for (const [k, m] of Object.entries(v?.soldOut || {})) {
      if (k) out[k] = { at: String((m as any)?.at || ''), by: String((m as any)?.by || '') }
    }
    return out
  } catch { return {} }
}

/** The event's listed hotels, as switches: key, name, sold out or not. */
export async function hotelSwitches(tournamentId: string): Promise<HotelSwitch[]> {
  let c: any = {}
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `tournamentSite:${tournamentId}` } })
    c = row ? JSON.parse(row.value || '{}') : {}
  } catch { /* no event content yet */ }
  const marks = await soldOutMarks(tournamentId)
  return cleanHotels(c?.hotelList)
    .map(h => ({ key: hotelKey(h), name: h.name, soldOut: !!marks[hotelKey(h)] }))
    .filter(h => h.key)
}

/**
 * Mark one listed hotel sold out, or open again. Only a hotel on the event's saved
 * list can be marked, so nothing else gets stored here; marks for hotels since
 * taken off the list are dropped. Returns null when the hotel isn't listed.
 */
export async function setSoldOut(tournamentId: string, key: string, soldOut: boolean, by: string): Promise<HotelSwitch[] | null> {
  const listed = await hotelSwitches(tournamentId)
  if (!key || !listed.some(h => h.key === key)) return null
  const marks = await soldOutMarks(tournamentId)
  for (const k of Object.keys(marks)) if (!listed.some(h => h.key === k)) delete marks[k]
  if (soldOut) marks[key] = { at: new Date().toISOString(), by: String(by || '').slice(0, 80) }
  else delete marks[key]
  const value = JSON.stringify({ soldOut: marks })
  await prisma.appSetting.upsert({ where: { key: settingKey(tournamentId) }, update: { value }, create: { key: settingKey(tournamentId), value } })
  // The families' pages are cached for 30 s; show the change now.
  for (const p of [`/tournaments/${tournamentId}/event`, `/tournaments/${tournamentId}/hotels`]) {
    try { revalidatePath(p) } catch { /* best-effort */ }
  }
  return listed.map(h => ({ ...h, soldOut: !!marks[h.key] }))
}
