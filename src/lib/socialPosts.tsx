import type { CSSProperties, ReactNode } from 'react'

// Instagram posts built around a player's card (Bo, Oct 18 2026: "include their
// player in all the pictures and say it's going to be a post similar to this").
// The same four looks as the "Monster Mash Player Post Templates" design canvas:
// Committed (a college-commitment graphic), Now Showing (a movie poster), Draft Day
// and Who's Next (a countdown). Rendered by /pass/<token>/post/<style>.png with
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
export type PostStyle = 'committed' | 'premiere' | 'draft' | 'countdown' | 'committed-photo' | 'draft-photo' | 'countdown-photo'
export const POST_STYLES: { id: PostStyle; label: string }[] = [
  { id: 'committed', label: 'Committed' },
  { id: 'premiere', label: 'Now Showing' },
  { id: 'draft', label: 'Draft Day' },
  { id: 'countdown', label: "Who's Next" },
  { id: 'committed-photo', label: 'Committed · photo' },
  { id: 'draft-photo', label: 'Draft Day · photo' },
  { id: 'countdown-photo', label: "Who's Next · photo" },
]
/** The looks that use the player's photo rather than the card. */
export const usesPhoto = (s: PostStyle) => s.endsWith('-photo')
/** What the Ask dialog starts with ticked. */
export const DEFAULT_STYLES: PostStyle[] = ['committed-photo', 'draft-photo', 'countdown-photo']
export const isPostStyle = (s: string): s is PostStyle => POST_STYLES.some(p => p.id === s)
/** Valid styles from an array or a comma list, in the standard order. [] when none. */
export function pickStyles(v: unknown): PostStyle[] {
  const want = new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()))
  return POST_STYLES.map(p => p.id).filter(id => want.has(id))
}

export type PostData = {
  cardSrc: string          // data URL of the player's card PNG (720×1140); '' for the photo looks
  photoSrc?: string        // the family's uploaded photo (photo looks)
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
}

const CARD_RATIO = 1140 / 720
const ANTON = 'Anton'
const BARLOW = 'Barlow Condensed'

/** A font size that keeps `text` within `maxW` at Anton's rough character width. */
const fit = (text: string, maxW: number, max: number) => Math.min(max, Math.floor(maxW / (Math.max(1, text.length) * 0.5)))
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function PostArt({ style, d, width = POST_W }: { style: PostStyle; d: PostData; width?: number }) {
  if (usesPhoto(style) && !d.photoSrc) style = style.replace('-photo', '') as PostStyle   // no photo on file: the card version
  const k = width / POST_W
  const u = (n: number) => Math.round(n * k * 10) / 10
  const first = (d.first || 'Player').toUpperCase()
  const club = cut(d.club, 34)
  const team = cut(d.team, 34)
  const where = cut(d.location, 34)
  const event = d.tournamentName || 'the tournament'

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
  const caps = (size: number, color: string, spacing = 0.16, weight = 700): CSSProperties => ({
    fontSize: u(size), fontWeight: weight, letterSpacing: `${spacing}em`, color, display: 'flex',
  })

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
        <div style={{ display: 'flex', marginTop: u(36) }}>{card(380, { boxShadow: `0 0 0 ${u(3)}px ${gold}, 0 ${u(40)}px ${u(120)}px rgba(0,0,0,0.8)` })}</div>
        <div style={{ ...caps(30, gold, 0.5, 500), marginTop: u(40) }}>STARRING</div>
        <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 940, 150)), lineHeight: 1, letterSpacing: '0.04em', marginTop: u(4) }}>{first}</div>
        <div style={{ display: 'flex', fontSize: u(34), fontStyle: 'italic', fontWeight: 500, color: '#e2e8f0', marginTop: u(12) }}>One weekend. One field. No second takes.</div>
        <div style={{ display: 'flex', marginTop: u(24) }}>
          <div style={caps(34, gold, 0.2)}>PREMIERES ON THE FIELD</div>
          {d.startShort && <div style={{ ...caps(34, '#ffffff', 0.2), marginLeft: u(20) }}>{d.startShort.toUpperCase()}</div>}
        </div>
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
            <div style={{ display: 'flex', marginTop: u(28) }}>{logo(220, 110)}</div>
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
    const photo = (w: number, h: number, extra: CSSProperties = {}) => (
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
              <div style={{ display: 'flex', flexDirection: 'column', width: u(600) }}>
                <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(fit(first, 600, 120)), lineHeight: 1 }}>{first}</div>
                <div style={{ ...caps(28, '#e2e8f0', 0.12, 600), marginTop: u(10) }}>{cut(statLine, 44)}</div>
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
            <div style={{ display: 'flex', marginTop: u(32) }}>{logo(220, 110)}</div>
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
          {logo(190, 90)}
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
            <div style={{ ...caps(44, '#94a3b8', 0.06), marginLeft: u(14) }}>IS IN.</div>
          </div>
          <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(130), lineHeight: 1, color: hot, marginTop: u(4) }}>WHO&apos;S NEXT?</div>
        </div>
      </div>
    )
  }

  // countdown
  const hot = '#f97316'
  const n = d.daysOut
  const ghost = (rot: string): ReactNode => (
    <div style={{ width: u(200), height: u(316), borderRadius: u(16), background: '#1e293b', opacity: 0.45, transform: `rotate(${rot})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ANTON, fontSize: u(120), color: '#64748b' }}>?</div>
  )
  return (
    <div style={{ ...root, background: '#0a0a0a' }}>
      <div style={{ display: 'flex', width: u(936), justifyContent: 'space-between', alignItems: 'center', marginTop: u(52) }}>
        {logo(190, 90)}
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
        {ghost('-6deg')}
        <div style={{ display: 'flex', margin: `0 ${u(26)}px` }}>{card(340, { boxShadow: `0 0 0 ${u(4)}px ${hot}, 0 ${u(30)}px ${u(80)}px rgba(0,0,0,0.7)` })}</div>
        {ghost('6deg')}
      </div>
      <div style={{ display: 'flex', marginTop: u(34) }}>
        <div style={caps(40, '#ffffff', 0.06)}>{first}</div>
        <div style={{ ...caps(40, '#94a3b8', 0.06), marginLeft: u(12) }}>IS IN.</div>
      </div>
      <div style={{ display: 'flex', fontFamily: ANTON, fontSize: u(104), lineHeight: 1, color: hot, marginTop: u(6) }}>WHO&apos;S NEXT?</div>
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
