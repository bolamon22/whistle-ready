// The player card: a keepsake credential (tournament + club logos, photo, name, team,
// jersey #, position, player ID, two QR codes, org branding) rendered to a PNG with
// Satori (next/og). Parents save it to their phone from /pass/<token>; staff print the
// same image on the badge sheet; the form shows it live while they type.
//
// LAYOUT (redesigned Sep 18 2026, Bo's brief):
//   · the org's code moved to the FAR RIGHT of the header as a white stamp
//   · the header's WORDS stack in one left-aligned column beside the event mark
//   · the photo took the space that freed up, 300x300 -> 368x368
// Taking the org code out of the bottom row is what paid for it: the old card spent
// 270px on two codes side by side plus a separate 40px ID row. One code now shares a
// 258px strip with the player ID, and that code is BIGGER than either of the old pair.
//
// EVERY SECTION HAS A FIXED HEIGHT and they sum to exactly 1140 (210+424+152+258+96).
// The old card leaned on `marginTop: auto` to absorb the difference, which is how a
// 100px hole opens under the codes the moment a section is resized. Nothing here may
// use a border on the card body for the same reason — see `edgeBand`.
//
// Satori rules that shape this file: every element with more than one child needs
// `display: 'flex'`, text must sit inside an element, images need width + height,
// `lineClamp` only clamps inside `display: 'block'` text boxes, and `objectPosition`
// is IGNORED (measured Sep 18 2026 — a top-biased crop is not available here, which is
// why the photo is never cropped at all; see PhotoStage).
//
// Themes (CardTheme) change colors, textures and frames only — the layout and every
// height budget are shared, so a theme can never push sections into each other.
import type { CSSProperties } from 'react'

export type PassCardData = {
  code: string                 // human-readable player ID, e.g. "K7M-3PX"
  playerName: string
  clubName: string
  teamName: string             // team without the club prefix, may be ''
  division: string
  jersey: string
  position: string             // "Attack", "Goalie"… may be ''
  photoUrl: string             // '' when the parent skipped the photo
  clubLogoUrl: string
  tournamentName: string
  tournamentLogoUrl: string
  tournamentDates: string      // already formatted, may be ''
  location: string
  orgName: string
  orgLogoUrl: string
  orgSite: string              // org's own domain, e.g. "sunshineeventsgroup.com", may be ''
  signedOn: string             // formatted date the waiver was signed
  qrDataUrl: string            // PNG data URL of the player's QR code
  qrLabel: string              // what it opens: "Highlight reel", "Instagram", "My player card"…
  qr2DataUrl: string           // the event / organization QR code (tournament page, org Instagram…)
  qr2Label: string             // "Event info", "Follow us on Instagram"…
}

export const PASS_W = 720
export const PASS_H = 1140

// Section budgets. Exported so a test can assert they still sum to PASS_H.
export const BUDGET = { header: 210, photo: 424, name: 152, scan: 258, footer: 96 } as const

// The same component renders two ways: 'satori' → the PNG (next/og), 'dom' → the live preview
// in the browser while the family fills in the form. The only differences are how text is
// clamped and which font stack is named.
export type RenderMode = 'satori' | 'dom'
const clamp = (mode: RenderMode, lines: number): CSSProperties =>
  mode === 'dom'
    ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }
    : ({ display: 'block', lineClamp: lines } as any)

// Same palette + hash as the form's initials badge, so the pass matches what the parent saw.
const BADGE_HEX = ['#0d9488', '#2563eb', '#4f46e5', '#7c3aed', '#e11d48', '#f97316', '#059669', '#334155']
export function initials(name: string) { const w = name.trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?' }
export function badgeHex(name: string) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return BADGE_HEX[h % BADGE_HEX.length] }

// ── themes ───────────────────────────────────────────────────────────────────
export type CardTheme = 'classic' | 'brushed' | 'gold' | 'frost'
export const CARD_THEMES: { id: CardTheme; label: string; blurb: string }[] = [
  { id: 'classic', label: 'Classic', blurb: 'Clean white card, navy header and footer, teal accents.' },
  { id: 'brushed', label: 'Brushed Steel', blurb: 'Silver brushed-metal body, navy header, cyan accents, security edge print down both sides.' },
  { id: 'gold', label: 'Gold Edition', blurb: 'Ivory card in a gold frame, bold black type, gold logo tiles.' },
  { id: 'frost', label: 'Frost', blurb: 'Frosted glass: soft white, cool glow, light and modern.' },
]

