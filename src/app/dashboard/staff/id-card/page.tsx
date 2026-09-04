'use client'

// Printable staff ID card (Bo approved the "Credential" layout, Sep 4): one white
// card, themed per role — teal ref / amber scorekeeper / rose trainer / slate field
// ops — so each group's card reads a little different. CR80 badge size: the card is
// authored at 204×324 css px = 2.125in × 3.375in at 96dpi; screen shows it scaled
// up, print renders it at true size (the visibility trick hides the app chrome).

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Printer, ArrowLeft } from 'lucide-react'

type Portal = {
  worker: { id: string; name: string; defaultRole: string; roles: string[]; photoUrl?: string | null; certLevel?: string; association?: string | null } | null
  events: { id: string; name: string; startDate: string; working: boolean }[]
  orgName?: string | null
}

const ROLE_THEMES: Record<string, { label: string; color: string }> = {
  ref: { label: 'REFEREE', color: '#0f766e' },
  scorekeeper: { label: 'SCOREKEEPER', color: '#b45309' },
  athletic_trainer: { label: 'ATHLETIC TRAINER', color: '#be123c' },
  field_ops: { label: 'FIELD OPS', color: '#334155' },
  assigner: { label: 'ASSIGNER', color: '#0f766e' },
}

const CERT_LABELS: Record<string, string> = { youth: 'Youth certified', hs: 'High School certified', college: 'College certified' }

export default function StaffIdCardPage() {
  const { status } = useSession()
  const [portal, setPortal] = useState<Portal | null>(null)
  const [loading, setLoading] = useState(true)
  const [qr, setQr] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/staff-portal').then(r => r.ok ? r.json() : null).then(p => { setPortal(p); setLoading(false) }).catch(() => setLoading(false))
  }, [status])

  useEffect(() => {
    const id = portal?.worker?.id
    if (!id) return
    const url = `${window.location.origin}/verify/${id}`
    import('qrcode').then(m => m.default.toDataURL(url, { width: 220, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then(setQr).catch(() => setQr(''))
  }, [portal?.worker?.id])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const w = portal?.worker
  if (!w) return (
    <div className="max-w-md mx-auto p-8 text-center">
      <p className="text-sm text-slate-500">Your login isn't linked to a staff record yet — contact your coordinator.</p>
      <Link href="/dashboard/staff" className="inline-block mt-4 text-sm font-semibold text-teal-700">← Back to my portal</Link>
    </div>
  )

  const theme = ROLE_THEMES[w.defaultRole] ?? ROLE_THEMES.ref
  const orgName = portal?.orgName || 'Whistle Ready'
  const orgInitials = orgName.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase() || 'STF'
  const season = (() => { const y = new Date().getFullYear(); return `${y}–${String(y + 1).slice(2)}` })()
  const staffId = `${orgInitials}-${new Date().getFullYear()}-${w.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`
  const initials = w.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()
  const working = (portal?.events ?? []).filter(e => e.working)
  const certLine = [CERT_LABELS[w.certLevel ?? ''], w.association || ''].filter(Boolean).join(' · ')

  return (
    <div className="max-w-md mx-auto pb-10">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #staff-card, #staff-card * { visibility: visible !important; }
          #staff-card { position: fixed !important; left: 0.5in; top: 0.5in; margin: 0; box-shadow: none !important; transform: none !important; }
          #card-spacer { height: auto !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-5 print:hidden">
        <Link href="/dashboard/staff" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> My portal</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl"><Printer size={16} /> Print my ID</button>
      </div>

      <div id="card-spacer" className="flex justify-center" style={{ height: 324 * 1.7 + 20 }}>
        <div id="staff-card" style={{
          width: 204, height: 324, background: '#ffffff', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(15,23,42,0.18)', position: 'relative', transform: 'scale(1.7)', transformOrigin: 'top center',
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
            {w.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={w.photoUrl} alt="" style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover', border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(15,23,42,0.18)', background: '#e2e8f0' }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 14, border: '3px solid #ffffff', boxShadow: '0 2px 8px rgba(15,23,42,0.18)', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#94a3b8' }}>{initials}</div>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '6px 12px 0 12px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>{w.name}</div>
            <div style={{ display: 'inline-block', marginTop: 4, background: theme.color, color: '#ffffff', fontSize: 6.5, fontWeight: 800, letterSpacing: '0.16em', borderRadius: 999, padding: '3px 10px' }}>{theme.label}</div>
            {certLine && <div style={{ fontSize: 6.5, color: '#64748b', marginTop: 4 }}>{certLine}</div>}
          </div>
          <div style={{ margin: '8px 12px 0 12px', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
            <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>WORKING</div>
            {working.length ? working.slice(0, 3).map(e => (
              <div key={e.id} style={{ fontSize: 7, fontWeight: 700, color: '#334155', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
            )) : (
              <div style={{ fontSize: 7, color: '#94a3b8', marginTop: 2 }}>Season staff</div>
            )}
            {working.length > 3 && <div style={{ fontSize: 6, color: '#94a3b8', marginTop: 1 }}>+{working.length - 3} more</div>}
          </div>
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 5.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em' }}>STAFF ID</div>
              <div style={{ fontSize: 8, fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>{staffId}</div>
              <div style={{ fontSize: 5, color: '#94a3b8', marginTop: 2 }}>Scan to verify</div>
            </div>
            {qr ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qr} alt="Verify QR" style={{ width: 44, height: 44, borderRadius: 4, border: '1px solid #e2e8f0' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc' }} />
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-2 print:hidden">Prints at true badge size (2.125″ × 3.375″) — cut along the card edge and punch the marked hole for a lanyard.</p>
    </div>
  )
}
