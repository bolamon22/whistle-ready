import { prisma } from '@/lib/db'
import { housingSettings } from '@/lib/housing'
import { cleanHotels, hotelsPath, safeUrl, type EventHotel } from '@/lib/eventHotels'

// Where an event's "hotel" link takes a family. Server only.
//
// Each event has its own housing link (Builder › Hotels: Legacy makes a site per
// event, e.g. Monster Mash 119569, Fall Classic 119459) and may list its block
// hotels (lib/eventHotels). The org-wide booking link at Staff › Housing is the
// fallback for an event with neither. Until Oct 7 2026 the short link and the
// club letters used only that org-wide link, which was Monster Mash's, so the
// Fall Classic's hotel link would have opened the Wellington hotels.

export type EventHotelInfo = { hotels: EventHotel[]; hotelsUrl: string; orgBookingUrl: string }

export async function eventHotelInfo(tournamentId: string, orgId?: string | null): Promise<EventHotelInfo> {
  let c: any = {}
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `tournamentSite:${tournamentId}` } })
    c = row ? JSON.parse(row.value || '{}') : {}
  } catch { /* no event content yet */ }
  let orgBookingUrl = ''
  try { orgBookingUrl = orgId ? safeUrl((await housingSettings(orgId)).bookingUrl) : '' } catch { /* housing table not reachable */ }
  return { hotels: cleanHotels(c?.hotelList), hotelsUrl: safeUrl(c?.hotelsUrl), orgBookingUrl }
}

/**
 * The page to send families to: the event's own hotel list when it has one,
 * else the event's housing link, else the org's, else '' (the caller decides).
 */
export function hotelDestination(info: EventHotelInfo, tournamentId: string, abs: (path: string) => string): string {
  if (info.hotels.length) return abs(hotelsPath(tournamentId))
  return info.hotelsUrl || info.orgBookingUrl || ''
}

export const hasHotelInfo = (info: EventHotelInfo) => info.hotels.length > 0 || !!info.hotelsUrl || !!info.orgBookingUrl
