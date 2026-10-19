import type { CSSProperties } from 'react'

// Instagram posts built around a player's card (Bo, Oct 18 2026: "include their
// player in all the pictures and say it's going to be a post similar to this").
// The same four looks as the "Monster Mash Player Post Templates" design canvas:
// Committed (a college-commitment graphic), Now Showing (a movie poster), Draft Day
// and Countdown ("6 days out · Andrew is Whistle Ready"). Rendered by /pass/<token>/post/<style>.png with
// next/og, so this file is Satori-safe: every element with more than one child is
// display:flex, and nothing relies on CSS Satori can't draw.
//
// The words on a post use only the player's FIRST name and team, which is what the
// photo-permission page asks the family to agree to (lib/photoConsent). The card
// itself is the one the family already has.

export const POST_W = 1080
export const POST_H = 1350

// The "· photo" looks (Bo, Oct 18 2026, after seeing the email: "versions that just
// show the image they posted") put the family's own photo full-bleed instead of the card.
// The five "Fall Classic" looks (Bo, Oct 18 2026: "five more ... variety and consistency";
// "add them all ... I'll use them for the Fall Classic too") are photo-first like the
// "· photo" ones and draw the card in the photo's place when there's no photo.
export type PostStyle = 'committed' | 'premiere' | 'draft' | 'countdown' | 'committed-photo' | 'committed-to-photo' | 'draft-photo' | 'countdown-photo'
  | 'cover' | 'rookie' | 'scout' | 'main-event' | 'jersey' | 'siblings'
const ALL_STYLES: { id: PostStyle; label: string }[] = [
  { id: 'committed', label: 'Committed' },
  { id: 'premiere', label: 'Now Showing' },
  { id: 'draft', label: 'Draft Day' },
  { id: 'countdown', label: 'Countdown' },
  { id: 'committed-photo', label: 'Committed · photo' },
  // Same photo look with "COMMITTED TO" and a big event logo up top. Bo kept both: the
  // first is subtler, this one is unmistakable; he picks per send.
  { id: 'committed-to-photo', label: 'Committed To · photo' },
  { id: 'draft-photo', label: 'Draft Day · photo' },
  { id: 'countdown-photo', label: 'Countdown · photo' },
  { id: 'cover', label: 'Magazine Cover' },
  { id: 'rookie', label: 'Rookie Card' },
  { id: 'scout', label: 'Scouting Report' },
  { id: 'main-event', label: 'Main Event' },
  { id: 'jersey', label: 'Name on the Back' },
  // Brothers / Sisters / Brother & Sister (Bo, Oct 18 2026): one card per sibling, all
  // in the same look and naming each other, for players staff link as siblings.
  { id: 'siblings', label: 'Siblings' },
]
// Name on the Back is retired from every picker (Bo, Oct 18 2026: "that one's not very
// good. I'll probably never use it"). It still renders, so emails already sent with it
// keep their pictures.
const RETIRED = new Set<PostStyle>(['jersey'])
/** Only offered for players linked as siblings (see lib/siblings). */
export const SIBLING_STYLE: PostStyle = 'siblings'
/** The looks staff can pick for any player, in the standard order. */
export const POST_STYLES = ALL_STYLES.filter(s => !RETIRED.has(s.id) && s.id !== SIBLING_STYLE)
export const styleLabel = (id: string) => ALL_STYLES.find(s => s.id === id)?.label || id
/** Bo's favorites (Oct 18 2026), offered first on the social scheduler. */
export const FAVORITE_STYLES: PostStyle[] = ['committed-photo', 'draft-photo', 'countdown-photo', 'cover', 'rookie', 'scout', 'main-event']
/** The looks that use the player's photo rather than the card. */
const HERO_LOOKS = new Set<PostStyle>(['cover', 'rookie', 'scout', 'main-event', 'jersey', 'siblings'])
export const usesPhoto = (s: PostStyle) => s.endsWith('-photo') || HERO_LOOKS.has(s)
/** What the Ask dialog starts with ticked. */
export const DEFAULT_STYLES: PostStyle[] = ['committed-photo', 'draft-photo', 'countdown-photo']
export const isPostStyle = (s: string): s is PostStyle => ALL_STYLES.some(p => p.id === s)
/** Valid styles from an array or a comma list, in the standard order. [] when none. */
export function pickStyles(v: unknown): PostStyle[] {
  const want = new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()))
  return POST_STYLES.map(p => p.id).filter(id => want.has(id))
}

export type PostData = {
  cardSrc: string          // data URL of the player's card PNG (720×1140); '' for the photo looks
  photoSrc?: string        // the family's uploaded photo (photo looks)
  clubLogoSrc?: string     // the team's / club's logo, or '' (Bo: "make sure we have the team's logo in there")
  first: string            // first name only
  club: string
  team: string
  division: string
  jersey: string
  position: string
  tournamentName: string
  dates: string            // "Oct 24–25, 2026"
  startShort: string       // "Oct 24", or ''
  year: string             // "2026", or ''
  location: string
  logoSrc: string          // the event's logo, or ''
  orgName: string
  daysOut: number | null   // whole days until the first game day; null when unknown
  /** The photo's pixel size, so it can be cropped from the top (heads stay in). */
  photoW?: number
  photoH?: number
  /** Siblings look: everyone's first name in order, which one this card is, and the title. */
  sibs?: { names: string[]; index: number; title: string }
}

/** Width × height of a PNG, JPEG, GIF or WebP from its bytes; null when unknown. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 }
    if (b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8 }
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) {   // WebP
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
      if (kind === 'VP8 ') return { w: (b[26] | b[27] << 8) & 0x3fff, h: (b[28] | b[29] << 8) & 0x3fff }
      if (kind === 'VP8L') { const n = b[21] | b[22] << 8 | b[23] << 16 | b[24] << 24; return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 } }
      if (kind === 'VP8X') return { w: 1 + (b[24] | b[25] << 8 | b[26] << 16), h: 1 + (b[27] | b[28] << 8 | b[29] << 16) }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {                    // JPEG: find the frame header
      let i = 2
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue }
        const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3]
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b[i + 7] << 8 | b[i + 8], h: b[i + 5] << 8 | b[i + 6] }
        i += 2 + len
      }
    }
  } catch {}
  return null
}

/** "BROTHERS", "SISTERS", "BROTHER & SISTER", "BROTHERS & SISTER"…, or "SIBLINGS" when we can't tell. */
export function siblingTitle(genders: string[], rel = ''): string {
  if (rel === 'brothers') return 'BROTHERS'
  if (rel === 'sisters') return 'SISTERS'
  const b = genders.filter(g => g === 'boys').length, g = genders.filter(x => x === 'girls').length
  if (rel === 'mixed' || (b && g)) return b && g ? `${b > 1 ? 'BROTHERS' : 'BROTHER'} & ${g > 1 ? 'SISTERS' : 'SISTER'}` : 'BROTHER & SISTER'
  if (b === genders.length && b > 1) return 'BROTHERS'
  if (g === genders.length && g > 1) return 'SISTERS'
  return 'SIBLINGS'
}

