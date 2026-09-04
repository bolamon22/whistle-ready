'use client'

// Printable staff ID card (approved "Credential" layout, role-themed) — the card
// itself is the shared <StaffIdCard> component, also used as the live preview on
// the /join signup form and on its welcome screen. Print-CSS visibility trick
// hides the app chrome so the badge prints at true CR80 size.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Printer, ArrowLeft } from 'lucide-react'
import StaffIdCard from '@/components/StaffIdCard'

type Portal = {
  worker: { id: string; name: string; defaultRole: string; roles: string[]; photoUrl?: string | null; certLevel?: string; association?: string | null } | null
  events: { id: string; name: string; startDate: string; working: boolean }[]
  orgName?: string | null
}

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

  return (
    <div className="max-w-md mx-auto pb-10">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #staff-card, #staff-card * { visibility: visible !important; }
          #staff-card { position: fixed !important; left: 0.5in; top: 0.5in; margin: 0; box-shadow: none !important; transform: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-5 print:hidden">
        <Link href="/dashboard/staff" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> My portal</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold px-4 py-2 rounded-xl"><Printer size={16} /> Print my ID</button>
      </div>

      <div className="flex justify-center">
        <StaffIdCard
          cardId="staff-card"
          scale={1.7}
          name={w.name}
          defaultRole={w.defaultRole}
          certLevel={w.certLevel}
          association={w.association}
          events={(portal?.events ?? []).filter(e => e.working).map(e => e.name)}
          orgName={portal?.orgName || 'Whistle Ready'}
          photoUrl={w.photoUrl}
          qrDataUrl={qr || null}
          workerId={w.id}
        />
      </div>

      <p className="text-center text-xs text-slate-400 mt-4 print:hidden">Prints at true badge size (2.125″ × 3.375″) — cut along the card edge and punch the marked hole for a lanyard.</p>
    </div>
  )
}