const svg = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s.replace(/\s+/g, ' ').trim())}")`
// Textures as tiny repeating SVG tiles (Satori and browsers both draw them).
const TEX = {
  brushed: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='7'><rect width='120' height='7' fill='#e4e7ec'/><path d='M0 1.5h120' stroke='#f2f4f7' stroke-width='1'/><path d='M0 3.5h120' stroke='#d9dde3' stroke-width='1'/><path d='M0 5.5h120' stroke='#eceef2' stroke-width='1'/></svg>`),
  linen: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='#f4eddb'/><path d='M0 4h8' stroke='#ede4cc' stroke-width='1'/><path d='M4 0v8' stroke='#f9f4e6' stroke-width='1'/></svg>`),
}

type Tokens = {
  body: CSSProperties; bodyTexture?: string; textureSize?: string
  text: string; muted: string; divider: string
  headerBg: CSSProperties; headerText: string; headerSub: string; eyebrow: string
  accent: string          // position + jersey number
  logoTile: CSSProperties
  qrTile?: CSSProperties
  waiverBorder: string; waiverBg: string; waiverText: string
  footerBg: CSSProperties; footerText: string; footerSub: string
  edge?: { bg: string; text: string }   // micro-text security stripes down both sides
  edgeBand?: CSSProperties              // decorative outer band, drawn as an OVERLAY
  frame?: CSSProperties                 // hairline inside the band
  nameWeight?: number
}

const NAVY = '#0b1220', TEAL = '#0d9488', TEAL_LIGHT = '#5eead4', CYAN = '#22d3ee'
const S900 = '#0f172a', S500 = '#64748b', S400 = '#94a3b8', S200 = '#e2e8f0', S100 = '#f1f5f9'
const GOLD = '#d4a72c'

const THEMES: Record<CardTheme, Tokens> = {
  classic: {
    body: { background: '#fff' }, text: S900, muted: S500, divider: S100,
    headerBg: { background: NAVY }, headerText: '#fff', headerSub: '#cbd5e1', eyebrow: TEAL_LIGHT,
    accent: TEAL,
    logoTile: { background: '#fff', border: `2px solid ${S200}` },
    waiverBorder: '#a7f3d0', waiverBg: '#ecfdf5', waiverText: '#047857',
    footerBg: { background: NAVY }, footerText: '#fff', footerSub: S400,
  },
  brushed: {
    body: { background: '#e6e9ee' }, bodyTexture: TEX.brushed, text: '#0b1e3a', muted: '#4b5b74', divider: '#c9d0d9',
    headerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, headerText: '#fff', headerSub: '#c7d5e8', eyebrow: CYAN,
    accent: '#0e7c86',
    logoTile: { background: '#fff', border: `2px solid #b9c2cf`, boxShadow: '0 4px 14px rgba(11,30,58,0.18)' },
    qrTile: { background: '#fff', border: '2px solid #b9c2cf', boxShadow: '0 6px 18px rgba(11,30,58,0.22)' },
    waiverBorder: '#a7f3d0', waiverBg: '#ecfdf5', waiverText: '#047857',
    footerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, footerText: '#fff', footerSub: '#93a8c4',
    edge: { bg: '#d3d8df', text: '#7d8a9c' },
  },
  gold: {
    body: { background: '#f4eddb' }, bodyTexture: TEX.linen, textureSize: '8px 8px',
    text: '#111111', muted: '#6b5e3a', divider: '#d9cfae',
    // The header stays dark so the type reads against it; the ivory body and gold band
    // are what carry this theme, not a light header.
    headerBg: { background: '#1a1408' }, headerText: '#f8f3e4', headerSub: '#c9bb93', eyebrow: GOLD,
    accent: '#8a6d12',
    logoTile: { background: '#fff', border: `3px solid ${GOLD}` },
    qrTile: { background: '#fff', border: `2px solid ${GOLD}`, boxShadow: '0 4px 14px rgba(80,60,10,0.18)' },
    waiverBorder: GOLD, waiverBg: '#efe6c6', waiverText: '#5a4a10',
    footerBg: { background: '#1a1408' }, footerText: '#f8f3e4', footerSub: '#c9bb93',
    // A real `border` on the body would shrink the content box and break the budgets,
    // so the gold edge is painted as an overlay instead.
    edgeBand: { border: `12px solid #c9a227` },
    frame: { border: `3px solid #f1dc9a`, borderRadius: 14 },
  },
  frost: {
    body: { backgroundImage: 'linear-gradient(160deg, #ffffff 0%, #eef3f8 55%, #e3ebf3 100%)' },
    text: '#0f172a', muted: '#64748b', divider: '#d8e0ea',
    headerBg: { backgroundImage: 'linear-gradient(160deg, #123247 0%, #0b1b28 100%)' }, headerText: '#ffffff', headerSub: '#bcd6e4', eyebrow: CYAN,
    accent: '#0891b2',
    logoTile: { background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15,23,42,0.12)' },
    qrTile: { background: 'rgba(255,255,255,0.9)', border: '1px solid #e2e8f0', boxShadow: '0 0 26px rgba(34,211,238,0.25), 0 10px 24px rgba(15,23,42,0.08)' },
    waiverBorder: '#bae6fd', waiverBg: '#f0f9ff', waiverText: '#0369a1',
    footerBg: { backgroundImage: 'linear-gradient(160deg, #123247 0%, #0b1b28 100%)' }, footerText: '#ffffff', footerSub: '#9fc0d2',
    nameWeight: 700,
  },
}

