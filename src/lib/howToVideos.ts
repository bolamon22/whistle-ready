// How-to videos for families and club directors (Oct 13 2026).
//
// Unlike the staff training videos (lib/training.ts), these are public and
// branded "Sunshine Events Group, powered by Whistle Ready", so they only show
// for that org: on its waiver pages, its club portal, its emails and its
// /how-to page. Another org on Whistle Ready sees none of it until it has its
// own videos. Client-safe: no database import.
//
// Files: public/how-to/<id>.mp4 plus a <id>.jpg poster (the title card). Made
// with the same harness as the staff videos; re-film when those screens change.

export const HOW_TO_ORG_SLUG = 'sunshine-events-group'

// A members-only video (Bo, Oct 17 2026: the club director's portal tour shows a
// competitor how the portal works, so it's for signed-in club directors only). It is
// left off the public /how-to page and public Chirp, its file sits in videos/how-to
// outside public/, streamed by api/how-to/video to signed-in club directors and staff,
// and its links go to the portal, where it plays after they sign in.
export type HowToVideo = { id: string; title: string; audience: string; blurb: string; secs: number; members?: boolean }

export const HOW_TO_VIDEOS: HowToVideo[] = [
  { id: 'waiver', title: "Your player's waiver and parent account", audience: 'Parents', secs: 86,
    blurb: "Fill out and sign the online waiver, then save your info so siblings and the next event take a few clicks." },
  { id: 'parent-dashboard', title: 'Your parent dashboard and team alerts', audience: 'Parents', secs: 53,
    blurb: "Your next game, live scores, your teams' schedule, and phone alerts when the schedule posts, a game moves, or a score comes in." },
  { id: 'club-portal', title: "Your club director's portal", audience: 'Club directors', secs: 69, members: true,
    blurb: 'Pay your balance, track waivers, request team changes, and register for future events.' },
  { id: 'coach-waiver', title: 'Coach waiver and credential', audience: 'Coaches', secs: 83,
    blurb: 'Sign the coach waiver once per event, cover every team you coach, and get your sideline credential.' },
]

export const howToVideo = (id: string) => HOW_TO_VIDEOS.find(v => v.id === id) || null
/** The ones anyone may see: the public /how-to page and public Chirp list only these. */
export const PUBLIC_HOW_TO_VIDEOS = HOW_TO_VIDEOS.filter(v => !v.members)
export const hasHowTo = (orgSlug?: string | null) => !!orgSlug && orgSlug === HOW_TO_ORG_SLUG
export const howToSrc = (id: string) => howToVideo(id)?.members ? `/api/how-to/video/${encodeURIComponent(id)}` : `/how-to/${id}.mp4`
export const howToPoster = (id: string) => `/how-to/${id}.jpg`
/** The public page path, relative to the org's site (sunshineeventsgroup.com/how-to).
 *  A members-only video links to the club portal instead, which asks them to sign in. */
export const howToPath = (id?: string) => id && howToVideo(id)?.members
  ? `/dashboard/club-director?watch=${encodeURIComponent(id)}`
  : `/how-to${id ? `?v=${encodeURIComponent(id)}` : ''}`
export const howToMinutes = (secs: number) => `${Math.max(1, Math.round(secs / 60))} min`

const EMAIL_LABELS: Record<string, string> = {
  'waiver': 'How families sign the waiver',
  'club-portal': 'Tour your club portal',
  'coach-waiver': 'How coaches sign the waiver',
  'parent-dashboard': 'Your parent dashboard and team alerts',
}

/** One quiet line of video links for a club email. `abs` turns a site path into a
 *  full URL on the org's domain (lib/seo tournamentAbs). Empty for other orgs. */
export function howToEmailLinks(orgSlug: string | null | undefined, abs: (path: string) => string, ids: string[]): { html: string; text: string } {
  if (!hasHowTo(orgSlug)) return { html: '', text: '' }
  const vids = ids.map(howToVideo).filter((v): v is HowToVideo => !!v)
  if (!vids.length) return { html: '', text: '' }
  const label = (v: HowToVideo) => `${EMAIL_LABELS[v.id] || v.title} (${howToMinutes(v.secs)} video)`
  const html = `<p style="margin:16px 0 0;font-size:13px;color:#64748b">&#9654;&#xFE0E; ${vids.map(v => `<a href="${abs(howToPath(v.id))}" style="color:#0f766e">${label(v)}</a>`).join(' &nbsp;·&nbsp; ')}</p>`
  const text = vids.map(v => `${label(v)}: ${abs(howToPath(v.id))}`).join('\n')
  return { html, text }
}
