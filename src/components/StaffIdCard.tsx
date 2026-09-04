'use client'

// The staff ID card, as one shared component — used three places, same pixels:
// the live preview that builds while someone fills the signup form (like the
// player card on the player waiver form), the finished card on the signup
// welcome screen, and /dashboard/staff/id-card for printing.
// Authored at CR80 badge size (204×324 css px = 2.125in × 3.375in at 96dpi);
// `scale` blows it up for screens, print renders it unscaled.

import React from 'react'

export const STAFF_ROLE_THEMES: Record<string, { label: string; color: string }> = {
  ref: { label: 'REFEREE', color: '#0f766e' },
  scorekeeper: { label: 'SCOREKEEPER', color: '#b45309' },
  athletic_trainer: { label: 'ATHLETIC TRAINER', color: '#be123c' },
  field_ops: { label: 'FIELD OPS', color: '#334155' },
  assigner: { label: 'ASSIGNER', color: '#0f766e' },
}

export const STAFF_CERT_LABELS: Record<string, string> = { youth: 'Youth certified', hs: 'High School certified', college: 'College certified' }

export default function StaffIdCard({ cardId, name, defaultRole, certLevel, association, events, orgName, photoUrl, qrDataUrl, workerId, scale = 1 }: {
  cardId?: string
  name: string
  defaultRole: string
  certLevel?: string
  association?: string | null
  events: string[]
  orgName: string
  photoUrl?: string | null
  qrDataUrl?: string | null
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

  return (
    <div style={{ width: 204 * scale, height: 324 * scale }}>
      <div id={cardId} style={{
        width: 204, height: 324, background: '#ffffff', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(15,23,42,0.18)', position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top left',
        fontFamily: 'system-ui, sans-serif', borderLeft: `5px solid ${theme.color}`, boxSizing: 'border-box',
      }}>
        <div style={{ background: '#0f1f3d', height: 74, padding: '8px 12px 0 12px', boxSizing: 'border-box' }}>
          <div style={{ width: 24, height: 7, background: '#f1f5f9', borderRadius: 999, margin: '0 auto' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#14b8a6', color: '#fff', fontSize: 6.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{orgInitials}</div>
            <div>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>{orgName.toUpperCase()}</div>
              <div style={{ fontSize: 5.5, fontWeight: 700, color: '#2dd4bf', letterSpacing: '0.14em' }}>OFFICIAL EVENT STAFF · {season}</div>
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
          <div style={{ display: 'inline-block', marginTop: 4, background: theme.color, color: '#ffffff', fontSize: 6.5, fontWeight: 800, letterSpacing: '0.16em', borderRadius: 999, padding: '3px 10px' }}>{theme.label}</div>
          {certLine && <div style={{ fontSize: 6.5, color: '#64748b', marginTop: 4 }}>{certLine}</div>}
        </div>
        <div style={{ margin: '8px 12px 0 12px', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
          <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>WORKING</div>
          {events.length ? events.slice(0, 3).map(e => (
            <div key={e} style={{ fontSize: 7, fontWeight: 700, color: '#334155', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e}</div>
          )) : (
            <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 2 }}>Season staff</div>
          )}
          {events.length > 3 && <div style={{ fontSize: 6, color: '#94a3b8', marginTop: 1 }}>+{events.length - 3} more</div>}
        </div>
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>STAFF ID</div>
            <div style={{ fontSize: 8, fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>{staffId}</div>
            <div style={{ fontSize: 5, color: '#94a3b8', marginTop: 2 }}>Scan to verify</div>
          </div>
          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qrDataUrl} alt="Verify QR" style={{ width: 44, height: 44, borderRadius: 4, border: '1px solid #e2e8f0' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 4, border: '1.5px dashed #cbd5e1', background: '#f8fafc' }} />
          )}
        </div>
      </div>
    </div>
  )
}
