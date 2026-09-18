// The player card: a keepsake credential (tournament + club logos, photo, name, team,
// jersey #, position, player ID, two QR codes, org branding) rendered to a PNG with
// Satori (next/og). Parents save it to their phone from /pass/<token>; staff print the
// same image on the badge sheet; the form shows it live while they type.
//
// LAYOUT (redesigned Sep 18 2026, Bo's brief):
//   · the org's code moved to the TOP-RIGHT CORNER as a white stamp
//   · the event logo STACKS over the tournament name — side by side looked bad
//   · the photo took the space that freed up
// Taking the org code out of the bottom row is what paid for the taller header: the old
// card spent 270px on two codes side by side plus a separate 40px ID row; one code now
// shares a 174px strip with the player ID. The photo went 300x300 -> full width x 486.
//
// EVERY SECTION HAS A FIXED HEIGHT and they sum to exactly 1140 (296+486+96+174+88).
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
export const BUDGET = { header: 296, photo: 486, club: 96, scan: 174, footer: 88 } as const

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
  logoTile: CSSProperties
  qrTile?: CSSProperties
  waiverBorder: string; waiverBg: string; waiverText: string
  footerBg: CSSProperties; footerText: string; footerSub: string
  edge?: { bg: string; text: string }   // micro-text security stripes down both sides
  edgeBand?: CSSProperties              // decorative outer band, drawn as an OVERLAY
  frame?: CSSProperties                 // hairline inside the band
  nameWeight?: number
}

const NAVY = '#0b1220', TEAL_LIGHT = '#5eead4', CYAN = '#22d3ee'
const S900 = '#0f172a', S500 = '#64748b', S400 = '#94a3b8', S200 = '#e2e8f0', S100 = '#f1f5f9'
const GOLD = '#d4a72c'

const THEMES: Record<CardTheme, Tokens> = {
  classic: {
    body: { background: '#fff' }, text: S900, muted: S500, divider: S100,
    headerBg: { background: NAVY }, headerText: '#fff', headerSub: '#cbd5e1', eyebrow: TEAL_LIGHT,
    logoTile: { background: '#fff', border: `2px solid ${S200}` },
    waiverBorder: '#a7f3d0', waiverBg: '#ecfdf5', waiverText: '#047857',
    footerBg: { background: NAVY }, footerText: '#fff', footerSub: S400,
  },
  brushed: {
    body: { background: '#e6e9ee' }, bodyTexture: TEX.brushed, text: '#0b1e3a', muted: '#4b5b74', divider: '#c9d0d9',
    headerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, headerText: '#fff', headerSub: '#c7d5e8', eyebrow: CYAN,
    logoTile: { background: '#fff', border: `2px solid #b9c2cf`, boxShadow: '0 4px 14px rgba(11,30,58,0.18)' },
    qrTile: { background: '#fff', border: '2px solid #b9c2cf', boxShadow: '0 6px 18px rgba(11,30,58,0.22)' },
    waiverBorder: '#a7f3d0', waiverBg: '#ecfdf5', waiverText: '#047857',
    footerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, footerText: '#fff', footerSub: '#93a8c4',
    edge: { bg: '#d3d8df', text: '#7d8a9c' },
  },
  gold: {
    body: { background: '#f4eddb' }, bodyTexture: TEX.linen, textureSize: '8px 8px',
    text: '#111111', muted: '#6b5e3a', divider: '#d9cfae',
    // The header stays dark so the stacked lockup reads; the ivory body and gold band
    // are what carry this theme, not a light header.
    headerBg: { background: '#1a1408' }, headerText: '#f8f3e4', headerSub: '#c9bb93', eyebrow: GOLD,
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
 * The corner code — the org's own link, moved out of the bottom row.
 *
 * ALWAYS a white tile, whatever the theme. A QR needs a quiet zone to scan, and the
 * header is dark in three of the four themes, so a themed tile would either kill the
 * contrast or the scan.
 */
function CornerQR({ src, label, mode }: { src: string; label: string; mode: RenderMode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 24, right: 26, width: 140, borderRadius: 16, background: '#fff', padding: 11, alignItems: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.32)' }}>
      {src
        ? <img src={src} width={118} height={118} style={{ borderRadius: 5 }} />
        : <div style={{ display: 'flex', width: 118, height: 118, borderRadius: 5, background: S100 }} />}
      {label ? <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: S500, marginTop: 7, textTransform: 'uppercase', textAlign: 'center', width: 118, ...clamp(mode, 1) }}>{label}</div> : null}
    </div>
  )
}

