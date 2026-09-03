// The player pass: a credential card (tournament + club logos, photo, name, team, jersey #,
// player ID, QR code) rendered to a PNG with Satori (next/og). Parents save it to their
// phone from /pass/<token>; staff print the same image on the badge sheet.
//
// Satori rules that shape this file: every element with more than one child needs
// `display: 'flex'`, text must sit inside an element, images need width + height, and
// `lineClamp` only clamps inside `display: 'block'` text boxes.
// Keep it free of Next/DB imports so it can be rendered anywhere (it is unit-rendered
// with plain Satori in development).

export type PassCardData = {
  code: string                 // human-readable player ID, e.g. "K7M-3PX"
  playerName: string
  clubName: string
  teamName: string             // team without the club prefix, may be ''
  division: string
  jersey: string
  photoUrl: string             // '' when the parent skipped the photo
  clubLogoUrl: string
  tournamentName: string
  tournamentLogoUrl: string
  tournamentDates: string      // already formatted, may be ''
  location: string
  orgName: string
  signedOn: string             // formatted date the waiver was signed
  qrDataUrl: string            // PNG data URL of the check-in QR code
}

export const PASS_W = 720
export const PASS_H = 1140

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

export function PassCard({ p }: { p: PassCardData }) {
  const teamLine = [p.teamName, p.division].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: PASS_W, height: PASS_H, background: '#fff', fontFamily: 'Inter', color: S900 }}>
      {/* Header: tournament */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, background: DARK, padding: '34px 36px', minHeight: 200 }}>
        <Mark name={p.tournamentName || p.orgName} url={p.tournamentLogoUrl} size={116} radius={22} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 19, fontWeight: 700, letterSpacing: 5, color: TEAL_LIGHT, textTransform: 'uppercase' }}>Player pass</div>
          <div style={{ display: 'block', fontSize: (p.tournamentName || p.orgName).length > 26 ? 31 : 40, fontWeight: 800, color: '#fff', lineHeight: 1.12, marginTop: 6, lineClamp: 2 }}>{p.tournamentName || p.orgName}</div>
          {(p.tournamentDates || p.location) && (
            <div style={{ display: 'block', fontSize: 21, color: '#cbd5e1', marginTop: 8, lineClamp: 1 }}>{[p.tournamentDates, p.location].filter(Boolean).join('  ·  ')}</div>
          )}
        </div>
      </div>

      {/* Photo + club */}
      <div style={{ display: 'flex', gap: 28, padding: '34px 36px 0' }}>
        {p.photoUrl
          ? <img src={p.photoUrl} width={320} height={320} style={{ borderRadius: 28, objectFit: 'cover', border: `4px solid ${S100}` }} />
          : <div style={{ display: 'flex', width: 320, height: 320, borderRadius: 28, background: badgeHex(p.playerName), color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 120, fontWeight: 800 }}>{initials(p.playerName)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <Mark name={p.clubName} url={p.clubLogoUrl} size={124} radius={24} />
          <div style={{ display: 'block', fontSize: 34, fontWeight: 800, lineHeight: 1.12, marginTop: 18, lineClamp: 2 }}>{p.clubName || 'Club'}</div>
          {teamLine && <div style={{ display: 'block', fontSize: 25, color: S700, marginTop: 8, lineHeight: 1.25, lineClamp: 2 }}>{teamLine}</div>}
        </div>
      </div>

      {/* Name + number */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '30px 36px 0' }}>
        <div style={{ display: 'block', flex: 1, minWidth: 0, fontSize: p.playerName.length > 22 ? 42 : 54, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, lineClamp: 2 }}>{p.playerName}</div>
        {p.jersey && (
          <div style={{ display: 'flex', alignItems: 'baseline', color: TEAL, flexShrink: 0 }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, marginRight: 4 }}>#</div>
            <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{p.jersey}</div>
          </div>
        )}
      </div>

      {/* QR + ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, margin: '30px 36px 0', paddingTop: 30, borderTop: `2px solid ${S100}`, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={p.qrDataUrl} width={224} height={224} style={{ borderRadius: 12 }} />
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 3, color: S500, marginTop: 10, textTransform: 'uppercase' }}>Scan at check-in</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 17, fontWeight: 700, letterSpacing: 4, color: S500, textTransform: 'uppercase' }}>Player ID</div>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 800, letterSpacing: 3, marginTop: 4 }}>{p.code}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <div style={{ display: 'flex', width: 30, height: 30, borderRadius: 15, background: '#d1fae5', color: '#047857', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>✓</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 21, fontWeight: 700, color: '#047857' }}>Waiver signed</div>
              <div style={{ display: 'flex', fontSize: 19, color: S500 }}>{p.signedOn}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: S100, padding: '0 36px', height: 62, marginTop: 30 }}>
        <div style={{ display: 'flex', fontSize: 18, color: S500 }}>Present this pass at check-in</div>
        <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: S400 }}>{p.orgName}</div>
      </div>
    </div>
  )
}
