'use client'

// Staff view of the Stripe reconcile — money Stripe took that the app never
// recorded, with a button to write each row. Built after the 10 Sep 2026 webhook
// outage, which ran nine days before anyone noticed. Static route, so it never
// collides with /staff/[id].

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, ExternalLink, RefreshCw } from 'lucide-react'

type Gap = {
  piId: string
  createdAt: string
  charged: number
  amount: number
  method: 'ach' | 'credit_card'
  kind: 'team' | 'individual' | 'vendor'
  targetId: string
  label: string
  context: string
}

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const KIND_LABEL: Record<Gap['kind'], string> = { team: 'Club', individual: 'Player', vendor: 'Vendor' }

export default function PaymentsReconcilePage() {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [scanned, setScanned] = useState(0)
  const [since, setSince] = useState('')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState<string[]>([])

  const load = useCallback(async (d: number) => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/payments/reconcile?days=${d}`)
      const data = await res.json()
      if (!res.ok || !data.ok) { setError(data?.error || 'Could not reach Stripe'); setGaps([]) }
      else { setGaps(data.gaps || []); setScanned(data.scanned || 0); setSince(data.since || '') }
    } catch {
      setError('Could not reach Stripe')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(days) }, [load, days])

  async function record(g: Gap) {
    setBusy(g.piId)
    try {
      const res = await fetch('/api/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piId: g.piId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Could not record it'); return }
      setDone(prev => [...prev, g.piId])
      setGaps(prev => prev.filter(x => x.piId !== g.piId))
      toast.success(`Recorded ${money(g.amount)} for ${g.label}`)
    } catch {
      toast.error('Could not record it')
    } finally {
      setBusy('')
    }
  }

  const total = gaps.reduce((s, g) => s + g.amount, 0)

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment reconcile</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Payments Stripe processed that never made it into a registration.
            </p>
          </div>
          <Link href="/dashboard/org" className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors">
            ← Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {[30, 60, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${days === d ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              Last {d} days
            </button>
          ))}
          <button onClick={() => load(days)} disabled={loading}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Check again
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-5 flex gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-800">{error}</p>
              <p className="text-xs text-rose-600 mt-1">Check that STRIPE_SECRET_KEY and STRIPE_ACCOUNT_ID are set in Vercel.</p>
            </div>
          </div>
        )}

        {loading && !gaps.length && !error && (
          <p className="text-sm text-slate-400 py-10 text-center">Asking Stripe what it charged…</p>
        )}

        {!loading && !error && !gaps.length && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <Check size={26} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Everything Stripe charged is recorded</p>
            <p className="text-xs text-slate-400 mt-1">
              Checked {scanned} payment{scanned === 1 ? '' : 's'} since {since || 'the start of the window'}.
              {done.length > 0 && ` You recorded ${done.length} just now.`}
            </p>
          </div>
        )}

        {!!gaps.length && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-semibold text-amber-900">
                {gaps.length} payment{gaps.length === 1 ? '' : 's'} totaling {money(total)} are missing from the app
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Almost always this means the Stripe webhook is switched off. Recording them here fixes the books;
                re-enabling the webhook is what stops it recurring.
              </p>
              <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-amber-800 hover:underline mt-2 inline-flex items-center gap-1">
                Open Stripe webhooks <ExternalLink size={11} />
              </a>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {gaps.map((g, i) => (
                <div key={g.piId}
                  className={`flex items-center gap-4 px-5 py-3.5 flex-wrap ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                  <div className="text-xs text-slate-400 w-20 shrink-0">{g.createdAt}</div>
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-sm font-semibold text-slate-800">{g.label}</div>
                    <div className="text-xs text-slate-400">
                      {KIND_LABEL[g.kind]}
                      {g.context ? ` · ${g.context}` : ''}
                      {' · '}
                      {g.method === 'ach' ? 'Bank transfer' : 'Card'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-900">{money(g.amount)}</div>
                    {g.charged > g.amount && (
                      <div className="text-xs text-slate-400">charged {money(g.charged)}</div>
                    )}
                  </div>
                  <button onClick={() => record(g)} disabled={!!busy}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 shrink-0">
                    {busy === g.piId ? 'Recording…' : 'Record it'}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 mt-3">
              Recording writes the payment against the club or player using the date Stripe took it, not today,
              and sends the usual payment heads-up. Safe to run twice — a payment already on file is skipped.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
