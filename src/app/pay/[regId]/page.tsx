'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import StripePayPanel, { type PayMethod } from '@/components/StripePayPanel'

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type PayInfo = {
  clubName: string; teamCount: number
  teams: { team: string; division: string }[]
  tournamentId: string; tournamentName: string; tournamentDates: string; location: string; logoUrl: string
  due: number; paid: number; balance: number; paidInFull: boolean; noInvoice: boolean
}

export default function PayPage() {
  const params = useParams() as { regId: string }
  const regId = params.regId
  const [info, setInfo] = useState<PayInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'notfound' | 'ready' | 'paid' | 'success' | 'initiated' | 'microdeposits'>('loading')
  const [method, setMethod] = useState<'' | PayMethod>('')
  const [microUrl, setMicroUrl] = useState('')

  const balance = info?.balance || 0
  const cardTotal = Math.round(balance * 1.03 * 100) / 100
  const totalForMethod = method === 'ach' ? balance : cardTotal

  useEffect(() => {
    if (!regId) return
    fetch(`/api/registrations/${regId}/pay-info`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: PayInfo) => {
        setInfo(d)
        setStatus(d.balance <= 0 ? 'paid' : 'ready')
      })
      .catch(() => setStatus('notfound'))
  }, [regId])

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">{children}</div>
    </div>
  )

  if (status === 'loading') return shell(<div className="text-center py-24 text-slate-400">Loading…</div>)

  if (status === 'notfound') return shell(
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <AlertCircle className="mx-auto text-slate-300 mb-3" size={36} />
      <h1 className="text-lg font-bold text-slate-800 mb-1">Payment link not found</h1>
      <p className="text-sm text-slate-500">This link doesn&apos;t match a registration. Please contact the tournament for a new link.</p>
    </div>
  )

  const header = info && (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-4">
        {info.logoUrl && <img src={info.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain bg-white border border-gray-100" />}
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-800 truncate">{info.tournamentName}</h1>
          <p className="text-sm text-slate-500 truncate">{[info.tournamentDates, info.location].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
    </div>
  )

  if (status === 'paid') return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <CheckCircle2 className="mx-auto text-green-500 mb-3" size={36} />
      <h2 className="text-lg font-bold text-slate-800 mb-1">{info?.noInvoice ? 'No balance due' : 'Paid in full'}</h2>
      <p className="text-sm text-slate-500">
        {info?.noInvoice
          ? `There's no balance on file for ${info?.clubName || 'this registration'} right now. If that seems wrong, contact the tournament.`
          : `${info?.clubName || 'This registration'} is all paid up — nothing else due. See you on the field!`}
      </p>
    </div>
  </>)

  if (status === 'success') return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <CheckCircle2 className="mx-auto text-green-500 mb-3" size={36} />
      <h2 className="text-lg font-bold text-slate-800 mb-1">Payment received — thank you!</h2>
      <p className="text-sm text-slate-500">We&apos;ve recorded {fmt(totalForMethod)} for {info?.clubName}. See you on the field!</p>
    </div>
  </>)

  if (status === 'initiated') return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <Clock className="mx-auto text-teal-500 mb-3" size={36} />
      <h2 className="text-lg font-bold text-slate-800 mb-1">Bank transfer (ACH) initiated</h2>
      <p className="text-sm text-slate-500 leading-relaxed">
        Your payment of {fmt(balance)} for {info?.clubName} is on its way — ACH transfers typically clear within
        4 business days, and we&apos;ll mark your registration paid automatically once it does. You can close this page.
      </p>
    </div>
  </>)

  if (status === 'microdeposits') return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      <Clock className="mx-auto text-teal-500 mb-3" size={36} />
      <h2 className="text-lg font-bold text-slate-800 mb-1">One more step — verify your bank account</h2>
      <p className="text-sm text-slate-500 leading-relaxed">
        Stripe is sending a small deposit to your account (1–2 business days). Follow the instructions in the email
        you&apos;ll receive to confirm it{microUrl ? <> or <a href={microUrl} className="text-teal-600 underline" target="_blank" rel="noreferrer">verify here</a></> : null} — your payment completes after that.
      </p>
    </div>
  </>)

  return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Invoice</h2>
      <div className="text-sm text-gray-500 mb-3">{info?.clubName} &middot; {info?.teamCount} team{info?.teamCount !== 1 ? 's' : ''}</div>
      {(info?.teams?.length || 0) > 0 && (
        <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
          {info!.teams.map((t, i) => (
            <div key={i} className={`flex justify-between items-center px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <span className="text-gray-700 font-medium">{t.team || `Team ${i + 1}`}</span>
              <span className="text-gray-400 text-xs">{t.division}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600"><span>Invoiced</span><span>{fmt(info?.due || 0)}</span></div>
        <div className="flex justify-between text-gray-600"><span>Paid to date</span><span>{fmt(info?.paid || 0)}</span></div>
        <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Balance due</span><span>{fmt(balance)}</span></div>
        {method === 'card' && <>
          <div className="flex justify-between text-gray-400 text-xs"><span>Card processing fee (3%)</span><span>+{fmt(cardTotal - balance)}</span></div>
          <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(cardTotal)}</span></div>
        </>}
        {method === 'ach' && <>
          <div className="flex justify-between text-teal-600 text-xs"><span>Bank transfer (ACH) — no processing fee</span><span>+$0.00</span></div>
          <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(balance)}</span></div>
        </>}
      </div>
    </div>

    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Payment</h2>
      <StripePayPanel
        registrationId={regId}
        balance={balance}
        clubName={info?.clubName || ''}
        tournamentName={info?.tournamentName || ''}
        onMethodChange={setMethod}
        onCardSuccess={() => setStatus('success')}
        onAchProcessing={() => setStatus('initiated')}
        onAchMicrodeposits={url => { setMicroUrl(url); setStatus('microdeposits') }}
        onAchSuccess={() => setStatus('success')}
      />
    </div>
  </>)
}
