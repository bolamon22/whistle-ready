'use client'

// Public page behind the QR on printed staff ID cards: confirms the person is on
// the org's staff list. Shows only public-safe fields (see /api/verify-staff).

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ShieldCheck, ShieldX } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  ref: 'Referee', scorekeeper: 'Scorekeeper', field_ops: 'Field Ops', athletic_trainer: 'Athletic Trainer', assigner: 'Assigner',
}

export default function VerifyStaffPage() {
  const { workerId } = useParams() as { workerId: string }
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [data, setData] = useState<{ name: string; roles: string[]; orgName: string | null } | null>(null)

  useEffect(() => {
    fetch(`/api/verify-staff?id=${encodeURIComponent(workerId)}`)
      .then(async r => {
        if (!r.ok) { setState('missing'); return }
        setData(await r.json())
        setState('ok')
      })
      .catch(() => setState('missing'))
  }, [workerId])

  if (state === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Checking credential…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
        {state === 'ok' && data ? (
          <>
            <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center mx-auto">
              <ShieldCheck size={30} className="text-teal-700" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mt-4">{data.name}</h1>
            <div className="flex flex-wrap gap-1.5 justify-center mt-2">
              {data.roles.map(r => (
                <span key={r} className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1">{ROLE_LABELS[r] ?? r}</span>
              ))}
            </div>
            <p className="text-sm text-slate-500 mt-3">Verified event staff{data.orgName ? ` — ${data.orgName}` : ''}.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-200 flex items-center justify-center mx-auto">
              <ShieldX size={30} className="text-rose-600" />
            </div>
            <h1 className="text-lg font-bold text-slate-800 mt-4">Credential not found</h1>
            <p className="text-sm text-slate-500 mt-2">This ID doesn't match an active staff record. Check with the event director.</p>
          </>
        )}
      </div>
    </div>
  )
}