const CARD_RATIO = 1140 / 720
const ANTON = 'Anton'
const BARLOW = 'Barlow Condensed'
const MONO = 'Courier Prime'

/** A font size that keeps `text` within `maxW` at Anton's rough character width. */
const fit = (text: string, maxW: number, max: number) => Math.min(max, Math.floor(maxW / (Math.max(1, text.length) * 0.5)))
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

// Small "Whistle Ready" mark in a corner of every post (Bo: "maybe it's just the small
// Whistle Ready logo on the bottom corner"), placed where each look has room. Drawn as
// type rather than the logo file, which has its own dark background and fine print.
const MARK_AT: Record<PostStyle, CSSProperties> = {
  committed: { right: 28, bottom: 140 },
  premiere: { right: 28, bottom: 132 },
  draft: { right: 28, top: 28 },
  countdown: { right: 28, top: 16 },
  'committed-photo': { right: 28, top: 24 },
  'committed-to-photo': { right: 28, top: 24 },
  'draft-photo': { right: 28, top: 28 },
  'countdown-photo': { right: 28, bottom: 24 },
  cover: { right: 56, bottom: 40 },
  rookie: { right: 56, bottom: 46 },
  scout: { right: 36, bottom: 34 },
  'main-event': { right: 30, bottom: 26 },
  siblings: { right: 30, bottom: 26 },
  jersey: { left: 450, bottom: 24 },
}

export function PostArt({ style, d, width = POST_W }: { style: PostStyle; d: PostData; width?: number }) {
  const look: PostStyle = usesPhoto(style) && !d.photoSrc ? style.replace(/(-to)?-photo$/, '') as PostStyle : style
  const k = width / POST_W
  const at = Object.fromEntries(Object.entries(MARK_AT[look]).map(([key, v]) => [key, Math.round(Number(v) * k)]))
  return (
    <div style={{ display: 'flex', position: 'relative', width: Math.round(POST_W * k), height: Math.round(POST_H * k) }}>
      <PostBody style={look} d={d} width={width} />
      <div style={{ position: 'absolute', ...at, display: 'flex', alignItems: 'center', background: 'rgba(11,18,32,0.72)', borderRadius: Math.round(999 * k), padding: `${Math.round(7 * k)}px ${Math.round(16 * k)}px`, fontFamily: ANTON, fontSize: Math.round(26 * k), letterSpacing: '0.04em', lineHeight: 1 }}>
        <div style={{ display: 'flex', color: '#ffffff' }}>WHISTLE</div>
        <div style={{ display: 'flex', color: '#2dd4bf', marginLeft: Math.round(7 * k) }}>READY</div>
      </div>
    </div>
  )
}

/** A photo filling a w×h box, cropped from the top instead of the middle. Satori ignores
 *  object-position (it always centers a cover crop), which cut heads off in wide boxes like
 *  Main Event's (Bo, Oct 18 2026). Scales to cover and keeps the top, minus a sliver. */