/**
 * The stacked event lockup: mark on top, name under it, dates under that.
 *
 * Centred on the CARD, not on the space left over beside the corner code. The mark is
 * 118 wide and centred, so it spans x=301..419 and clears the code at x=554; the name
 * sits below the code's bottom edge and gets the full width back instead of being
 * squeezed into a column.
 */
function EventLockup({ p, T, mode }: { p: PassCardData; T: Tokens; mode: RenderMode }) {
  const title = p.tournamentName || p.orgName
  const H = BUDGET.header
  // NO TEXTURE ON THIS HEADER, on purpose. Satori paints a repeating backgroundImage
  // ABOVE the element's own text — measured Sep 18 2026 across all three arrangements
  // (texture on the same div as the text, text in an absolute child, texture in its own
  // absolute layer), and the brushed theme's hex tile came out drawn across the letters
  // of the event name every time. The body textures stay because their contrast is far
  // lower: glyph interiors on the gold and brushed cards vary by stdev 3.65 and 5.12 out
  // of 765, which is invisible. A header tile at 7% white on navy is not.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', boxSizing: 'border-box', alignItems: 'center', width: PASS_W, height: H, flexShrink: 0, padding: '28px 36px 0', position: 'relative', overflow: 'hidden', ...T.headerBg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: PASS_W - 72 }}>
        <Mark name={title} url={p.tournamentLogoUrl} size={118} radius={20} tile={{ background: '#fff', border: `2px solid ${S200}` }} />
        <div style={{ display: 'flex', fontSize: 16, fontWeight: 800, letterSpacing: 5, color: T.eyebrow, textTransform: 'uppercase', marginTop: 14 }}>Player card</div>
        <div style={{ fontSize: title.length > 26 ? 34 : 42, fontWeight: 800, color: T.headerText, lineHeight: 1.1, marginTop: 6, textAlign: 'center', ...clamp(mode, 2) }}>{title}</div>
        {(p.tournamentDates || p.location) && (
          <div style={{ fontSize: 19, color: T.headerSub, marginTop: 8, textAlign: 'center', ...clamp(mode, 1) }}>{[p.tournamentDates, p.location].filter(Boolean).join('  ·  ')}</div>
        )}
      </div>
      <CornerQR src={p.qr2DataUrl} label={p.qr2Label} mode={mode} />
    </div>
  )
}

/**
 * The photo stage — full width, and NEVER cropped.
 *
 * Filling the frame would crop, and most uploads are phone photos held upright: a
 * 900x1600 photo cropped into this 720x486 window keeps a 38% band through the middle,
 * and the face is usually in the top third, so it decapitates people. Satori ignores
 * `objectPosition` (measured), so a top-biased crop is not available to us either.
 *
 * Instead the photo is drawn CONTAINED and the gap around it is filled with a blown-up,
 * blurred, darkened copy of the same photo — the frame is always full, always in the
 * photo's own colours, and nothing is ever cut off. A tall photo becomes a framed
 * portrait; a wide one gets thin bars. The backdrop is oversized and offset so the
 * blur's soft edge is clipped by the frame rather than showing as a pale border.
 *
 * The real fix for badly FRAMED (as opposed to badly shaped) photos is letting the
 * family crop at upload time, since the crop has to be baked into the stored image.
 */
function PhotoStage({ p, mode }: { p: PassCardData; mode: RenderMode }) {
  const H = BUDGET.photo
  if (!p.photoUrl) {
    // No photo: the initials sit ABOVE the scrim's reach, or the fallback ends up
    // half-buried behind its own gradient.
    return (
      <div style={{ display: 'flex', boxSizing: 'border-box', width: PASS_W, height: H, background: badgeHex(p.playerName), color: '#fff', alignItems: 'center', justifyContent: 'center', paddingBottom: 150, fontSize: 170, fontWeight: 800 }}>
        {initials(p.playerName)}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: PASS_W, height: H, overflow: 'hidden' }}>
      <img src={p.photoUrl} width={PASS_W + 120} height={H + 120} style={{ position: 'absolute', left: -60, top: -60, width: PASS_W + 120, height: H + 120, objectFit: 'cover', filter: 'blur(36px)' }} />
      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: PASS_W, height: H, background: 'rgba(11,18,32,0.48)' }} />
      <img src={p.photoUrl} width={PASS_W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: PASS_W, height: H, objectFit: 'contain' }} />
    </div>
  )
}

/** The one thing a gate actually has to read: is this card current? */
function WaiverPill({ signedOn, T }: { signedOn: string; T: Tokens }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box', borderRadius: 14, border: `2px solid ${T.waiverBorder}`, background: T.waiverBg, padding: '10px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: T.waiverText, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>✓</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 12, fontWeight: 800, letterSpacing: 1.6, color: T.waiverText, textTransform: 'uppercase' }}>Waiver on file</div>
        {signedOn ? <div style={{ display: 'flex', fontSize: 14, color: T.waiverText, marginTop: 1 }}>{signedOn}</div> : null}
      </div>
    </div>
  )
}

