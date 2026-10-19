// Cleared players on the social scheduler: the shared, database-free pieces (types,
// the caption a player post starts with, which look to use). Imported by the
// scheduler page in the browser and by lib/socialPlayers on the server, so this file
// must never import @/lib/db or anything that does.
//
// Words follow what the family agreed to on the permission page (lib/photoConsent):
// the player's FIRST name and team only. No urgency or discount language.

export type PostPlayerLink = {
  submissionIds: string[]
  tournamentId: string
  style: string
  kind: 'post' | 'reel' | 'story' | 'rollcall'
  /** The countdown number the graphic was made with (Countdown looks), or null. */
  days: number | null
}

export type ClearedPlayer = {
  id: string
  tournamentId: string
  event: { name: string; start: string; end: string; dates: string; location: string; daysOut: number | null }
  playerName: string
  jersey: string
  position: string
  club: string
  team: string
  /** The team's division at this event ("Boys U14 A"), '' when unknown. */
  division: string
  gender: 'boys' | 'girls' | ''
  token: string
  okAt: string
  instagram: string
  clubInstagram: string
  clubFacebook: string
  /** Every post this player is in (one entry per compose: IG + FB, feed + Story count
   *  once), oldest first. `platforms`/`permalink` feed the card's usage log. */
  /** Linked siblings at this event (lib/siblings), this player included, in card order. */
  siblings?: { ids: string[]; names: string[]; rel: string; title: string }
  /** Unlinked players with the same last name and club at this event. */
  maybeSiblings?: string[]
  posts: { postId: string; status: string; kind: string; style: string; scheduledFor: string; platforms?: string[]; story?: boolean; permalink?: string }[]
}

/** Instagram usernames: no @, valid characters, no repeats, at most `max`. */
export function cleanHandles(v: unknown, max = 20): string[] {
  const out: string[] = []
  for (const x of Array.isArray(v) ? v : []) {
    const u = String(x || '').trim().replace(/^@/, '')
    if (/^[A-Za-z0-9._]{1,30}$/.test(u) && !out.some(o => o.toLowerCase() === u.toLowerCase())) out.push(u)
  }
  return out.slice(0, max)
}
/** For the Collab invite: at most 3 (Instagram's limit). */
export const cleanCollaborators = (v: unknown): string[] => cleanHandles(v, 3)

export const firstOf = (full: string) => String(full || '').trim().split(/\s+/)[0] || 'Player'

/** "Lax Mafia — Junior Mafia 2035" without saying the club twice. */
export function teamLabel(p: Pick<ClearedPlayer, 'club' | 'team'>): string {
  const club = p.club.trim(), team = p.team.trim()
  if (!team) return club
  if (!club || team.toLowerCase().includes(club.toLowerCase())) return team
  return `${club} — ${team}`
}

/** Base look of a style id ("countdown-photo" → "countdown"). */
export const baseLook = (style: string) => style.replace(/(-to)?-photo$/, '')

// Which look to lead with: Bo's favorites (lib/socialPosts FAVORITE_STYLES), all photo
// looks. The last week before an event is Countdown's; earlier it's Committed. A batch
// rotates through the rest so a run of posts doesn't all look the same.
const NEAR = ['countdown-photo', 'rookie', 'main-event', 'committed-photo', 'draft-photo', 'cover', 'scout']
const FAR = ['committed-photo', 'rookie', 'draft-photo', 'main-event', 'cover', 'scout']
export function lookFor(daysOut: number | null, i = 0): string {
  const list = daysOut != null && daysOut <= 7 ? NEAR : FAR
  return list[((i % list.length) + list.length) % list.length]
}

/** Days from a local day key (YYYY-MM-DD) to the event's first day. */
export function daysUntil(dayKey: string, eventStart: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventStart)
  if (!a || !b) return null
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000)
}