function Mark({ name, url, size, radius, tile }: { name: string; url: string; size: number; radius: number; tile: CSSProperties }) {
  if (url) {
    const pad = Math.round(size * 0.08)
    return (
      <div style={{ display: 'flex', boxSizing: 'border-box', width: size, height: size, borderRadius: radius, padding: pad, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...tile }}>
        <img src={url} width={size - pad * 2 - 4} height={size - pad * 2 - 4} style={{ objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: badgeHex(name), color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 800, letterSpacing: 1 }}>
      {initials(name)}
    </div>
  )
}

/** Micro-text "security print" running down one edge, like a real credential. */
function EdgeStripe({ side, text, color, bg }: { side: 'left' | 'right'; text: string; color: string; bg: string }) {
  const W = 18
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, [side]: 0, width: W, height: PASS_H, background: bg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', position: 'absolute', left: (W - PASS_H) / 2, top: (PASS_H - W) / 2, width: PASS_H, height: W, transform: `rotate(${side === 'left' ? -90 : 90}deg)`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontSize: 8, fontWeight: 700, letterSpacing: 2, color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</div>
      </div>
    </div>
  )
}

/**
 * The org's own code, pinned to the far right of the header.
 *
 * ALWAYS a white tile, whatever the theme. A QR needs a quiet zone to scan and the
 * header is dark in all four themes, so a themed tile would cost either the contrast
 * or the scan.
 *
 * SIZE IS THE TRADE. In the old bottom row this code was 196px, about 15mm printed on a
 * CR80 card; up here it is 110px, about 8.1mm. Fine on a phone and fine for a short URL
 * in good light, but it is the one thing moving it to the corner actually costs. The
 * player's own code took the space it gave up — see ScanStrip.
 */
function HeaderQR({ src, label, mode }: { src: string; label: string; mode: RenderMode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 130, borderRadius: 14, background: '#fff', padding: 10, flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.28)' }}>
      {src
        ? <img src={src} width={110} height={110} style={{ borderRadius: 4 }} />
        : <div style={{ display: 'flex', width: 110, height: 110, borderRadius: 4, background: S100 }} />}
      {label ? <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: S500, marginTop: 6, textTransform: 'uppercase', textAlign: 'center', width: 110, ...clamp(mode, 1) }}>{label}</div> : null}
    </div>
  )
}

/**
 * The header: mark on the left, the WORDS stacked beside it, the org's code hard right.
 *
 * Bo's correction to the first pass (Sep 18 2026): stacking the mark ON TOP of the name
 * and centring the pile read as a poster, not a credential. What he wanted stacked was
 * the type — eyebrow, event name, dates — as one left-aligned column beside the mark,
 * which is how the card already read, with the code moved out to the right edge.
 *
 * The event name gets 386px of the 660 usable and steps its own size down to match, so
 * a name the length of "Monster Mash Lax Clash" stays on ONE line instead of breaking
 * across two, and a genuinely long one wraps to two rather than shoving the code off.
 *
 * The steps are deliberately conservative because THE TWO RENDERS DO NOT SHARE A FONT.
 * The PNG is real Inter; the browser preview falls back to the system stack, because
 * the app never loads Inter (checked Sep 18 2026 — no next/font, no @font-face, nothing
 * in globals.css). A system face is wider, so a size that only just fits in Inter wraps
 * in the preview and the family sees a different card from the one that prints. Sized
 * for the wider face, both agree.
 */
