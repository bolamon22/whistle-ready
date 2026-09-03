// The player card: a keepsake credential (tournament + club logos, photo, name, team,
// jersey #, position, player ID, two QR codes, org branding) rendered to a PNG with
// Satori (next/og). Parents save it to their phone from /pass/<token>; staff print the
// same image on the badge sheet; the form shows it live while they type.
//
// Satori rules that shape this file: every element with more than one child needs
// `display: 'flex'`, text must sit inside an element, images need width + height, and
// `lineClamp` only clamps inside `display: 'block'` text boxes.
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
  { id: 'brushed', label: 'Brushed Steel', blurb: 'Silver brushed-metal body, navy header, cyan-lit photo frame, security edge print.' },
  { id: 'gold', label: 'Gold Edition', blurb: 'Ivory card in a gold frame, bold black type, the jersey number ghosted in gold behind the codes.' },
  { id: 'frost', label: 'Frost', blurb: 'Frosted glass: soft white, round photo, cool glow — light and modern.' },
]

const svg = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s.replace(/\s+/g, ' ').trim())}")`
// Textures as tiny repeating SVG tiles (Satori and browsers both draw them).
const TEX = {
  brushed: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='7'><rect width='120' height='7' fill='#e4e7ec'/><path d='M0 1.5h120' stroke='#f2f4f7' stroke-width='1'/><path d='M0 3.5h120' stroke='#d9dde3' stroke-width='1'/><path d='M0 5.5h120' stroke='#eceef2' stroke-width='1'/></svg>`),
  hex: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='56' height='64' viewBox='0 0 56 64'><g fill='none' stroke='#ffffff' stroke-opacity='0.07' stroke-width='1.5'><path d='M28 2 L52 16 L52 46 L28 60 L4 46 L4 16 Z'/></g></svg>`),
  carbon: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><rect width='12' height='12' fill='#0f1115'/><rect width='6' height='6' fill='#171a20'/><rect x='6' y='6' width='6' height='6' fill='#171a20'/><rect x='1' y='1' width='4' height='4' fill='#1d2128'/><rect x='7' y='7' width='4' height='4' fill='#1d2128'/></svg>`),
  linen: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='#f4eddb'/><path d='M0 4h8' stroke='#ede4cc' stroke-width='1'/><path d='M4 0v8' stroke='#f9f4e6' stroke-width='1'/></svg>`),
}

type Tokens = {
  body: CSSProperties; bodyTexture?: string; textureSize?: string
  text: string; muted: string; divider: string
  headerBg: CSSProperties; headerTexture?: string; headerText: string; headerSub: string; eyebrow: string
  accent: string; accentText?: CSSProperties        // position + number (gold: gradient text)
  photoFrame: CSSProperties; photoRadius?: number
  logoTile: CSSProperties
  qrTile?: CSSProperties; qrCaption: string; led?: string
  waiverBg: string; waiverText: string
  footerBg: CSSProperties; footerText: string; footerSub: string
  edge?: { bg: string; text: string }              // micro-text security stripes down both sides
  frame?: CSSProperties                            // inner border line drawn over the whole card (gold)
  watermark?: string                               // ghost the jersey number behind the QR codes in this color
  nameWeight?: number
}

const NAVY = '#0b1220', TEAL = '#0d9488', TEAL_LIGHT = '#5eead4', CYAN = '#22d3ee'
const S900 = '#0f172a', S700 = '#334155', S500 = '#64748b', S400 = '#94a3b8', S200 = '#e2e8f0', S100 = '#f1f5f9'
const GOLD = '#d4a72c'