/** One code, the player ID and what the code opens, sharing the row two codes used to fill. */
function ScanStrip({ p, T, mode }: { p: PassCardData; T: Tokens; mode: RenderMode }) {
  const code = p.qrDataUrl
    ? <img src={p.qrDataUrl} width={132} height={132} style={{ borderRadius: 8 }} />
    : <div style={{ display: 'flex', width: 132, height: 132, borderRadius: 8, background: S100 }} />
  return (
    <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 26, margin: '0 36px', paddingTop: 18, borderTop: `2px solid ${T.divider}`, height: BUDGET.scan, flexShrink: 0, overflow: 'hidden' }}>
      {T.qrTile
        ? <div style={{ display: 'flex', boxSizing: 'border-box', borderRadius: 14, padding: 9, flexShrink: 0, ...T.qrTile }}>{code}</div>
        : <div style={{ display: 'flex', flexShrink: 0 }}>{code}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: 13, fontWeight: 800, letterSpacing: 3, color: T.muted, textTransform: 'uppercase' }}>Player ID</div>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: 2, marginTop: 2 }}>{p.code}</div>
        {p.qrLabel ? <div style={{ fontSize: 17, color: T.muted, marginTop: 12, ...clamp(mode, 1) }}>{`Scan for ${p.qrLabel}`}</div> : null}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: PASS_W, height: PASS_H, fontFamily: font, color: T.text, boxSizing: 'border-box', lineHeight: 1.2, overflow: 'hidden', ...T.body, ...texture(T.bodyTexture) }}>
      <EventLockup p={p} T={T} mode={mode} />

      {/* Photo, with the name and number riding on it under a scrim */}
      <div style={{ display: 'flex', position: 'relative', width: PASS_W, height: BUDGET.photo, flexShrink: 0, overflow: 'hidden' }}>
        <PhotoStage p={p} mode={mode} />
        {/* Scrim first, name on top of it — a bright photo is never allowed to eat the name.
            The overlay type stays white in every theme: the scrim is what guarantees the
            contrast, and the photo underneath is whatever the family uploaded. */}
        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, width: PASS_W, height: 224, backgroundImage: 'linear-gradient(180deg, rgba(11,18,32,0) 0%, rgba(11,18,32,0.55) 45%, rgba(11,18,32,0.94) 100%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', left: 36, bottom: 26, width: 430 }}>
          <div style={{ fontSize: p.playerName.length > 18 ? 44 : 58, fontWeight: T.nameWeight || 800, color: '#fff', lineHeight: 1.06, letterSpacing: -1.5, ...clamp(mode, 2) }}>{p.playerName}</div>
          {p.position && <div style={{ display: 'flex', fontSize: 21, fontWeight: 800, letterSpacing: 4, color: T.eyebrow, textTransform: 'uppercase', marginTop: 8 }}>{p.position}</div>}
        </div>
        {p.jersey && (
          <div style={{ display: 'flex', alignItems: 'baseline', position: 'absolute', right: 34, bottom: 22 }}>
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 800, color: 'rgba(255,255,255,0.65)', marginRight: 3 }}>#</div>
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -3 }}>{p.jersey}</div>
          </div>
        )}
      </div>

      {/* Club on the left, "is this card current?" on the right — the number is on the photo */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 18, padding: '0 36px', height: BUDGET.club, flexShrink: 0, overflow: 'hidden' }}>
        <Mark name={p.clubName} url={p.clubLogoUrl} size={72} radius={16} tile={T.logoTile} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.1, ...clamp(mode, 1) }}>{p.clubName || 'Club'}</div>
          {teamLine && <div style={{ fontSize: 18, color: T.muted, marginTop: 4, ...clamp(mode, 1) }}>{teamLine}</div>}
        </div>
        <WaiverPill signedOn={p.signedOn} T={T} />
      </div>

      <ScanStrip p={p} T={T} mode={mode} />

      {/* Footer: the organization's branding */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 16, padding: '0 36px', height: BUDGET.footer, flexShrink: 0, ...T.footerBg }}>
        {p.orgLogoUrl
          ? <div style={{ display: 'flex', boxSizing: 'border-box', width: 122, height: 52, borderRadius: 10, background: '#fff', padding: 7, alignItems: 'center', justifyContent: 'center' }}><img src={p.orgLogoUrl} width={108} height={29} style={{ objectFit: 'contain' }} /></div>
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
