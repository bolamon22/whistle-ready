// The organization's own music list for Reels, next to the ten built-in tracks in
// lib/reelSongs (Bo, Oct 18 2026: the built-ins are "all very techno-ish ... something
// more sports related, champions ... maybe we can get some categories going").
//
// Staff download tracks from free libraries such as Pixabay Music (business use, no
// credit line) and upload them once; they then show in the Song list of both Reel
// makers, grouped by category. Each org keeps its own list because those licenses
// let us use the music in our videos but not hand the files on to other organizations.
// Client-safe: types and the category list. Storage is lib/reelMusicServer.

export type OrgTrack = { id: string; title: string; category: string; url: string; addedAt: string }

export const MUSIC_CATEGORIES = [
  { id: 'champions', label: 'Champions & victory' },
  { id: 'stadium', label: 'Stadium anthems' },
  { id: 'rock', label: 'Sports rock' },
  { id: 'hiphop', label: 'Hip-hop' },
  { id: 'epic', label: 'Epic orchestral' },
  { id: 'drumline', label: 'Drumline & marching' },
  { id: 'chill', label: 'Calm & feel-good' },
  { id: 'other', label: 'Other' },
] as const

export const categoryLabel = (id: string) => MUSIC_CATEGORIES.find(c => c.id === id)?.label || 'Other'

/** Song-picker value for an org track. */
export const orgSongId = (id: string) => `org:${id}`
export const isOrgSong = (v: string) => v.startsWith('org:')

/** Tracks grouped in category order, for <optgroup>s. */
export function groupTracks(tracks: OrgTrack[]): { label: string; tracks: OrgTrack[] }[] {
  return MUSIC_CATEGORIES.map(c => ({ label: c.label, tracks: tracks.filter(t => (MUSIC_CATEGORIES.some(x => x.id === t.category) ? t.category : 'other') === c.id) }))
    .filter(g => g.tracks.length)
}

/** A friendlier title from a downloaded file name ("sports-rock-music-597971.mp3" → "Sports Rock Music"). */
export function titleFromFile(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b\d{4,}\b/g, '').replace(/\s+/g, ' ').trim()
  return base.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60) || 'My track'
}