const THEMES: Record<CardTheme, Tokens> = {
  classic: {
    body: { background: '#fff' }, text: S900, muted: S500, divider: S100,
    headerBg: { background: NAVY }, headerText: '#fff', headerSub: '#cbd5e1', eyebrow: TEAL_LIGHT,
    accent: TEAL,
    photoFrame: { border: `4px solid ${S100}` },
    logoTile: { background: '#fff', border: `2px solid ${S200}` },
    qrCaption: S500,
    waiverBg: '#d1fae5', waiverText: '#047857',
    footerBg: { background: NAVY }, footerText: '#fff', footerSub: S400,
  },
  brushed: {
    body: { background: '#e6e9ee' }, bodyTexture: TEX.brushed, text: '#0b1e3a', muted: '#4b5b74', divider: '#c9d0d9',
    headerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, headerTexture: TEX.hex, headerText: '#fff', headerSub: '#c7d5e8', eyebrow: CYAN,
    accent: '#0e7c86',
    photoFrame: { border: `4px solid ${CYAN}`, boxShadow: `0 0 0 3px #0b1e3a, 0 0 28px rgba(34,211,238,0.55)` },
    logoTile: { background: '#fff', border: `2px solid #b9c2cf`, boxShadow: '0 4px 14px rgba(11,30,58,0.18)' },
    qrTile: { backgroundImage: 'linear-gradient(180deg, #102a4d 0%, #0b1e3a 100%)', border: '2px solid #2a4a78', boxShadow: '0 6px 18px rgba(11,30,58,0.3)' }, qrCaption: '#c7d5e8', led: CYAN,
    waiverBg: '#d1fae5', waiverText: '#047857',
    footerBg: { backgroundImage: 'linear-gradient(135deg, #0b1e3a 0%, #133b6b 100%)' }, footerText: '#fff', footerSub: '#93a8c4',
    edge: { bg: '#d3d8df', text: '#7d8a9c' },
  },
  gold: {
    body: { background: '#f4eddb', border: '12px solid #c9a227' }, bodyTexture: TEX.linen, textureSize: '8px 8px',
    text: '#111111', muted: '#6b5e3a', divider: '#d9cfae',
    headerBg: { background: 'transparent' }, headerText: '#111111', headerSub: '#4d4326', eyebrow: '#a9841c',
    accent: '#111111', accentText: { color: '#111111' },
    photoFrame: { border: `4px solid ${GOLD}`, boxShadow: '0 6px 18px rgba(80,60,10,0.25)' },
    logoTile: { background: '#fff', border: `3px solid ${GOLD}` },
    qrTile: { background: '#fff', border: `2px solid ${GOLD}`, boxShadow: '0 4px 14px rgba(80,60,10,0.18)' }, qrCaption: '#4d4326',
    waiverBg: '#e9dfb8', waiverText: '#5a4a10',
    footerBg: { background: 'transparent', borderTop: `3px solid ${GOLD}` }, footerText: '#111111', footerSub: '#6b5e3a',
    frame: { border: '3px solid #f1dc9a', borderRadius: 22 },
    watermark: GOLD,
  },
  frost: {
    body: { backgroundImage: 'linear-gradient(160deg, #ffffff 0%, #eef3f8 55%, #e3ebf3 100%)' },
    text: '#0f172a', muted: '#64748b', divider: '#d8e0ea',
    headerBg: { backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.35) 100%)', borderBottom: '1px solid #d8e0ea' }, headerText: '#0f172a', headerSub: '#64748b', eyebrow: '#0891b2',
    accent: '#0891b2',
    photoFrame: { border: '6px solid #ffffff', boxShadow: '0 0 0 2px #cffafe, 0 0 44px rgba(34,211,238,0.45), 0 14px 30px rgba(15,23,42,0.15)' }, photoRadius: 150,
    logoTile: { background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15,23,42,0.12)' },
    qrTile: { background: 'rgba(255,255,255,0.85)', border: '1px solid #e2e8f0', boxShadow: '0 0 26px rgba(34,211,238,0.25), 0 10px 24px rgba(15,23,42,0.08)' }, qrCaption: '#475569',
    waiverBg: '#d1fae5', waiverText: '#047857',
    footerBg: { background: 'rgba(255,255,255,0.75)', borderTop: '1px solid #d8e0ea' }, footerText: '#0f172a', footerSub: '#64748b',
    nameWeight: 700,
  },
}

