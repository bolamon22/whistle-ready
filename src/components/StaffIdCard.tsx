'use client'

// The staff ID card, as one shared component — used three places, same pixels:
// the live preview that builds while someone fills the signup form (like the
// player card on the player waiver form), the finished card on the signup
// welcome screen, and /dashboard/staff/id-card for printing.
// Authored at CR80 badge size (204×324 css px = 2.125in × 3.375in at 96dpi);
// `scale` blows it up for screens, print renders it unscaled.

import React from 'react'

// Bo's role palette (Sep 4): the whole header changes with the role, not just the
// rail — black refs (stripes energy), yellow scorekeepers, red athletic trainers /
// medical, blue field ops. Yellow gets dark text; the rest run white-on-color.
export const STAFF_ROLE_THEMES: Record<string, { label: string; color: string; header: string; headerText: string; headerSub: string; pillText: string }> = {
  ref: { label: 'REFEREE', color: '#111827', header: '#111827', headerText: '#ffffff', headerSub: '#9ca3af', pillText: '#ffffff' },
  scorekeeper: { label: 'SCOREKEEPER', color: '#facc15', header: '#facc15', headerText: '#0f172a', headerSub: '#854d0e', pillText: '#713f12' },
  athletic_trainer: { label: 'ATHLETIC TRAINER', color: '#dc2626', header: '#dc2626', headerText: '#ffffff', headerSub: '#fecaca', pillText: '#ffffff' },
  field_ops: { label: 'FIELD OPS', color: '#2563eb', header: '#2563eb', headerText: '#ffffff', headerSub: '#bfdbfe', pillText: '#ffffff' },
  assigner: { label: 'ASSIGNER', color: '#0f766e', header: '#0f1f3d', headerText: '#ffffff', headerSub: '#2dd4bf', pillText: '#ffffff' },
}

export const STAFF_CERT_LABELS: Record<string, string> = { youth: 'Youth certified', hs: 'High School certified', college: 'College certified' }

export default function StaffIdCard({ cardId, name, defaultRole, gender, certLevel, association, events, orgName, photoUrl, qrDataUrl, appQrDataUrl, workerId, scale = 1 }: {
  cardId?: string
  name: string
  defaultRole: string
  gender?: string
  certLevel?: string
  association?: string | null
  events: { name: string; logoUrl?: string | null }[]
  orgName: string
  photoUrl?: string | null
  qrDataUrl?: string | null
  appQrDataUrl?: string | null
  workerId?: string | null
  scale?: number
}) {
  const theme = STAFF_ROLE_THEMES[defaultRole] ?? STAFF_ROLE_THEMES.ref
  const orgInitials = orgName.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase() || 'STF'
  const year = new Date().getFullYear()
  const season = `${year}–${String(year + 1).slice(2)}`
  const staffId = workerId
    ? `${orgInitials}-${year}-${workerId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`
    : `${orgInitials}-${year}-····`
  const initials = (name.trim() || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()
  const certLine = [STAFF_CERT_LABELS[certLevel ?? ''], association || ''].filter(Boolean).join(' · ')
  // Refs only (callers pass gender just for them): list BOTH when they work both.
  const genderParts = gender === 'both' ? ['BOYS', 'GIRLS'] : gender === 'boys' ? ['BOYS'] : gender === 'girls' ? ['GIRLS'] : []

  return (
    <div style={{ width: 204 * scale, height: 324 * scale }}>
      <div id={cardId} style={{
        width: 204, height: 324, background: '#ffffff', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(15,23,42,0.18)', position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top left',
        fontFamily: 'system-ui, sans-serif', borderLeft: `5px solid ${theme.color}`, boxSizing: 'border-box',
      }}>
        <div style={{ background: theme.header, height: 74, padding: '8px 12px 0 12px', boxSizing: 'border-box' }}>
          <div style={{ width: 24, height: 7, background: '#f1f5f9', borderRadius: 999, margin: '0 auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#14b8a6', color: '#fff', fontSize: 6.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{orgInitials}</div>
            <div>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: theme.headerText, letterSpacing: '0.02em' }}>{orgName.toUpperCase()}</div>
              <div style={{ fontSize: 5.5, fontWeight: 700, color: theme.headerSub, letterSpacing: '0.14em' }}>OFFICIAL EVENT STAFF · {season}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -24 }}>
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="" style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover', border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(15,23,42,0.18)', background: '#e2e8f0' }} />
          ) : (
            <div style={{ width: 84, height: 84, borderRadius: 14, border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(15,23,42,0.18)', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#94a3b8' }}>{initials}</div>
          )}
        </div>
        <div style={{ textAlign: 'center', padding: '6px 12px 0 12px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name.trim() || 'Your name'}</div>
          <div style={{ display: 'inline-block', marginTop: 4, background: theme.color, color: theme.pillText, fontSize: 6.5, fontWeight: 800, letterSpacing: '0.16em', borderRadius: 999, padding: '3px 10px' }}>{theme.label}</div>
          {genderParts.length > 0 && (
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
              {genderParts.map(g => (
                <span key={g} style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: '0.1em', color: '#334155', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 7px' }}>{g}</span>
              ))}
            </div>
          )}
          {certLine && <div style={{ fontSize: 6.5, color: '#64748b', marginTop: 4 }}>{certLine}</div>}
        </div>
        <div style={{ margin: '8px 12px 0 12px', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
          <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>WORKING</div>
          {events.length ? events.slice(0, 3).map(e => (
            <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              {e.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.logoUrl} alt="" style={{ width: 11, height: 11, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '0.5px solid #e2e8f0' }} />
              ) : null}
              <span style={{ fontSize: 7, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
            </div>
          )) : (
            <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 2 }}>Season staff</div>
          )}
          {events.length > 3 && <div style={{ fontSize: 6, color: '#94a3b8', marginTop: 1 }}>+{events.length - 3} more</div>}
        </div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>STAFF ID</div>
            <div style={{ fontSize: 8, fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>{staffId}</div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
            {appQrDataUrl && (
              <div style={{ textAlign: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={appQrDataUrl} alt="Open the game-day app" style={{ width: 38, height: 38, borderRadius: 4, border: '1px solid #e2e8f0', display: 'block' }} />
                <div style={{ fontSize: 4.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', marginTop: 2 }}>GAME DAY</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              {qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qrDataUrl} alt="Verify QR" style={{ width: 38, height: 38, borderRadius: 4, border: '1px solid #e2e8f0', display: 'block' }} />
              ) : (
                <div style={{ width: 38, height: 38, borderRadius: 4, border: '1.5px dashed #cbd5e1', background: '#f8fafc' }} />
              )}
              <div style={{ fontSize: 4.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', marginTop: 2 }}>VERIFY</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