function topCrop(src: string, w: number, h: number, pw: number, ph: number, u: (n: number) => number, extra: CSSProperties = {}) {
  const scale = Math.max(w / pw, h / ph)
  const dw = pw * scale, dh = ph * scale
  const top = -Math.min(dh - h, (dh - h) * 0.04)
  return (
    <div style={{ display: 'flex', position: 'relative', overflow: 'hidden', width: u(w), height: u(h), ...extra }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={u(dw)} height={u(dh)} alt="" style={{ position: 'absolute', left: u((w - dw) / 2), top: u(top) }} />
    </div>
  )
}

function PostBody({ style, d, width = POST_W }: { style: PostStyle; d: PostData; width?: number }) {
  if (usesPhoto(style) && !d.photoSrc) style = style.replace(/(-to)?-photo$/, '') as PostStyle   // no photo on file: the card version
  const k = width / POST_W
  const u = (n: number) => Math.round(n * k * 10) / 10
  const first = (d.first || 'Player').toUpperCase()
  const club = cut(d.club, 34)
  const team = cut(d.team, 34)
  const where = cut(d.location, 34)
  const event = d.tournamentName || 'the tournament'
  const eventCaps = `${cut(d.tournamentName || 'GAME DAY', 30).toUpperCase()}.`

  const root: CSSProperties = {
    width: u(POST_W), height: u(POST_H), display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', overflow: 'hidden', color: '#ffffff', fontFamily: BARLOW,
  }
  const card = (w: number, extra: CSSProperties = {}) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={d.cardSrc} width={u(w)} height={u(w * CARD_RATIO)} alt=""
      style={{ borderRadius: u(22), boxShadow: `0 ${u(30)}px ${u(80)}px rgba(0,0,0,0.65)`, ...extra }} />
  )
  const logo = (w: number, h: number) => d.logoSrc ? (
    <div style={{ display: 'flex', background: '#ffffff', borderRadius: u(16), padding: `${u(12)}px ${u(18)}px` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.logoSrc} width={u(w)} height={u(h)} alt="" style={{ objectFit: 'contain' }} />
    </div>
  ) : (
    <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(44), lineHeight: 1 }}>{cut(event.toUpperCase(), 26)}</div>
  )
  // The team's logo on a white tile (logos are drawn for light backgrounds). Nothing when there's none.
  const teamLogo = (size: number, extra: CSSProperties = {}) => d.clubLogoSrc ? (
    <div style={{ display: 'flex', background: '#ffffff', borderRadius: u(16), padding: u(10), ...extra }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.clubLogoSrc} width={u(size)} height={u(size)} alt="" style={{ objectFit: 'contain' }} />
    </div>
  ) : null
  // Team logo and event logo side by side ("club × event").
  const lockup = (lw: number, lh: number, extra: CSSProperties = {}) => (
    <div style={{ display: 'flex', alignItems: 'center', ...extra }}>
      {teamLogo(lh, { marginRight: u(16) })}
      {logo(lw, lh)}
    </div>
  )
  const caps = (size: number, color: string, spacing = 0.16, weight = 700): CSSProperties => ({
    fontSize: u(size), fontWeight: weight, letterSpacing: `${spacing}em`, color, display: 'flex',
  })

  // ── the five photo-first looks ─────────────────────────────────────────────
  if (HERO_LOOKS.has(style)) {
    const NAVY = '#13294b', ORANGE = '#f26b2a', CREAM = '#f6ead6', RED = '#b93a26', GOLD = '#f8d27a'
    const heroSrc = d.photoSrc || d.cardSrc
    const hero = (w: number, h: number, extra: CSSProperties = {}) => d.photoSrc && d.photoW && d.photoH
      ? topCrop(d.photoSrc, w, h, d.photoW, d.photoH, u, { background: '#0a1222', ...extra })
      : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={heroSrc} width={u(w)} height={u(h)} alt=""
        style={{ objectFit: d.photoSrc ? 'cover' : 'contain', objectPosition: 'center top', background: '#0a1222', ...extra }} />
    )
    // The event's own logo, no tile (the Fall Classic badge is round).
    const badge = (size: number) => d.logoSrc ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoSrc} width={u(size)} height={u(size)} alt="" style={{ objectFit: 'contain' }} />
    ) : null
    const dateShort = (d.dates || '').replace(/,\s*\d{4}$/, '').toUpperCase()
    const whereCaps = where.toUpperCase()
    const eventCapsPlain = event.toUpperCase()
    const num = d.jersey ? cut(d.jersey, 3) : ''
    const tag = [num ? `#${num}` : '', d.position].filter(Boolean).join(' · ').toUpperCase()
    const row = (k2: string, v: string, size = 26) => (
      <div key={k2} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `${u(2)}px solid #e2e8f0`, padding: `${u(12)}px 0` }}>
        <div style={caps(20, '#64748b', 0.14)}>{k2.toUpperCase()}</div>
        <div style={{ display: 'flex', fontSize: u(size), fontWeight: 700, color: NAVY, maxWidth: u(200), textAlign: 'right' }}>{v}</div>
      </div>
    )

    if (style === 'cover') {
      // Masthead: the event's name on two lines, as big as fits.
      const words = eventCapsPlain.split(/\s+/)
      let best = [eventCapsPlain, '']
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
        if (Math.max(a.length, b.length) < Math.max(best[0].length, best[1].length)) best = [a, b]
      }
      const longest = best[0].length >= best[1].length ? best[0] : best[1]
      const mast = fit(longest, 720, 190)
      return (
        <div style={{ ...root, background: NAVY }}>
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex' }}>{hero(POST_W, POST_H)}</div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(POST_H), display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(19,41,75,0.88) 0%, rgba(19,41,75,0) 28%, rgba(19,41,75,0) 55%, rgba(10,18,34,0.92) 82%, #0a1222 100%)' }} />
          <div style={{ position: 'absolute', left: u(56), top: u(40), width: u(968), display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontFamily: ANTON, fontSize: u(mast), lineHeight: 0.84, color: ORANGE }}>
              <div style={{ display: 'flex' }}>{best[0]}</div>
              {best[1] && <div style={{ display: 'flex' }}>{best[1]}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: u(12) }}>
              {d.year && <div style={caps(26, '#ffffff', 0.22)}>{`ISSUE ${d.year}`}</div>}
              {dateShort && <div style={{ ...caps(26, CREAM, 0.22), marginTop: u(8) }}>{dateShort}</div>}
              <div style={{ display: 'flex', marginTop: u(14) }}>{badge(150)}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: u(40), top: u(490), width: u(340), display: 'flex', flexDirection: 'column', background: 'rgba(10,18,34,0.72)', borderRadius: u(14), padding: `${u(18)}px ${u(16)}px` }}>
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `${u(6)}px solid ${ORANGE}`, paddingLeft: u(16) }}>
              <div style={caps(24, ORANGE, 0.16)}>COVER STORY</div>
              <div style={{ display: 'flex', fontSize: u(34), fontWeight: 700, lineHeight: 1.05 }}>{`One weekend in ${cut(d.location || 'Florida', 26)}`}</div>
            </div>
            {club && (
              <div style={{ display: 'flex', flexDirection: 'column', borderLeft: `${u(6)}px solid ${CREAM}`, paddingLeft: u(16), marginTop: u(22) }}>
                <div style={caps(24, CREAM, 0.16)}>CLUB SPOTLIGHT</div>
                <div style={{ display: 'flex', fontSize: u(34), fontWeight: 700, lineHeight: 1.05 }}>{club}</div>
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', left: u(56), bottom: u(56), width: u(780), display: 'flex', flexDirection: 'column' }}>
            {(tag || club) && <div style={caps(30, CREAM, 0.2)}>{cut([tag, club.toUpperCase()].filter(Boolean).join(' · '), 44)}</div>}
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 760, 170)), lineHeight: 0.95 }}>{first}</div>
          </div>
          <div style={{ position: 'absolute', right: u(56), bottom: u(104), display: 'flex' }}>{teamLogo(110)}</div>
        </div>
      )
    }

    if (style === 'rookie') {
      return (
        <div style={{ ...root, background: CREAM, color: NAVY }}>
          <div style={{ position: 'absolute', left: u(-200), top: u(380), width: u(1480), height: u(520), background: NAVY, transform: 'rotate(-8deg)', display: 'flex' }} />
          <div style={{ display: 'flex', alignItems: 'center', marginTop: u(54) }}>
            {badge(110)}
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: u(20) }}>
              <div style={caps(28, ORANGE, 0.24)}>{cut(eventCapsPlain, 34)}</div>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(96), lineHeight: 0.95 }}>ROOKIE CARD</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: u(40) }}>
            <div style={{ display: 'flex', width: u(470), height: u(690), borderRadius: u(26), padding: u(18), backgroundImage: `linear-gradient(135deg, ${GOLD} 0%, ${ORANGE} 45%, ${RED} 100%)`, transform: 'rotate(-4deg)', boxShadow: `0 ${u(30)}px ${u(70)}px rgba(0,0,0,0.45)` }}>
              <div style={{ display: 'flex', position: 'relative', width: u(434), height: u(654), borderRadius: u(16), overflow: 'hidden', background: '#0a1222' }}>
                {hero(434, 654)}
                {d.year && <div style={{ position: 'absolute', right: u(14), top: u(14), display: 'flex', background: GOLD, color: NAVY, borderRadius: u(999), padding: `${u(6)}px ${u(14)}px`, fontSize: u(22), fontWeight: 800, letterSpacing: '0.1em' }}>{`RC · ${d.year}`}</div>}
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: u(434), background: NAVY, padding: `${u(14)}px ${u(18)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 300, 44)), lineHeight: 1, color: '#ffffff' }}>{first}</div>
                    <div style={caps(20, GOLD, 0.12)}>{cut([club, d.position].filter(Boolean).join(' · ').toUpperCase(), 28)}</div>
                  </div>
                  {num && <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(60), color: ORANGE }}>{num}</div>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', width: u(360), background: '#ffffff', borderRadius: u(20), padding: `${u(26)}px ${u(28)}px`, marginLeft: u(48), boxShadow: `0 ${u(20)}px ${u(50)}px rgba(0,0,0,0.3)`, transform: 'rotate(2deg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: u(10) }}>
                <div style={caps(24, RED, 0.16, 800)}>CARD BACK</div>
                {teamLogo(56)}
              </div>
              {d.position && row('Position', d.position)}
              {club && row('Club', club)}
              {team && team !== club && row('Team', team)}
              {d.division && row('Division', d.division)}
              {d.startShort && row('Debut', `${d.startShort}${d.year ? `, ${d.year}` : ''}`)}
            </div>
          </div>
          <div style={{ position: 'absolute', left: u(56), bottom: u(52), display: 'flex' }}>
            <div style={caps(30, NAVY, 0.18)}>{[dateShort, whereCaps].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      )
    }

    if (style === 'scout') {
      const BROWN = '#7c5a22'
      const field = (k2: string, v: string) => (
        <div key={k2} style={{ display: 'flex', fontFamily: MONO, fontSize: u(28), color: '#1f2937', marginBottom: u(14) }}>
          <div style={{ display: 'flex', color: BROWN, marginRight: u(12) }}>{`${k2}:`}</div>
          <div style={{ display: 'flex', maxWidth: u(300) }}>{v.toUpperCase()}</div>
        </div>
      )
      return (
        <div style={{ ...root, background: NAVY }}>
          <div style={{ position: 'absolute', left: u(70), top: u(50), width: u(260), height: u(80), background: '#e9d6ae', borderRadius: u(10), transform: 'rotate(-1.5deg)', display: 'flex' }} />
          <div style={{ position: 'absolute', left: u(70), top: u(90), width: u(940), height: u(1110), background: '#e9d6ae', borderRadius: u(10), transform: 'rotate(-1.5deg)', boxShadow: `0 ${u(30)}px ${u(80)}px rgba(0,0,0,0.5)`, display: 'flex' }} />
          <div style={{ position: 'absolute', left: u(110), top: u(130), width: u(860), display: 'flex', flexDirection: 'column', transform: 'rotate(-1.5deg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={caps(26, BROWN, 0.22)}>{cut(`${eventCapsPlain}${num ? ` · FILE ${num}` : ''}`, 40)}</div>
                <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(104), lineHeight: 0.95, color: NAVY }}>SCOUTING REPORT</div>
              </div>
              {badge(130)}
            </div>
            <div style={{ display: 'flex', height: u(4), background: NAVY, marginTop: u(18), marginBottom: u(34) }} />
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#ffffff', padding: `${u(16)}px ${u(16)}px ${u(12)}px`, transform: 'rotate(3deg)', boxShadow: `0 ${u(14)}px ${u(30)}px rgba(0,0,0,0.35)` }}>
                {hero(360, 440)}
                <div style={{ display: 'flex', fontFamily: MONO, fontSize: u(26), fontWeight: 700, color: NAVY, marginTop: u(10) }}>{[num ? `#${num}` : '', first].filter(Boolean).join(' ')}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: u(44), paddingTop: u(6) }}>
                {field('PLAYER', d.first || 'Player')}
                {d.position && field('POSITION', d.position)}
                {club && field('CLUB', club)}
                {team && team !== club && field('TEAM', team)}
                {d.division && field('DIVISION', d.division)}
                <div style={{ display: 'flex', marginTop: u(8) }}>{teamLogo(84)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: u(64) }}>
              <div style={{ display: 'flex', flexDirection: 'column', fontFamily: MONO, fontSize: u(28), color: '#1f2937', lineHeight: 1.4 }}>
                <div style={{ display: 'flex' }}>REPORT TO THE FIELD:</div>
                <div style={{ display: 'flex' }}>{[dateShort, whereCaps].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', border: `${u(6)}px solid ${RED}`, color: RED, borderRadius: u(12), padding: `${u(8)}px ${u(22)}px`, fontFamily: ANTON, fontSize: u(64), lineHeight: 1, transform: 'rotate(-9deg)' }}>CLEARED TO PLAY</div>
            </div>
          </div>
        </div>
      )
    }

    if (style === 'siblings') {
      // One card per sibling, all alike: the shared title, everyone's names with this
      // player's lit up, and "1 OF 2" so the set reads as a set.
      const sib = d.sibs && d.sibs.names.length > 1 ? d.sibs : { names: [d.first || 'Player'], index: 0, title: 'SIBLINGS' }
      const names = sib.names.map(n => n.toUpperCase())
      const joined = names.length === 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
      const nameSize = fit(joined, 980, 120)
      return (
        <div style={{ ...root, background: NAVY }}>
          <div style={{ position: 'absolute', left: u(-200), top: u(880), width: u(1500), height: u(170), background: ORANGE, transform: 'rotate(-8deg)', display: 'flex' }} />
          {lockup(240, 80, { marginTop: u(40) })}
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(sib.title, 980, 180)), lineHeight: 0.95, marginTop: u(18), letterSpacing: '0.02em' }}>{sib.title}</div>
          <div style={{ display: 'flex', position: 'relative', marginTop: u(14) }}>
            {hero(700, 690, { borderRadius: u(28), border: `${u(8)}px solid #ffffff`, boxShadow: `0 ${u(30)}px ${u(80)}px rgba(0,0,0,0.6)` })}
            {sib.names.length > 1 && <div style={{ position: 'absolute', right: u(-28), top: u(-24), width: u(150), height: u(150), borderRadius: u(75), background: ORANGE, border: `${u(6)}px solid #ffffff`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(54), lineHeight: 1 }}>{`${sib.index + 1}`}</div>
              <div style={caps(20, '#ffffff', 0.18, 800)}>{`OF ${sib.names.length}`}</div>
            </div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: u(22), fontFamily: ANTON, fontSize: u(nameSize), lineHeight: 1 }}>
            {names.map((n, i) => (
              <div key={i} style={{ display: 'flex' }}>
                {i > 0 && <div style={{ display: 'flex', color: GOLD, margin: i === names.length - 1 ? `0 ${u(18)}px` : `0 ${u(18)}px 0 0` }}>{i === names.length - 1 ? '&' : ','}</div>}
                <div style={{ display: 'flex', color: i === sib.index ? '#ffffff' : 'rgba(255,255,255,0.45)' }}>{n}</div>
              </div>
            ))}
          </div>
          <div style={{ ...caps(26, CREAM, 0.2, 700), marginTop: u(14) }}>{[team ? team.toUpperCase() : club.toUpperCase(), dateShort].filter(Boolean).join('  ·  ')}</div>
        </div>
      )
    }

    if (style === 'main-event') {
      return (
        <div style={{ ...root, background: '#0a0a0a' }}>
          <div style={{ display: 'flex', width: u(POST_W), justifyContent: 'center', background: RED, padding: `${u(18)}px 0` }}>
            <div style={caps(30, '#ffffff', 0.3, 800)}>{[dateShort, whereCaps].filter(Boolean).join('  ·  ') || eventCapsPlain}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: u(24) }}>
            {badge(100)}
            <div style={{ ...caps(Math.min(30, Math.floor(860 / (`THE ${eventCapsPlain} PRESENTS`.length * 0.8))), GOLD, 0.3), marginLeft: u(18) }}>{`THE ${eventCapsPlain} PRESENTS`}</div>
          </div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(200), lineHeight: 0.9, marginTop: u(12) }}>MAIN EVENT</div>
          <div style={{ display: 'flex', position: 'relative', width: u(POST_W), height: u(640), marginTop: u(18) }}>
            {hero(POST_W, 640)}
            <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(640), display: 'flex', backgroundImage: 'linear-gradient(90deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0) 40%, rgba(10,10,10,0) 60%, rgba(10,10,10,0.9) 100%)' }} />
            <div style={{ position: 'absolute', left: u(50), bottom: u(40), display: 'flex', flexDirection: 'column' }}>
              {teamLogo(100, { alignSelf: 'flex-start', marginBottom: u(10) })}
              {club && <div style={{ ...caps(22, GOLD, 0.16), maxWidth: u(560) }}>{`IN THE ${cut(club.toUpperCase(), 22)} CORNER`}</div>}
            </div>
            {tag && <div style={{ position: 'absolute', right: u(50), bottom: u(40), display: 'flex' }}><div style={caps(26, '#cbd5e1', 0.18)}>{tag}</div></div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: u(26) }}>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 440, 120)), lineHeight: 1 }}>{first}</div>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(60), color: RED, margin: `0 ${u(26)}px` }}>VS</div>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(120), lineHeight: 1, color: '#94a3b8' }}>THE FIELD</div>
          </div>
        </div>
      )
    }

    // jersey: the name and number on the back of a jersey
    const JERSEY = '#1e3a6e'
    const big = num || (first[0] || '')
    return (
      <div style={{ ...root, background: '#0a1222' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(50) }}>
          {badge(96)}
          <div style={{ ...caps(Math.min(34, Math.floor(860 / (`SUITED UP FOR THE ${eventCapsPlain}`.length * 0.78))), CREAM, 0.26, 800), marginLeft: u(18) }}>{`SUITED UP FOR THE ${eventCapsPlain}`}</div>
        </div>
        <div style={{ display: 'flex', position: 'relative', width: u(760), height: u(860), marginTop: u(30) }}>
          <div style={{ position: 'absolute', left: 0, top: u(70), width: u(160), height: u(300), background: JERSEY, borderRadius: `${u(30)}px 0 0 ${u(30)}px`, transform: 'skewY(18deg)', display: 'flex' }} />
          <div style={{ position: 'absolute', right: 0, top: u(70), width: u(160), height: u(300), background: JERSEY, borderRadius: `0 ${u(30)}px ${u(30)}px 0`, transform: 'skewY(-18deg)', display: 'flex' }} />
          <div style={{ position: 'absolute', left: u(110), top: u(30), width: u(540), height: u(830), background: JERSEY, borderRadius: `${u(40)}px ${u(40)}px ${u(24)}px ${u(24)}px`, boxShadow: `0 ${u(40)}px ${u(90)}px rgba(0,0,0,0.6)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', width: u(200), height: u(56), background: '#0a1222', borderRadius: `0 0 ${u(100)}px ${u(100)}px` }} />
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 480, 96)), letterSpacing: '0.1em', marginTop: u(40) }}>{first}</div>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(big, 480, 440)), lineHeight: 0.9, color: ORANGE, WebkitTextStroke: `${u(10)}px #ffffff` } as CSSProperties}>{big}</div>
            {club && <div style={{ ...caps(26, 'rgba(255,255,255,0.7)', 0.24), marginTop: u(16) }}>{cut(club.toUpperCase(), 30)}</div>}
          </div>
        </div>
        <div style={{ position: 'absolute', left: u(40), bottom: u(36), display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#ffffff', padding: `${u(12)}px ${u(12)}px ${u(8)}px`, transform: 'rotate(-5deg)', boxShadow: `0 ${u(16)}px ${u(36)}px rgba(0,0,0,0.5)` }}>
          {hero(190, 215)}
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(26), color: NAVY, marginTop: u(6) }}>{tag || first}</div>
        </div>
        <div style={{ position: 'absolute', right: u(40), bottom: u(36), display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {teamLogo(96, { marginBottom: u(12) })}
          {dateShort && <div style={caps(28, '#ffffff', 0.16)}>{dateShort}</div>}
          {whereCaps && <div style={caps(28, '#94a3b8', 0.16)}>{cut(whereCaps, 24)}</div>}
        </div>
      </div>
    )
  }

  if (style === 'committed') {
    const accent = '#9f1d20'
    const lines = [[d.jersey ? `#${d.jersey}` : '', d.position].filter(Boolean).join(' · '), club, team && team !== club ? team : ''].filter(Boolean)
    return (
      <div style={{ ...root, background: '#0a0a0a' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(640), background: accent, display: 'flex' }} />
        <div style={{ position: 'absolute', left: u(-220), top: u(560), width: u(1520), height: u(170), background: '#0a0a0a', transform: 'rotate(-6deg)', display: 'flex' }} />
        <div style={{ ...caps(30, '#ffffff', 0.32), marginTop: u(56) }}>OFFICIAL ANNOUNCEMENT</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(214), lineHeight: 0.95, marginTop: u(6) }}>COMMITTED</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(36) }}>
          {card(400, { transform: 'rotate(-3deg)' })}
          <div style={{ display: 'flex', flexDirection: 'column', width: u(400), marginLeft: u(56) }}>
            {teamLogo(110, { alignSelf: 'flex-start', marginBottom: u(18) })}
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 400, 110)), lineHeight: 1 }}>{first}</div>
            {lines.map((l, i) => <div key={i} style={{ display: 'flex', fontSize: u(30), fontWeight: 600, color: '#e2e8f0', marginTop: u(i ? 2 : 14) }}>{l}</div>)}
            <div style={{ display: 'flex', width: u(90), height: u(5), background: accent, marginTop: u(22) }} />
            <div style={{ ...caps(26, '#94a3b8', 0.2), marginTop: u(20), marginBottom: u(14) }}>COMMITTED TO</div>
            {logo(260, 130)}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: u(POST_W), height: u(120), background: '#111111', borderTop: `${u(4)}px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={caps(32, '#ffffff', 0.14)}>{[d.dates, where].filter(Boolean).join('   /   ').toUpperCase() || event.toUpperCase()}</div>
        </div>
      </div>
    )
  }

  if (style === 'premiere') {
    const gold = '#f5c451'
    const credits = [
      club ? `${club} in association with ${d.orgName || 'the organizers'}` : '',
      `a ${event} film`,
      `starring ${d.first || 'our player'}${d.jersey ? ` #${d.jersey}` : ''}`,
      where ? `filmed on location in ${where}` : '',
      d.dates,
    ].filter(Boolean).join(' · ').toUpperCase()
    return (
      <div style={{ ...root, backgroundColor: '#070b14', backgroundImage: 'radial-gradient(circle at 50% 38%, #1c2a44 0%, #070b14 62%)', paddingTop: u(52) }}>
        <div style={caps(26, '#cbd5e1', 0.42, 500)}>{cut(`${(d.orgName || 'We').toUpperCase()} PRESENTS`, 44)}</div>
        <div style={{ ...caps(24, '#94a3b8', 0.3, 500), marginTop: u(10) }}>{cut(`A ${event.toUpperCase()} PRODUCTION`, 48)}</div>
        <div style={{ display: 'flex', marginTop: u(36) }}>{card(340, { boxShadow: `0 0 0 ${u(3)}px ${gold}, 0 ${u(40)}px ${u(120)}px rgba(0,0,0,0.8)` })}</div>
        <div style={{ ...caps(30, gold, 0.5, 500), marginTop: u(40) }}>STARRING</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 940, 150)), lineHeight: 1, letterSpacing: '0.04em', marginTop: u(4) }}>{first}</div>
        <div style={{ display: 'flex', fontSize: u(34), fontStyle: 'italic', fontWeight: 500, color: '#e2e8f0', marginTop: u(12) }}>One weekend. One field. No second takes.</div>
        <div style={{ display: 'flex', marginTop: u(24) }}>
          <div style={caps(34, gold, 0.2)}>PREMIERES ON THE FIELD</div>
          {d.startShort && <div style={{ ...caps(34, '#ffffff', 0.2), marginLeft: u(20) }}>{d.startShort.toUpperCase()}</div>}
        </div>
        {lockup(170, 72, { marginTop: u(24) })}
        <div style={{ position: 'absolute', left: u(70), bottom: u(40), width: u(940), display: 'flex', justifyContent: 'center', textAlign: 'center', fontSize: u(19), lineHeight: 1.45, letterSpacing: '0.08em', color: '#94a3b8' }}>{credits}</div>
      </div>
    )
  }

  if (style === 'draft') {
    const accent = '#14b8a6'
    const rows = [['Position', d.position], ['Club', club], ['Team', team && team !== club ? team : ''], ['Division', d.division]].filter(r => r[1])
    return (
      <div style={{ ...root, alignItems: 'flex-start', background: '#0b1f3a' }}>
        {d.jersey && <div style={{ position: 'absolute', right: u(-30), top: u(140), display: 'flex', fontFamily: ANTON, fontSize: u(700), lineHeight: 0.8, color: '#0e2a4d' }}>{cut(d.jersey, 3)}</div>}
        <div style={{ position: 'absolute', left: 0, top: 0, width: u(22), height: u(POST_H), background: accent, display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(64), marginLeft: u(84) }}>
          <div style={{ ...caps(26, '#0b1f3a', 0.18, 800), background: accent, borderRadius: u(999), padding: `${u(8)}px ${u(20)}px` }}>THE PICK IS IN</div>
          <div style={{ ...caps(26, '#94a3b8', 0.18, 600), marginLeft: u(18) }}>ROUND 1</div>
        </div>
        <div style={{ display: 'flex', width: u(900), fontSize: u(44), fontWeight: 600, color: '#cbd5e1', lineHeight: 1.12, marginTop: u(26), marginLeft: u(84) }}>
          {`With the next pick in the ${d.year ? `${d.year} ` : ''}${event}, the field selects…`}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: u(40), marginLeft: u(84) }}>
          {card(400)}
          <div style={{ display: 'flex', flexDirection: 'column', width: u(460), marginLeft: u(44), paddingTop: u(6) }}>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 460, 120)), lineHeight: 1, color: accent }}>{first}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(20), borderTop: `${u(2)}px solid #1e3a5f` }}>
              {rows.map(([k2, v]) => (
                <div key={k2} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${u(14)}px 0`, borderBottom: `${u(2)}px solid #1e3a5f` }}>
                  <div style={caps(22, '#94a3b8', 0.16)}>{k2.toUpperCase()}</div>
                  <div style={{ display: 'flex', fontSize: u(28), fontWeight: 700, maxWidth: u(300), textAlign: 'right' }}>{v}</div>
                </div>
              ))}
            </div>
            {lockup(200, 100, { marginTop: u(28) })}
          </div>
        </div>
        <div style={{ position: 'absolute', left: u(84), bottom: u(56), width: u(924), display: 'flex', justifyContent: 'space-between' }}>
          <div style={caps(28, '#cbd5e1', 0.16)}>{(d.dates || where).toUpperCase()}</div>
          <div style={caps(28, accent, 0.16)}>WELCOME TO THE SHOW</div>
        </div>
      </div>
    )
  }

  if (usesPhoto(style) && d.photoSrc) {
    const photo = (w: number, h: number, extra: CSSProperties = {}) => d.photoW && d.photoH
      ? topCrop(d.photoSrc!, w, h, d.photoW, d.photoH, u, extra)
      : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.photoSrc} width={u(w)} height={u(h)} alt="" style={{ objectFit: 'cover', objectPosition: 'center top', ...extra }} />
    )
    const statLine = [d.jersey ? `#${d.jersey}` : '', d.position, club].filter(Boolean).join('  ·  ').toUpperCase()

    if (style === 'committed-photo') {
      const accent = '#9f1d20'
      return (
        <div style={{ ...root, background: '#0a0a0a' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex' }}>{photo(POST_W, 1240)}</div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(1240), display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 40%, rgba(10,10,10,0.9) 68%, #0a0a0a 100%)' }} />
          <div style={{ ...caps(30, '#ffffff', 0.32), marginTop: u(52) }}>OFFICIAL ANNOUNCEMENT</div>
          <div style={{ position: 'absolute', left: u(64), bottom: u(140), width: u(952), display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(200), lineHeight: 0.95 }}>COMMITTED</div>
            <div style={{ display: 'flex', width: u(952), height: u(8), background: accent, marginTop: u(6) }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: u(28) }}>
              <div style={{ display: 'flex', alignItems: 'center', width: u(640) }}>
                {teamLogo(110, { marginRight: u(22) })}
                <div style={{ display: 'flex', flexDirection: 'column', width: u(d.clubLogoSrc ? 488 : 640) }}>
                  <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, d.clubLogoSrc ? 488 : 600, 120)), lineHeight: 1 }}>{first}</div>
                  <div style={{ ...caps(26, '#e2e8f0', 0.12, 600), marginTop: u(10) }}>{cut(statLine, 64)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ ...caps(24, '#94a3b8', 0.2), marginBottom: u(10) }}>COMMITTED TO</div>
                {logo(240, 110)}
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: u(POST_W), height: u(110), background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={caps(32, '#ffffff', 0.14)}>{[d.dates, where].filter(Boolean).join('   /   ').toUpperCase() || event.toUpperCase()}</div>
          </div>
        </div>
      )
    }

    if (style === 'committed-to-photo') {
      const accent = '#9f1d20'
      return (
        <div style={{ ...root, background: '#0a0a0a' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex' }}>{photo(POST_W, 1240)}</div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(1240), display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 34%, rgba(10,10,10,0.88) 58%, #0a0a0a 100%)' }} />
          <div style={{ ...caps(30, '#ffffff', 0.32), marginTop: u(52) }}>OFFICIAL ANNOUNCEMENT</div>
          {/* Reads top to bottom as one sentence: COMMITTED TO [event logo], then who (Bo:
              "put the Monster Mash logo up higher so it looks like they're committing to it"). */}
          <div style={{ position: 'absolute', left: u(64), bottom: u(136), width: u(952), display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(180), lineHeight: 0.95 }}>COMMITTED</div>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(96), lineHeight: 1, color: '#e2e8f0', marginLeft: u(22), marginBottom: u(8) }}>TO</div>
            </div>
            <div style={{ display: 'flex', marginTop: u(18) }}>
              {d.logoSrc ? (
                <div style={{ display: 'flex', background: '#ffffff', borderRadius: u(20), padding: `${u(16)}px ${u(28)}px`, boxShadow: `0 ${u(14)}px ${u(40)}px rgba(0,0,0,0.5)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.logoSrc} width={u(480)} height={u(160)} alt="" style={{ objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(event.toUpperCase(), 952, 110)), lineHeight: 1, color: '#ffffff' }}>{event.toUpperCase()}</div>
              )}
            </div>
            <div style={{ display: 'flex', width: u(952), height: u(6), background: accent, marginTop: u(26) }} />
            <div style={{ display: 'flex', alignItems: 'center', marginTop: u(22) }}>
              {teamLogo(100, { marginRight: u(22) })}
              <div style={{ display: 'flex', flexDirection: 'column', width: u(d.clubLogoSrc ? 810 : 952) }}>
                <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 700, 110)), lineHeight: 1 }}>{first}</div>
                <div style={{ ...caps(26, '#e2e8f0', 0.12, 600), marginTop: u(8) }}>{cut(statLine, 64)}</div>
              </div>
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: u(POST_W), height: u(110), background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={caps(32, '#ffffff', 0.14)}>{[d.dates, where].filter(Boolean).join('   /   ').toUpperCase() || event.toUpperCase()}</div>
          </div>
        </div>
      )
    }

    if (style === 'draft-photo') {
      const accent = '#14b8a6'
      const rows = [['Position', d.position], ['Club', club], ['Team', team && team !== club ? team : ''], ['Division', d.division]].filter(r => r[1])
      return (
        <div style={{ ...root, alignItems: 'flex-start', background: '#0b1f3a' }}>
          <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex' }}>{photo(600, POST_H)}</div>
          <div style={{ position: 'absolute', left: u(480), top: 0, width: u(260), height: u(POST_H), display: 'flex', backgroundImage: 'linear-gradient(90deg, #0b1f3a 0%, rgba(11,31,58,0) 100%)' }} />
          {d.jersey && <div style={{ position: 'absolute', right: u(40), bottom: u(30), display: 'flex', fontFamily: ANTON, fontSize: u(220), lineHeight: 1, color: '#ffffff', textShadow: `0 ${u(6)}px ${u(30)}px rgba(0,0,0,0.6)` }}>{`#${cut(d.jersey, 3)}`}</div>}
          <div style={{ position: 'absolute', left: 0, top: 0, width: u(22), height: u(POST_H), background: accent, display: 'flex' }} />
          <div style={{ display: 'flex', flexDirection: 'column', width: u(470), marginLeft: u(70), marginTop: u(64) }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ ...caps(24, '#0b1f3a', 0.18, 800), background: accent, borderRadius: u(999), padding: `${u(8)}px ${u(18)}px` }}>THE PICK IS IN</div>
              <div style={{ ...caps(24, '#94a3b8', 0.18, 600), marginLeft: u(16) }}>ROUND 1</div>
            </div>
            <div style={{ display: 'flex', fontSize: u(38), fontWeight: 600, color: '#cbd5e1', lineHeight: 1.15, marginTop: u(30) }}>
              {`With the next pick in the ${d.year ? `${d.year} ` : ''}${event}, the field selects…`}
            </div>
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 450, 150)), lineHeight: 1, color: accent, marginTop: u(36) }}>{first}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(24), borderTop: `${u(2)}px solid #1e3a5f` }}>
              {rows.map(([k2, v]) => (
                <div key={k2} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${u(14)}px 0`, borderBottom: `${u(2)}px solid #1e3a5f` }}>
                  <div style={caps(22, '#94a3b8', 0.16)}>{k2.toUpperCase()}</div>
                  <div style={{ display: 'flex', fontSize: u(28), fontWeight: 700, maxWidth: u(290), textAlign: 'right' }}>{v}</div>
                </div>
              ))}
            </div>
            {lockup(200, 100, { marginTop: u(32) })}
          </div>
          <div style={{ position: 'absolute', left: u(70), bottom: u(56), display: 'flex', flexDirection: 'column' }}>
            <div style={caps(26, '#cbd5e1', 0.16)}>{(d.dates || where).toUpperCase()}</div>
            <div style={{ ...caps(26, accent, 0.16), marginTop: u(6) }}>WELCOME TO THE SHOW</div>
          </div>
        </div>
      )
    }

    // countdown-photo
    const hot = '#f97316'
    const n = d.daysOut
    return (
      <div style={{ ...root, background: '#0a0a0a' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex' }}>{photo(POST_W, POST_H)}</div>
        <div style={{ position: 'absolute', left: 0, top: 0, width: u(POST_W), height: u(POST_H), display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 42%, rgba(10,10,10,0.88) 66%, #0a0a0a 100%)' }} />
        <div style={{ display: 'flex', width: u(936), justifyContent: 'space-between', alignItems: 'center', marginTop: u(52) }}>
          {lockup(190, 90)}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={caps(28, '#ffffff', 0.16)}>{(d.dates || '').toUpperCase()}</div>
            <div style={caps(28, '#e2e8f0', 0.16)}>{where.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: u(72), bottom: u(64), width: u(936), display: 'flex', flexDirection: 'column' }}>
          {n != null && n > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(260), lineHeight: 0.85, color: hot }}>{String(n)}</div>
              <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(96), lineHeight: 1, marginLeft: u(24), marginBottom: u(6) }}>{n === 1 ? 'DAY OUT' : 'DAYS OUT'}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(200), lineHeight: 0.95, color: hot }}>GAME DAY</div>
          )}
          <div style={{ display: 'flex', marginTop: u(26) }}>
            <div style={caps(44, '#ffffff', 0.06)}>{first}</div>
            <div style={{ ...caps(44, '#94a3b8', 0.06), marginLeft: u(14) }}>IS READY FOR</div>
          </div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(eventCaps, 936, 130)), lineHeight: 1, color: hot, marginTop: u(4) }}>{eventCaps}</div>
        </div>
      </div>
    )
  }

  // countdown (Bo, Oct 18 2026: not "Who's Next?", which read as a challenge; then not "is Whistle
  // Ready" either: name the tournament, and let the small Whistle Ready mark carry the brand)
  const hot = '#f97316'
  const n = d.daysOut
  return (
    <div style={{ ...root, background: '#0a0a0a' }}>
      <div style={{ display: 'flex', width: u(936), justifyContent: 'space-between', alignItems: 'center', marginTop: u(70) }}>
        {lockup(190, 90)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={caps(28, '#ffffff', 0.16)}>{(d.dates || '').toUpperCase()}</div>
          <div style={caps(28, '#94a3b8', 0.16)}>{where.toUpperCase()}</div>
        </div>
      </div>
      {n != null && n > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', marginTop: u(26) }}>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(280), lineHeight: 0.9, color: hot }}>{String(n)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: u(36), fontFamily: ANTON, fontSize: u(104), lineHeight: 0.95 }}>
            <div style={{ display: 'flex' }}>{n === 1 ? 'DAY' : 'DAYS'}</div>
            <div style={{ display: 'flex', color: '#94a3b8' }}>OUT</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(230), lineHeight: 0.95, color: hot, marginTop: u(36) }}>GAME DAY</div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: u(34) }}>
        <div style={{ display: 'flex' }}>{card(360, { boxShadow: `0 0 0 ${u(4)}px ${hot}, 0 ${u(30)}px ${u(80)}px rgba(0,0,0,0.7)` })}</div>
      </div>
      <div style={{ display: 'flex', marginTop: u(34) }}>
        <div style={caps(40, '#ffffff', 0.06)}>{first}</div>
        <div style={{ ...caps(40, '#94a3b8', 0.06), marginLeft: u(12) }}>IS READY FOR</div>
      </div>
      <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(eventCaps, 900, 104)), lineHeight: 1, color: hot, marginTop: u(6) }}>{eventCaps}</div>
    </div>
  )
}

