// The credential card: media, vendor and staff passes, on the same body as the player
// card (src/lib/playerPassCard.tsx) so one badge sheet, one set of lanyard holders and
// one printer setting cover every credential an event issues.
//
// Same Satori rules apply: any element with more than one child needs
// `display: 'flex'`, text must sit inside an element, images need width + height.
//
// TWO THINGS THIS CARD DOES THAT THE PLAYER CARD DOESN'T:
//
// 1. It is colour-coded by role. A gate volunteer has to sort media from vendor from
//    staff at arm's length while a queue builds behind them, and reading a word is
//    slower than seeing a colour. The layout never changes -- only the band.
//
// 2. It renders BEFORE it is valid. The applicant sees their card building as they
//    type, which is the point, but an unapproved card must not be mistakable for a
//    pass -- so pending drops the role colour for grey and prints NOT VALID across
//    the face. Approval is what turns the colour on.
import type { CSSProperties } from 'react'

export const CRED_W = 720
export const CRED_H = 1140

export type CredentialRole = 'media' | 'vendor' | 'staff' | 'coach'
export type CredentialStatus = 'pending' | 'approved' | 'declined'
export type RenderMode = 'satori' | 'dom'

export type CredentialCardData = {
  /** Human-readable credential id, e.g. "MD-4K2P". Blank until they submit. */
  code: string
  role: CredentialRole
  status: CredentialStatus
  /** The person who wears it. */
  name: string
  /** Their business, if any — shown under the name. */
  business: string
  /** "Photographer", "Content creator", "Booth staff"… the line under the role band. */
  title: string
  photoUrl: string
  /** Events the credential is good for, already formatted. */
  eventNames: string
  eventDates: string
  location: string
  /** What they are cleared to do, at most three. */
  clearances: string[]
  orgName: string
  orgLogoUrl: string
  orgSite: string
  /** Data URL of the QR that opens their credential page. */
  qrDataUrl: string
  qrLabel: string
  /** Second QR — the org's social, so the card does a job even while it hangs. */
  qr2DataUrl: string
  qr2Label: string
  /** Formatted date the credential was issued. Blank while pending. */
  issuedOn: string
}

const clamp = (mode: RenderMode, lines: number): CSSProperties =>
  mode === 'dom'
    ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }
    : ({ display: 'block', lineClamp: lines } as any)

const S100 = '#f1f5f9', S200 = '#e2e8f0', S400 = '#94a3b8', S500 = '#64748b', INK = '#0f172a'

export function initials(name: string) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?'
}

// ── roles ────────────────────────────────────────────────────────────────────
// Chosen for separation at distance rather than prettiness. Teal is the org's own
// colour so it goes to staff, who are the org; media gets amber because it is the
// furthest thing from teal that still reads warm and official at ten feet; vendor
// gets violet, which no one confuses with either.
export const ROLES: Record<CredentialRole, { label: string; band: string; ink: string; soft: string }> = {
  media:  { label: 'Media',  band: '#b45309', ink: '#fbbf24', soft: '#fffbeb' },
  vendor: { label: 'Vendor', band: '#5b21b6', ink: '#c4b5fd', soft: '#f5f3ff' },
  staff:  { label: 'Staff',  band: '#0f766e', ink: '#5eead4', soft: '#f0fdfa' },
  // Crimson for coaches: the one remaining hue that cannot be mistaken for teal
  // at ten feet, which matters most here — a coach card read as staff is someone
  // waved through to places only staff should be.
  coach:  { label: 'Coach',  band: '#9f1239', ink: '#fda4af', soft: '#fff1f2' },
}

/** Pending strips the role colour: an unapproved card must not look like a pass. */
function palette(role: CredentialRole, status: CredentialStatus) {
  const r = ROLES[role] || ROLES.media
  if (status === 'approved') return { band: r.band, ink: r.ink, soft: r.soft, label: r.label }
  return { band: '#334155', ink: '#94a3b8', soft: '#f8fafc', label: r.label }
}