function Mark({ name, url, size, radius, tile }: { name: string; url: string; size: number; radius: number; tile: CSSProperties }) {
  if (url) {
    return (
      <div style={{ display: 'flex', boxSizing: 'border-box', width: size, height: size, borderRadius: radius, padding: Math.round(size * 0.08), alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...tile }}>
        <img src={url} width={size - Math.round(size * 0.16) - 4} height={size - Math.round(size * 0.16) - 4} style={{ objectFit: 'contain' }} />
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

export function PassCard({ p, mode = 'satori', theme = 'classic' }: { p: PassCardData; mode?: RenderMode; theme?: CardTheme }) {
  const T = THEMES[theme] || THEMES.classic
  const teamLine = [p.teamName, p.division].filter(Boolean).join(' · ')
  const font = mode === 'dom' ? 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'Inter'
  const accentText: CSSProperties = T.accentText || { color: T.accent }
  const edgeText = [p.orgName, p.tournamentName, 'Player card', 'Waiver on file', p.code].filter(Boolean).join('  ·  ') + '  ·  '
  const texture = (tex?: string): CSSProperties => tex ? { backgroundImage: tex, backgroundRepeat: 'repeat', backgroundSize: T.textureSize || '120px 7px' } : {}
  const photoRadius = T.photoRadius ?? 28

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: PASS_W, height: PASS_H, fontFamily: font, color: T.text, boxSizing: 'border-box', lineHeight: 1.2, overflow: 'hidden', ...T.body, ...texture(T.bodyTexture) }}>
      {/* Header: tournament */}
      {/* Every section has a fixed height budget (sums to < 1140 with a little slack that marginTop: auto
          hands to the footer), so wider browser fonts in the live preview can't push things into each other. */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 24, padding: '0 36px', height: 192, flexShrink: 0, overflow: 'hidden', position: 'relative', ...T.headerBg }}>
        {T.headerTexture && <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, width: PASS_W, height: 192, backgroundImage: T.headerTexture, backgroundRepeat: 'repeat', backgroundSize: '56px 64px' }} />}
        <Mark name={p.tournamentName || p.orgName} url={p.tournamentLogoUrl} size={116} radius={22} tile={{ background: '#fff', border: `2px solid ${S200}` }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 19, fontWeight: 700, letterSpacing: 5, color: T.eyebrow, textTransform: 'uppercase' }}>Player card</div>
          <div style={{ fontSize: (p.tournamentName || p.orgName).length > 26 ? 31 : 40, fontWeight: 800, color: T.headerText, lineHeight: 1.12, marginTop: 6, ...clamp(mode, 2) }}>{p.tournamentName || p.orgName}</div>
          {(p.tournamentDates || p.location) && (
            <div style={{ fontSize: 21, color: T.headerSub, marginTop: 8, ...clamp(mode, 1) }}>{[p.tournamentDates, p.location].filter(Boolean).join('  ·  ')}</div>
          )}
        </div>
      </div>

      {/* Photo + club */}
      <div style={{ display: 'flex', boxSizing: 'border-box', gap: 28, padding: '34px 36px 0', height: 334, flexShrink: 0, overflow: 'hidden' }}>
        {p.photoUrl
          ? <img src={p.photoUrl} width={300} height={300} style={{ boxSizing: 'border-box', width: 300, height: 300, borderRadius: photoRadius, objectFit: 'cover', ...T.photoFrame }} />
          : <div style={{ display: 'flex', boxSizing: 'border-box', width: 300, height: 300, borderRadius: photoRadius, background: badgeHex(p.playerName), color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 112, fontWeight: 800, ...T.photoFrame }}>{initials(p.playerName)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Mark name={p.clubName} url={p.clubLogoUrl} size={176} radius={30} tile={T.logoTile} />
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.12, marginTop: 12, ...clamp(mode, 2) }}>{p.clubName || 'Club'}</div>
          {teamLine && <div style={{ fontSize: 24, color: T.muted, marginTop: 6, lineHeight: 1.25, ...clamp(mode, 1) }}>{teamLine}</div>}
        </div>
      </div>

      {/* Name + position, number on the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 36px', height: 116, marginTop: 24, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: p.playerName.length > 22 ? 42 : 54, fontWeight: T.nameWeight || 800, lineHeight: 1.08, letterSpacing: -1, ...clamp(mode, p.playerName.length > 22 ? 2 : 1) }}>{p.playerName}</div>
          {p.position && <div style={{ display: 'flex', fontSize: 27, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', marginTop: 6, ...accentText }}>{p.position}</div>}
        </div>
        {p.jersey && (
          <div style={{ display: 'flex', alignItems: 'baseline', flexShrink: 0 }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, marginRight: 4, ...accentText }}>#</div>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1, ...accentText }}>{p.jersey}</div>
          </div>
        )}
      </div>

      {/* Ghosted jersey number behind the codes (gold) — painted before them so they sit on top */}
      {T.watermark && p.jersey && (
        <div style={{ display: 'flex', position: 'absolute', right: 36, top: 640, fontSize: 400, fontWeight: 800, lineHeight: 1, letterSpacing: -14, color: T.watermark, opacity: 0.3 }}>{p.jersey}</div>
      )}

      {/* Two QR codes: the player's own link, and the event / organization */}
      <div style={{ display: 'flex', boxSizing: 'border-box', position: 'relative', zIndex: 1, justifyContent: 'space-around', alignItems: 'flex-start', margin: '20px 36px 0', paddingTop: 22, borderTop: `2px solid ${T.divider}`, height: 270, flexShrink: 0, overflow: 'hidden' }}>
        {[[p.qrDataUrl, p.qrLabel], [p.qr2DataUrl, p.qr2Label]].map(([src, label], i) => T.qrTile ? (
          <div key={i} style={{ display: 'flex', boxSizing: 'border-box', flexDirection: 'column', alignItems: 'center', width: 232, borderRadius: 18, padding: '10px 12px 12px', ...T.qrTile }}>
            {T.led && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                {[0, 1, 2, 3, 4, 5].map(j => <div key={j} style={{ display: 'flex', width: 7, height: 7, borderRadius: 4, background: T.led, boxShadow: `0 0 6px ${T.led}` }} />)}
              </div>
            )}
            {src ? <img src={src} width={186} height={186} style={{ borderRadius: 10, background: '#fff' }} /> : <div style={{ display: 'flex', width: 186, height: 186, borderRadius: 10, background: S100 }} />}
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: T.qrCaption, marginTop: 8, textTransform: 'uppercase', textAlign: 'center', width: 208, ...clamp(mode, 1) }}>{label}</div>
          </div>
        ) : (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 300 }}>
            {src ? <img src={src} width={196} height={196} style={{ borderRadius: 12 }} /> : <div style={{ display: 'flex', width: 196, height: 196, borderRadius: 12, background: S100 }} />}
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2.5, color: T.qrCaption, marginTop: 8, textTransform: 'uppercase', textAlign: 'center', ...clamp(mode, 1) }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Player ID + waiver line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 36px 0', height: 40, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 3, color: T.muted, textTransform: 'uppercase' }}>Player ID</div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 2 }}>{p.code}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: T.waiverBg, color: T.waiverText, alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800 }}>✓</div>
          <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: T.waiverText }}>Waiver on file</div>
          <div style={{ display: 'flex', fontSize: 17, color: T.muted }}>· {p.signedOn}</div>
        </div>
      </div>

      {/* Footer: the organization's branding */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 16, padding: '0 36px', height: 92, marginTop: 'auto', flexShrink: 0, ...T.footerBg }}>
        {p.orgLogoUrl
          ? <div style={{ display: 'flex', boxSizing: 'border-box', width: 60, height: 60, borderRadius: 12, background: '#fff', padding: 5, alignItems: 'center', justifyContent: 'center' }}><img src={p.orgLogoUrl} width={50} height={50} style={{ objectFit: 'contain' }} /></div>
          : null}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: T.eyebrow, textTransform: 'uppercase' }}>Presented by</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.footerText, marginTop: 2, ...clamp(mode, 1) }}>{p.orgName}</div>
        </div>
        {p.orgSite && <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: T.footerSub, flexShrink: 0 }}>{p.orgSite}</div>}
      </div>

      {T.edge && <EdgeStripe side="left" text={edgeText.repeat(4)} color={T.edge.text} bg={T.edge.bg} />}
      {T.edge && <EdgeStripe side="right" text={edgeText.repeat(4)} color={T.edge.text} bg={T.edge.bg} />}
      {T.frame && <div style={{ display: 'flex', position: 'absolute', left: 6, top: 6, width: PASS_W - 12 - 24, height: PASS_H - 12 - 24, ...T.frame }} />}
    </div>
  )
}