// ── fonts ─────────────────────────────────────────────────────────────────────
// Anton (display) and Barlow Condensed, from Google Fonts as TTF (the old-browser
// user agent makes the CSS hand back TTF, which Satori reads), cached per instance.

type SatoriFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700 | 800; style: 'normal' | 'italic' }
let postFonts: Promise<SatoriFont[]> | null = null
const UA = 'Mozilla/5.0 (BB10; Touch) AppleWebKit/537.10+ (KHTML, like Gecko) Version/10.0.9.2372 Mobile Safari/537.10+'

async function googleFont(family: string, name: string, weights: SatoriFont['weight'][], style: SatoriFont['style'] = 'normal'): Promise<SatoriFont[]> {
  const spec = style === 'italic' ? `ital,wght@${weights.map(w => `1,${w}`).join(';')}` : `wght@${weights.join(';')}`
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:${spec}`, { headers: { 'User-Agent': UA }, cache: 'no-store' }).then(r => r.text())
  const out: SatoriFont[] = []
  for (const weight of weights) {
    const block = css.split('}').find(b => new RegExp(`font-weight:\\s*${weight}\\b`).test(b)) || ''
    const url = /url\((https:[^)]+\.(?:ttf|otf|woff))\)/.exec(block)?.[1]
    if (!url) continue
    out.push({ name, data: await fetch(url, { cache: 'no-store' }).then(r => r.arrayBuffer()), weight, style })
  }
  return out
}

export function loadPostFonts(): Promise<SatoriFont[]> {
  if (!postFonts) {
    postFonts = (async () => {
      const sets = await Promise.all([
        googleFont('Anton', ANTON, [400]),
        googleFont('Barlow+Condensed', BARLOW, [500, 600, 700, 800]),
        googleFont('Barlow+Condensed', BARLOW, [500], 'italic'),
        googleFont('Courier+Prime', MONO, [400, 700]).catch(() => [] as SatoriFont[]),
      ])
      const all = sets.flat()
      if (!all.some(f => f.name === ANTON)) throw new Error('no fonts')
      return all
    })().catch(e => { postFonts = null; throw e })
  }
  return postFonts
}

// ── the facts a post needs that the pass doesn't format ──────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** From the tournament's start date (YYYY-MM-DD…): "Oct 24", "2026", and days until it in Florida time. */
export function startFacts(startDate: string, now = new Date()): { startShort: string; year: string; daysOut: number | null } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startDate || ''))
  if (!m) return { startShort: '', year: '', daysOut: null }
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now) // YYYY-MM-DD
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today)
  const daysOut = t ? Math.round((Date.UTC(y, mo - 1, da) - Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]))) / 86_400_000) : null
  return { startShort: `${MONTHS[mo - 1]} ${da}`, year: String(y), daysOut }
}
