'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CheckCircle2, AlertCircle } from 'lucide-react'

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type PayInfo = {
  clubName: string; teamCount: number
  tournamentId: string; tournamentName: string; tournamentDates: string; location: string; logoUrl: string
  due: number; paid: number; balance: number; paidInFull: boolean; noInvoice: boolean
}

// Card form (must be inside <Elements>). Mirrors the register-flow form; on
// success the server verifies the intent (stripeConfirm) before recording it.
function CardPayForm({ clientSecret, clubName, regId, total, onSuccess }: {
  clientSecret: string; clubName: string; regId: string; total: number; onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [cardError, setCardError] = useState('')

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) {
      setCardError('The payment form is still loading — give it a few seconds. If this persists, refresh and try again.')
      return
    }
    setPaying(true); setCardError('')
    const card = elements.getElement(CardElement)!
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card, billing_details: { name: clubName } },
    })
    if (error) { setCardError(error.message || 'Payment failed'); setPaying(false); return }
    if (paymentIntent?.status === 'succeeded') {
      try {
        await fetch(`/api/registrations/${regId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripeConfirm: paymentIntent.id }),
        })
      } catch { /* payment succeeded on Stripe; staff can reconcile if recording missed */ }
      onSuccess()
    }
    setPaying(false)
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Card Details</label>
        <div className="border border-gray-200 rounded-xl px-4 py-3.5 bg-white">
          <CardElement options={{
            style: {
              base: {
                fontSize: '15px',
                color: '#374151',
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
                '::placeholder': { color: '#9CA3AF' },
                iconColor: '#6B7280',
              },
              invalid: { color: '#EF4444' },
            },
          }} />
        </div>
        {cardError && <p className="text-red-500 text-sm mt-1.5">{cardError}</p>}
      </div>
      <button type="submit" disabled={paying || !stripe}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
        {paying ? 'Processing…' : `Pay ${fmt(total)}`}
      </button>
      <p className="text-xs text-gray-400 text-center">Payments are processed securely by Stripe.</p>
    </form>
  )
}

export default function PayPage() {
  const params = useParams() as { regId: string }
  const regId = params.regId
  const [info, setInfo] = useState<PayInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'notfound' | 'ready' | 'paid' | 'success'>('loading')
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [payError, setPayError] = useState('')

  const total = info ? Math.round(info.balance * 1.03 * 100) / 100 : 0

  useEffect(() => {
    if (!regId) return
    fetch(`/api/registrations/${regId}/pay-info`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(async (d: PayInfo) => {
        setInfo(d)
        if (d.balance <= 0) { setStatus('paid'); return }
        const amountWithFee = Math.round(d.balance * 1.03 * 100) / 100
        const res = await fetch('/api/stripe/create-team-intent', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountWithFee, baseAmount: d.balance,
            tournamentName: d.tournamentName, clubName: d.clubName, registrationId: regId,
          }),
        })
        const intent = await res.json().catch(() => ({}))
        if (!res.ok || !intent.clientSecret) {
          setPayError(intent.error || 'Could not start the payment — please contact the tournament.')
        } else {
          setStripePromise(loadStripe(intent.publishableKey, intent.accountId ? { stripeAccount: intent.accountId } : undefined))
          setClientSecret(intent.clientSecret)
        }
        setStatus('ready')
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
      <p className="text-sm text-slate-500">We&apos;ve recorded {fmt(total)} for {info?.clubName}. Your card statement will show the charge from the tournament. See you on the field!</p>
    </div>
  </>)

  return shell(<>
    {header}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Balance Summary</h2>
      <div className="text-sm text-gray-500 mb-3">{info?.clubName} &middot; {info?.teamCount} team{info?.teamCount !== 1 ? 's' : ''}</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600"><span>Invoiced</span><span>{fmt(info?.due || 0)}</span></div>
        <div className="flex justify-between text-gray-600"><span>Paid to date</span><span>{fmt(info?.paid || 0)}</span></div>
        <div className="flex justify-between text-gray-600 font-medium"><span>Balance due</span><span>{fmt(info?.balance || 0)}</span></div>
        <div className="flex justify-between text-gray-400 text-xs"><span>Card processing fee (3%)</span><span>+{fmt(total - (info?.balance || 0))}</span></div>
        <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(total)}</span></div>
      </div>
    </div>
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-bold text-gray-800 mb-5 pb-2 border-b border-gray-100">Payment</h2>
      {stripePromise && clientSecret ? (
        <Elements stripe={stripePromise}>
          <CardPayForm
            clientSecret={clientSecret}
            clubName={info?.clubName || ''}
            regId={regId}
            total={total}
            onSuccess={() => setStatus('success')}
          />
        </Elements>
      ) : (
        <p className="text-sm text-red-500">{payError || 'Payment is unavailable right now — please contact the tournament.'}</p>
      )}
    </div>
  </>)
}