function Mark({ name, url, size, radius }: { name: string; url?: string; size: number; radius: number }) {
  if (url) {
    return (
      <div style={{ display: 'flex', boxSizing: 'border-box', width: size, height: size, borderRadius: radius, background: '#fff', border: `2px solid ${S200}`, alignItems: 'center', justifyContent: 'center', padding: 8, flexShrink: 0 }}>
        <img src={url} width={size - 20} height={size - 20} style={{ objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: radius, background: '#1e293b', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 800, flexShrink: 0 }}>
      {initials(name)}
    </div>
  )
}

export function CredentialCard({ p, mode = 'satori' }: { p: CredentialCardData; mode?: RenderMode }) {
  const T = palette(p.role, p.status)
  const font = mode === 'dom' ? 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : 'Inter'
  const approved = p.status === 'approved'
  const name = p.name || 'Your name'
  const clearances = (p.clearances || []).filter(Boolean).slice(0, 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: CRED_W, height: CRED_H, fontFamily: font, color: INK, background: '#fff', boxSizing: 'border-box', lineHeight: 1.2, overflow: 'hidden' }}>

      {/* Role band — the thing a volunteer reads from ten feet away, so it is the
          biggest type on the card and the only place the role colour lives. */}
      <div style={{ display: 'flex', boxSizing: 'border-box', flexDirection: 'column', justifyContent: 'center', padding: '0 36px', height: 176, flexShrink: 0, background: T.band }}>
        <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, letterSpacing: 6, color: T.ink, textTransform: 'uppercase' }}>
          {approved ? 'Credentialed' : 'Application preview'}
        </div>
        <div style={{ display: 'flex', fontSize: 70, fontWeight: 800, color: '#fff', letterSpacing: -1, lineHeight: 1.05, marginTop: 2 }}>
          {T.label.toUpperCase()}
        </div>
        {p.title && <div style={{ fontSize: 22, color: T.ink, marginTop: 6, ...clamp(mode, 1) }}>{p.title}</div>}
      </div>

      {/* Status strip — says in words what the colour says at a glance. */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', height: 58, flexShrink: 0, background: approved ? T.soft : '#f1f5f9', borderBottom: `2px solid ${S200}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', width: 24, height: 24, borderRadius: 12, background: approved ? T.band : S400, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
            {approved ? '✓' : '!'}
          </div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 800, letterSpacing: 2, color: approved ? T.band : S500, textTransform: 'uppercase' }}>
            {approved ? 'Approved' : p.status === 'declined' ? 'Not approved' : 'Pending approval'}
          </div>
        </div>
        {p.issuedOn && approved && <div style={{ display: 'flex', fontSize: 17, color: S500 }}>Issued {p.issuedOn}</div>}
      </div>

      {/* Photo + who they are */}
      <div style={{ display: 'flex', boxSizing: 'border-box', gap: 28, padding: '28px 36px 0', height: 290, flexShrink: 0, overflow: 'hidden' }}>
        {p.photoUrl
          ? <img src={p.photoUrl} width={250} height={250} style={{ boxSizing: 'border-box', width: 250, height: 250, borderRadius: 24, objectFit: 'cover', border: `4px solid ${S200}` }} />
          : <div style={{ display: 'flex', boxSizing: 'border-box', width: 250, height: 250, borderRadius: 24, background: S100, border: `4px dashed ${S200}`, color: S400, alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>Photo</div>}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <div style={{ fontSize: name.length > 20 ? 40 : 50, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, ...clamp(mode, 2) }}>{name}</div>
          {p.business && <div style={{ fontSize: 26, color: S500, marginTop: 8, ...clamp(mode, 2) }}>{p.business}</div>}
        </div>
      </div>

      {/* What they are cleared to do */}
      <div style={{ display: 'flex', boxSizing: 'border-box', flexDirection: 'column', padding: '0 36px', marginTop: 18, height: 132, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: S400, textTransform: 'uppercase' }}>Cleared for</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {clearances.length
            ? clearances.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: i ? 6 : 0 }}>
                  <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 4, background: approved ? T.band : S400, flexShrink: 0 }} />
                  <div style={{ fontSize: 22, fontWeight: 600, ...clamp(mode, 1) }}>{c}</div>
                </div>
              ))
            : <div style={{ display: 'flex', fontSize: 21, color: S400 }}>Set when your application is reviewed</div>}
        </div>
      </div>

      {/* Event */}
      <div style={{ display: 'flex', boxSizing: 'border-box', flexDirection: 'column', margin: '0 36px', paddingTop: 16, borderTop: `2px solid ${S200}`, height: 126, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: S400, textTransform: 'uppercase' }}>Good for</div>
        <div style={{ fontSize: p.eventNames.length > 34 ? 21 : 25, fontWeight: 800, marginTop: 6, lineHeight: 1.2, ...clamp(mode, 2) }}>{p.eventNames || 'Select your events'}</div>
        {(p.eventDates || p.location) && (
          <div style={{ fontSize: 19, color: S500, marginTop: 4, ...clamp(mode, 1) }}>{[p.eventDates, p.location].filter(Boolean).join('  ·  ')}</div>
        )}
      </div>

      {/* Two QR codes */}
      <div style={{ display: 'flex', boxSizing: 'border-box', justifyContent: 'space-around', alignItems: 'flex-start', margin: '12px 36px 0', paddingTop: 14, borderTop: `2px solid ${S200}`, height: 186, flexShrink: 0, overflow: 'hidden' }}>
        {[[p.qrDataUrl, p.qrLabel], [p.qr2DataUrl, p.qr2Label]].map(([src, label], i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 290 }}>
            {src
              ? <img src={src} width={140} height={140} style={{ borderRadius: 10 }} />
              : <div style={{ display: 'flex', width: 140, height: 140, borderRadius: 10, background: S100, border: `2px dashed ${S200}` }} />}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: S400, marginTop: 8, textTransform: 'uppercase', textAlign: 'center', width: 270, ...clamp(mode, 1) }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Credential id */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '8px 36px 0', height: 38, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: S400, textTransform: 'uppercase' }}>Credential</div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 2, color: p.code ? INK : S400 }}>{p.code || '— — — —'}</div>
      </div>

      {/* Org footer */}
      <div style={{ display: 'flex', boxSizing: 'border-box', alignItems: 'center', gap: 16, padding: '0 36px', height: 92, marginTop: 'auto', flexShrink: 0, background: '#0b1220' }}>
        {p.orgLogoUrl && (
          <div style={{ display: 'flex', boxSizing: 'border-box', width: 60, height: 60, borderRadius: 12, background: '#fff', padding: 5, alignItems: 'center', justifyContent: 'center' }}>
            <img src={p.orgLogoUrl} width={50} height={50} style={{ objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: '#64748b', textTransform: 'uppercase' }}>Issued by</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2, ...clamp(mode, 1) }}>{p.orgName}</div>
        </div>
        {p.orgSite && <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: '#64748b', flexShrink: 0 }}>{p.orgSite}</div>}
      </div>

      {/* NOT VALID overprint. Drawn last so it sits over everything, and deliberately
          ugly: a pending card that looks tidy is a pending card someone will try to
          wear through a gate. */}
      {!approved && (
        <div style={{ display: 'flex', position: 'absolute', left: -80, top: 560, width: CRED_W + 160, height: 100, background: p.status === 'declined' ? 'rgba(190,18,60,0.92)' : 'rgba(15,23,42,0.86)', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-14deg)' }}>
          <div style={{ display: 'flex', fontSize: 42, fontWeight: 800, letterSpacing: 5, color: '#fff', textTransform: 'uppercase' }}>
            {p.status === 'declined' ? 'Not approved' : 'Not valid yet'}
          </div>
        </div>
      )}
    </div>
  )
}