/** #MonsterMashLaxClash from "Monster Mash Lax Clash". */
export function eventTag(name: string): string {
  const t = name.replace(/\b20\d\d\b/g, '').replace(/['’]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
  return t ? `#${t}` : ''
}

/** A built-in track that suits the event (lib/reelSongs ids). */
export function songFor(eventName: string): string {
  const n = eventName.toLowerCase()
  if (/monster|halloween|spooky/.test(n)) return 'spooky-stomp'
  if (/jingle|holiday|christmas|winter/.test(n)) return 'holiday-rush'
  return 'trap-hype'
}

function daysLine(days: number | null): string {
  if (days == null || days < 0) return ''
  if (days === 0) return 'Game day.'
  if (days === 1) return 'Tomorrow.'
  return `${days} days out.`
}

/** "sunshineeventsgroup.com" from whatever the website field holds. */
export const bareSite = (site: string) => String(site || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

/** The caption a player post starts with. Staff edit it in Compose before saving. */
export function playerCaption(p: ClearedPlayer, style: string, days: number | null, site: string): string {
  const F = firstOf(p.playerName), E = p.event.name || 'the tournament'
  const hook: Record<string, string> = {
    committed: `${F} is committed to ${E}.`,
    premiere: `Now showing: ${F}, starring at ${E}.`,
    draft: `With the next pick, the field selects ${F}.`,
    countdown: `${F} is ready for ${E}.`,
    cover: `On the cover: ${F}.`,
    rookie: `Rookie card: ${F}.`,
    scout: `Scouting report: ${F}. Cleared to play.`,
    'main-event': `${F} vs The Field.`,
    jersey: `Name on the back: ${F}.`,
  }
  const look = baseLook(style)
  const sib = look === 'siblings' && p.siblings ? siblingLine(p.siblings, E) : ''
  const first = sib || hook[look] || `${F} is ready for ${E}.`
  const who = [p.jersey ? `#${p.jersey}` : '', teamLabel(p)].filter(Boolean).join(' · ')
  // Name the event once: on this line only when the opening line didn't.
  const where = [first.includes(E) ? '' : E, p.event.dates, p.event.location].filter(Boolean).join(' · ')
  const when = [look === 'countdown' ? daysLine(days) : '', where].filter(Boolean).join(' ')
  const tags = [p.instagram, p.clubInstagram].filter(Boolean).join(' ')
  const hashtags = [eventTag(E), '#lacrosse', '#ImWhistleReady'].filter(Boolean).join(' ')
  return [first, who, when, site ? `Info: ${bareSite(site)}` : '', '', tags, hashtags].filter((l, i) => l || i === 4).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Roll Call carousel caption: every cleared player at one event. */
export function rollCallCaption(list: ClearedPlayer[], site: string): string {
  const e = list[0]?.event
  const E = e?.name || 'the tournament'
  const names = list.map(p => `${firstOf(p.playerName)}${p.jersey ? ` #${p.jersey}` : ''} · ${teamLabel(p)}`)
  const tags = Array.from(new Set(list.flatMap(p => [p.instagram, p.clubInstagram]).filter(Boolean))).slice(0, 20).join(' ')
  return [`Roll call for ${E}. Swipe to meet who's on the field.`, '', ...names, '', `${E}${e?.dates ? ` · ${e.dates}` : ''}${e?.location ? ` · ${e.location}` : ''}`, site ? `Info: ${bareSite(site)}` : '', '', [tags, [eventTag(E), '#lacrosse'].filter(Boolean).join(' ')].filter(Boolean).join('\n')].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** A Squad Reel's handles. Collab takes only 3, so the club most of the players share
 *  goes first (one invite reaches every family that follows it), then the families;
 *  everyone left over is tagged in the Reel instead (up to 20). */
export function squadHandles(list: Pick<ClearedPlayer, 'instagram' | 'clubInstagram'>[]): { collab: string[]; tags: string[] } {
  const count = new Map<string, number>()
  for (const p of list) if (p.clubInstagram) count.set(p.clubInstagram.toLowerCase(), (count.get(p.clubInstagram.toLowerCase()) || 0) + 1)
  const clubs = Array.from(new Set(list.map(p => p.clubInstagram).filter(Boolean))).sort((a, b) => (count.get(b.toLowerCase()) || 0) - (count.get(a.toLowerCase()) || 0))
  const order = cleanHandles([...clubs, ...list.map(p => p.instagram)], 40)
  return { collab: order.slice(0, 3), tags: order.slice(3, 23) }
}

/** Squad Reel caption: 2–4 players at one event. */
/** "Finn & Jack: brothers, both ready for Monster Mash." for the Siblings look. */
export function siblingLine(s: NonNullable<ClearedPlayer['siblings']>, E: string): string {
  const n = s.names
  const who = n.length === 2 ? n.join(' & ') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`
  return `${who}: ${s.title === 'SIBLINGS' ? 'siblings' : s.title.toLowerCase()}, ${n.length === 2 ? 'both' : 'all'} ready for ${E}.`
}

export function squadCaption(list: ClearedPlayer[], site: string): string {
  const e = list[0]?.event
  const E = e?.name || 'the tournament'
  const clubs = Array.from(new Set(list.map(p => p.club.trim()).filter(Boolean)))
  // A squad that is exactly one set of siblings opens with them as siblings.
  const sibs = list[0]?.siblings
  const allSibs = !!sibs && sibs.ids.length === list.length && list.every(p => sibs.ids.includes(p.id))
  const first = allSibs ? siblingLine({ ...sibs!, names: list.map(p => firstOf(p.playerName)) }, E) : clubs.length === 1 ? `${clubs[0]} is ready for ${E}.` : `Ready for ${E}.`
  const names = list.map(p => `${firstOf(p.playerName)}${p.jersey ? ` #${p.jersey}` : ''} · ${teamLabel(p)}`)
  const where = [e?.dates, e?.location].filter(Boolean).join(' · ')
  const tags = Array.from(new Set(list.flatMap(p => [p.instagram, p.clubInstagram]).filter(Boolean))).join(' ')
  const hashtags = [eventTag(E), '#lacrosse', '#ImWhistleReady'].filter(Boolean).join(' ')
  return [first, '', ...names, '', where, site ? `Info: ${bareSite(site)}` : '', '', tags, hashtags].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Collab invites for one player's post: the family's account, then the club's. */
export function collabFor(p: Pick<ClearedPlayer, 'instagram' | 'clubInstagram'>): string[] {
  return cleanCollaborators([p.instagram, p.clubInstagram])
}