function EventHeader({ p, T, mode }: { p: PassCardData; T: Tokens; mode: RenderMode }) {
  const title = p.tournamentName || p.orgName
  const size = title.length > 30 ? 24 : title.length > 18 ? 27 : 34
  const sub = [p.tournamentDates, p.location].filter(Boolean).join('  ·  ')
  return (
    <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 18, width: PASS_W, height: BUDGET.header, flexShrink: 0, padding: '0 30px', overflow: 'hidden', ...T.headerBg }}>
      <Mark name={title} url={p.tournamentLogoUrl} size={108} radius={19} tile={{ background: '#fff', border: `2px solid ${S200}` }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: 15, fontWeight: 800, letterSpacing: 5, color: T.eyebrow, textTransform: 'uppercase' }}>Player card</div>
        <div style={{ fontSize: size, fontWeight: 800, color: T.headerText, lineHeight: 1.12, marginTop: 7, ...clamp(mode, 2) }}>{title}</div>
        {sub ? <div style={{ fontSize: 18, color: T.headerSub, marginTop: 8, ...clamp(mode, 1) }}>{sub}</div> : null}
      </div>
      <HeaderQR src={p.qr2DataUrl} label={p.qr2Label} mode={mode} />
    </div>
  )
}

/**
 * The portrait — NEVER cropped.
 *
 * Filling the frame crops, and most uploads are phone photos held upright: centre-
 * cropping a 900x1600 photo into a square keeps 56% of its height and the face is often
 * above that. Satori ignores `objectPosition` (measured Sep 18 2026), so a top-biased
 * crop is not available to us either.
 *
 * So the photo is drawn CONTAINED and the gap around it is filled with a blown-up,
 * blurred, darkened copy of the same photo: the frame is always full, always in the
 * photo's own colours, and nothing is ever cut off. The backdrop is oversized and
 * offset so the blur's soft edge is clipped by the frame instead of showing as a pale
 * border.
 *
 * Framing a badly-composed photo properly needs a crop step at upload time, because the
 * crop has to be baked into the stored image.
 */
function PhotoStage({ p, size }: { p: PassCardData; size: number }) {
  if (!p.photoUrl) {
    return (
      <div style={{ display: 'flex', width: size, height: size, background: badgeHex(p.playerName), color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.34), fontWeight: 800 }}>
        {initials(p.playerName)}
      </div>
    )
  }
  const bleed = 90
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: size, height: size, overflow: 'hidden' }}>
      <img src={p.photoUrl} width={size + bleed} height={size + bleed} style={{ position: 'absolute', left: -bleed / 2, top: -bleed / 2, width: size + bleed, height: size + bleed, objectFit: 'cover', filter: 'blur(30px)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: size, height: size, background: 'rgba(11,18,32,0.44)' }} />
      <img src={p.photoUrl} width={size} height={size} style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, objectFit: 'contain' }} />
    </div>
  )
}

/**
 * One code, the player ID and the waiver line, sharing the row two codes used to fill.
 *
 * THIS is the code that got bigger: 190px, about 14mm printed, up from 196px shared
 * with a second code, and comfortably scannable off paper. The org's code gave up size to reach the
 * header; the player's took it.
 */
