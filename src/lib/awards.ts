import { prisma } from '@/lib/db'

// Awards and champions' media per division (api/tournaments/[id]/awards). One record
// per event: AppSetting `awards:<tournamentId>` = { [key]: AwardMark }, keyed by the
// championship Game id, or `div:<division>` for a pool-play-only division.
//
// `public` puts the photo or video across the top of that division's public bracket
// (components/ChampionHero, Bo Oct 17 2026). It stays staff-only until someone in
// AWARD_PUBLISH_ROLES turns it on: these are pictures of other people's children, and
// a blurry first try shouldn't reach every family by accident.

export type AwardMark = {
  awards?: boolean; photo?: boolean
  photoUrl?: string
  /** A short clip in Blob storage (lib/championMedia), and its cover frame. */
  videoUrl?: string; posterUrl?: string
  public?: boolean
  note?: string; by?: string; at?: string
}

export const awardsKey = (tournamentId: string) => `awards:${tournamentId}`

/** Who may put the champions' photo or video on the public page: the people running game day. */
export const AWARD_PUBLISH_ROLES = ['admin', 'director', 'field_director']

export async function readAwards(tournamentId: string): Promise<Record<string, AwardMark>> {
  try {
    const r = await prisma.appSetting.findUnique({ where: { key: awardsKey(tournamentId) } })
    const v = r ? JSON.parse(r.value) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
