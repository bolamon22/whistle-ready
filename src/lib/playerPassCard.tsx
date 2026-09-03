// The player card: a keepsake credential (tournament + club logos, photo, name, team,
// jersey #, player ID, a QR code to the player's own link, org branding) rendered to a PNG
// with Satori (next/og). Parents save it to their phone from /pass/<token>; staff print the
// same image on the badge sheet.
//
// Satori rules that shape this file: every element with more than one child needs
// `display: 'flex'`, text must sit inside an element, images need width + height, and
// `lineClamp` only clamps inside `display: 'block'` text boxes.
// Keep it free of Next/DB imports so it can be rendered anywhere (it is unit-rendered
// with plain Satori in development).

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

const DARK = '#0b1220', TEAL = '#0d9488', TEAL_LIGHT = '#5eead4'
const S900 = '#0f172a', S700 = '#334155', S500 = '#64748b', S400 = '#94a3b8', S200 = '#e2e8f0', S100 = '#f1f5f9'

function Mark({ name, url, size, radius }: { name: string; url: string; size: number; radius: number }) {
  if (url) {
    return (
      <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: '#fff', border: `2px solid ${S200}`, padding: Math.round(size * 0.08), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
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

export function PassCard({ p, mode = 'satori' }: { p: PassCardData; mode?: RenderMode }) {
  const teamLine = [p.teamName, p.division].filter(Boolean).join(' · ')
  const font = mode === 'dom' ? 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'Inter'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: PASS_W, height: PASS_H, background: '#fff', fontFamily: font, color: S900, boxSizing: 'border-box', lineHeight: 1.2, overflow: 'hidden' }}>
      {/* Header: tournament */}
      {/* Every section has a fixed height budget (sums to < 1140 with a little slack that marginTop: auto
          hands to the footer), so wider browser fonts in the live preview can't push things into each other. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, background: DARK, padding: '0 36px', height: 200, flexShrink: 0, overflow: 'hidden' }}>
        <Mark name={p.tournamentName || p.orgName} url={p.tournamentLogoUrl} size={116} radius={22} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 19, fontWeight: 700, letterSpacing: 5, color: TEAL_LIGHT, textTransform: 'uppercase' }}>Player card</div>
          <div style={{ fontSize: (p.tournamentName || p.orgName).length > 26 ? 31 : 40, fontWeight: 800, color: '#fff', lineHeight: 1.12, marginTop: 6, ...clamp(mode, 2) }}>{p.tournamentName || p.orgName}</div>
          {(p.tournamentDates || p.location) && (
            <div style={{ fontSize: 21, color: '#cbd5e1', marginTop: 8, ...clamp(mode, 1) }}>{[p.tournamentDates, p.location].filter(Boolean).join('  ·  ')}</div>
          )}
        </div>
      </div>

      {/* Photo + club */}
      <div style={{ display: 'flex', gap: 28, padding: '34px 36px 0', height: 334, flexShrink: 0, overflow: 'hidden' }}>
        {p.photoUrl
          ? <img src={p.photoUrl} width={300} height={300} style={{ borderRadius: 28, objectFit: 'cover', border: `4px solid ${S100}` }} />
          : <div style={{ display: 'flex', width: 300, height: 300, borderRadius: 28, background: badgeHex(p.playerName), color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 112, fontWeight: 800 }}>{initials(p.playerName)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Mark name={p.clubName} url={p.clubLogoUrl} size={176} radius={30} />
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.12, marginTop: 12, ...clamp(mode, 2) }}>{p.clubName || 'Club'}</div>
          {teamLine && <div style={{ fontSize: 24, color: S700, marginTop: 6, lineHeight: 1.25, ...clamp(mode, 1) }}>{teamLine}</div>}
        </div>
      </div>

      {/* Name + position, number on the right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '0 36px', height: 124, marginTop: 24, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: p.playerName.length > 22 ? 42 : 54, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, ...clamp(mode, p.playerName.length > 22 ? 2 : 1) }}>{p.playerName}</div>
          {p.position && <div style={{ display: 'flex', fontSize: 27, fontWeight: 800, letterSpacing: 4, color: TEAL, textTransform: 'uppercase', marginTop: 6 }}>{p.position}</div>}
        </div>
        {p.jersey && (
          <div style={{ display: 'flex', alignItems: 'baseline', color: TEAL, flexShrink: 0 }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, marginRight: 4 }}>#</div>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{p.jersey}</div>
          </div>
        )}
      </div>

      {/* Two QR codes: the player's own link, and the event / organization */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', margin: '26px 36px 0', paddingTop: 26, borderTop: `2px solid ${S100}`, height: 250, flexShrink: 0, overflow: 'hidden' }}>
        {[[p.qrDataUrl, p.qrLabel], [p.qr2DataUrl, p.qr2Label]].map(([src, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 300 }}>
            {src ? <img src={src} width={196} height={196} style={{ borderRadius: 12 }} /> : <div style={{ display: 'flex', width: 196, height: 196, borderRadius: 12, background: S100 }} />}
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2.5, color: S500, marginTop: 8, textTransform: 'uppercase', textAlign: 'center', ...clamp(mode, 1) }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Player ID + waiver line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 36px 0', height: 44, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 3, color: S500, textTransform: 'uppercase' }}>Player ID</div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 2 }}>{p.code}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', width: 26, height: 26, borderRadius: 13, background: '#d1fae5', color: '#047857', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800 }}>✓</div>
          <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: '#047857' }}>Waiver on file</div>
          <div style={{ display: 'flex', fontSize: 17, color: S500 }}>· {p.signedOn}</div>
        </div>
      </div>

      {/* Footer: the organization's branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: DARK, padding: '0 36px', height: 92, marginTop: 'auto', flexShrink: 0 }}>
        {p.orgLogoUrl
          ? <div style={{ display: 'flex', width: 60, height: 60, borderRadius: 12, background: '#fff', padding: 5, alignItems: 'center', justifyContent: 'center' }}><img src={p.orgLogoUrl} width={50} height={50} style={{ objectFit: 'contain' }} /></div>
          : null}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: TEAL_LIGHT, textTransform: 'uppercase' }}>Presented by</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2, ...clamp(mode, 1) }}>{p.orgName}</div>
        </div>
        {p.orgSite && <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>{p.orgSite}</div>}
      </div>
    </div>
  )
}