function ScanStrip({ p, T, mode }: { p: PassCardData; T: Tokens; mode: RenderMode }) {
  const code = p.qrDataUrl
    ? <img src={p.qrDataUrl} width={190} height={190} style={{ borderRadius: 8 }} />
    : <div style={{ display: 'flex', width: 190, height: 190, borderRadius: 8, background: S100 }} />
  return (
    <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 26, margin: '0 30px', paddingTop: 18, borderTop: `2px solid ${T.divider}`, height: BUDGET.scan, flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        {T.qrTile
          ? <div style={{ display: 'flex', boxSizing: 'border-box', borderRadius: 14, padding: 8, ...T.qrTile }}>{code}</div>
          : <div style={{ display: 'flex' }}>{code}</div>}
        {p.qrLabel ? <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.8, color: T.muted, marginTop: 9, textTransform: 'uppercase', textAlign: 'center', width: 206, ...clamp(mode, 1) }}>{p.qrLabel}</div> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: 14, fontWeight: 800, letterSpacing: 3, color: T.muted, textTransform: 'uppercase' }}>Player ID</div>
        <div style={{ display: 'flex', fontSize: 42, fontWeight: 800, letterSpacing: 2, marginTop: 3 }}>{p.code}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16 }}>
          <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: T.waiverBg, color: T.waiverText, alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>✓</div>
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, color: T.waiverText }}>Waiver on file</div>
          {p.signedOn ? <div style={{ display: 'flex', fontSize: 16, color: T.muted }}>· {p.signedOn}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function PassCard({ p, mode = 'satori', theme = 'classic' }: { p: PassCardData; mode?: RenderMode; theme?: CardTheme }) {
  const T = THEMES[theme] || THEMES.classic
  const teamLine = [p.teamName, p.division].filter(Boolean).join(' · ')
  const font = mode === 'dom' ? 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'Inter'
  const edgeText = [p.orgName, p.tournamentName, 'Player card', 'Waiver on file', p.code].filter(Boolean).join('  ·  ') + '  ·  '
  const texture = (tex?: string): CSSProperties => tex ? { backgroundImage: tex, backgroundRepeat: 'repeat', backgroundSize: T.textureSize || '120px 7px' } : {}
  const PHOTO = 368

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: PASS_W, height: PASS_H, fontFamily: font, color: T.text, boxSizing: 'border-box', lineHeight: 1.2, overflow: 'hidden', ...T.body, ...texture(T.bodyTexture) }}>
      <EventHeader p={p} T={T} mode={mode} />

      {/* Portrait on the left, club on the right */}
      <div style={{ display: 'flex', boxSizing: 'border-box', gap: 24, padding: '28px 30px 0', height: BUDGET.photo, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', position: 'relative', boxSizing: 'border-box', width: PHOTO, height: PHOTO, borderRadius: 26, overflow: 'hidden', flexShrink: 0, border: `4px solid ${T.divider}` }}>
          <PhotoStage p={p} size={PHOTO - 8} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Mark name={p.clubName} url={p.clubLogoUrl} size={150} radius={26} tile={T.logoTile} />
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.12, marginTop: 14, ...clamp(mode, 2) }}>{p.clubName || 'Club'}</div>
          {teamLine && <div style={{ fontSize: 19, color: T.muted, marginTop: 6, lineHeight: 1.25, ...clamp(mode, 3) }}>{teamLine}</div>}
        </div>
      </div>

      {/* Name, position, number */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 20, padding: '0 30px', height: BUDGET.name, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: p.playerName.length > 22 ? 42 : 54, fontWeight: T.nameWeight || 800, lineHeight: 1.08, letterSpacing: -1, ...clamp(mode, 2) }}>{p.playerName}</div>
          {p.position && <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, letterSpacing: 4, color: T.accent, textTransform: 'uppercase', marginTop: 8 }}>{p.position}</div>}
        </div>
        {p.jersey && (
          <div style={{ display: 'flex', alignItems: 'baseline', flexShrink: 0 }}>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: T.accent, marginRight: 4 }}>#</div>
            <div style={{ display: 'flex', fontSize: 86, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{p.jersey}</div>
          </div>
        )}
      </div>

      <ScanStrip p={p} T={T} mode={mode} />

      {/* Footer: the organization's branding */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 16, padding: '0 30px', height: BUDGET.footer, flexShrink: 0, ...T.footerBg }}>
        {p.orgLogoUrl
          ? <div style={{ display: 'flex', boxSizing: 'border-box', width: 122, height: 54, borderRadius: 10, background: '#fff', padding: 7, alignItems: 'center', justifyContent: 'center' }}><img src={p.orgLogoUrl} width={108} height={30} style={{ objectFit: 'contain' }} /></div>
          : null}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 12, fontWeight: 800, letterSpacing: 3, color: T.eyebrow, textTransform: 'uppercase' }}>Presented by</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: T.footerText, marginTop: 2, ...clamp(mode, 1) }}>{p.orgName}</div>
        </div>
        {p.orgSite && <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, color: T.footerSub, flexShrink: 0 }}>{p.orgSite}</div>}
      </div>

      {T.edge && <EdgeStripe side="left" text={edgeText.repeat(4)} color={T.edge.text} bg={T.edge.bg} />}
      {T.edge && <EdgeStripe side="right" text={edgeText.repeat(4)} color={T.edge.text} bg={T.edge.bg} />}
      {T.edgeBand && <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: PASS_W, height: PASS_H, boxSizing: 'border-box', ...T.edgeBand }} />}
      {T.frame && <div style={{ display: 'flex', position: 'absolute', left: 18, top: 18, width: PASS_W - 36, height: PASS_H - 36, boxSizing: 'border-box', ...T.frame }} />}
    </div>
  )
}
