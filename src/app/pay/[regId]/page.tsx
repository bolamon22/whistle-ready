'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Toaster } from 'react-hot-toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CheckCircle2, AlertCircle, CreditCard, Landmark, Clock, Lock } from 'lucide-react'

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type PayInfo = {
  clubName: string; teamCount: number
  teams: { team: string; division: string }[]
  tournamentId: string; tournamentName: string; tournamentDates: string; location: string; logoUrl: string
  due: number; paid: number; balance: number; paidInFull: boolean; noInvoice: boolean
}
type Method = 'card' | 'ach'
type StripePromise = ReturnType<typeof loadStripe>

// ── Card form (inside <Elements>). On success the server verifies the intent
// (stripeConfirm) before recording it. ──
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
      } catch { /* payment succeeded on Stripe; the webhook records it as backup */ }
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
    </form>
  )
}

// ── ACH flow: instant bank login via Stripe Financial Connections (manual entry
// + microdeposits as fallback inside Stripe's modal). Settles in ~4 business
// days; the webhook records the payment when it clears. ──
function AchPayForm({ stripePromise, clientSecret, clubName, tournamentName, regId, total, onProcessing, onMicrodeposits, onSuccess }: {
  stripePromise: StripePromise; clientSecret: string; clubName: string; tournamentName: string
  regId: string; total: number
  onProcessing: () => void; onMicrodeposits: (url: string) => void; onSuccess: () => void
}) {
  const [name, setName] = useState(clubName)
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<'collect' | 'confirm'>('collect')
  const [bankLabel, setBankLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function connectBank(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Please enter the account holder name.'); return }
    if (!/.+@.+\..+/.test(email)) { setErr('Please enter a valid email — your bank confirmation goes there.'); return }
    setBusy(true); setErr('')
    try {
      const stripe: any = await stripePromise
      if (!stripe) throw new Error('Payment form failed to load — refresh and try again.')
      const { paymentIntent, error } = await stripe.collectBankAccountForPayment({
        clientSecret,
        params: {
          payment_method_type: 'us_bank_account',
          payment_method_data: { billing_details: { name: name.trim(), email: email.trim() } },
        },
        expand: ['payment_method'],
      })
      if (error) { setErr(error.message || 'Could not connect the bank account.'); setBusy(false); return }
      if (!paymentIntent || paymentIntent.status === 'requires_payment_method') { setBusy(false); return } // user closed the modal
      if (paymentIntent.status === 'requires_confirmation') {
        const pm: any = paymentIntent.payment_method
        setBankLabel(pm?.us_bank_account ? `${pm.us_bank_account.bank_name || 'Bank account'} ••••${pm.us_bank_account.last4 || ''}` : 'your bank account')
        setStage('confirm')
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not connect the bank account.')
    }
    setBusy(false)
  }

  async function confirmDebit() {
    setBusy(true); setErr('')
    try {
      const stripe: any = await stripePromise
      const { paymentIntent, error } = await stripe.confirmUsBankAccountPayment(clientSecret)
      if (error) { setErr(error.message || 'Payment failed'); setBusy(false); return }
      const status = paymentIntent?.status
      if (status === 'processing') { onProcessing(); return }
      if (status === 'requires_action' && paymentIntent?.next_action?.type === 'verify_with_microdeposits') {
        onMicrodeposits(paymentIntent.next_action.verify_with_microdeposits?.hosted_verification_url || '')
        return
      }
      if (status === 'succeeded') {
        try {
          await fetch(`/api/registrations/${regId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stripeConfirm: paymentIntent.id }),
          })
        } catch {}
        onSuccess()
        return
      }
      setErr('The bank payment could not be completed. Please try again or use a card.')
    } catch (e: any) {
      setErr(e?.message || 'Payment failed')
    }
    setBusy(false)
  }

  if (stage === 'confirm') return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Landmark size={18} className="text-teal-600 flex-shrink-0" />
        <div className="text-sm font-medium text-slate-700">{bankLabel}</div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        By clicking Pay, you authorize {tournamentName || 'the tournament'} (Sunshine Events Group) to debit the bank
        account above for this one-time payment of {fmt(total)}. If the debit is returned unpaid, it may be re-presented.
      </p>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      <button onClick={confirmDebit} disabled={busy}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors">
        {busy ? 'Processing…' : `Pay ${fmt(total)}`}
      </button>
      <p className="text-xs text-gray-400 text-center">ACH payments take about 4 business days to clear.</p>
    </div>
  )

  return (
    <form onSubmit={connectBank} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account holder name</label>
          <input className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            value={name} onChange={e => setName(e.target.value)} placeholder="Name on the bank account" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            value={email} onChange={e => setEmail(e.target.value)} placeholder="you@club.com" />
        </div>
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
        <Landmark size={16} /> {busy ? 'Opening…' : 'Connect bank account'}
      </button>
      <p className="text-xs text-gray-400 text-center">You&apos;ll securely log in to your bank through Stripe — no routing numbers to type. Manual entry is available too.</p>
    </form>
  )
}

export default function PayPage() {
  const params = useParams() as { regId: string }
  const regId = params.regId
  const [info, setInfo] = useState<PayInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'notfound' | 'ready' | 'paid' | 'success' | 'initiated' | 'microdeposits'>('loading')
  const [method, setMethod] = useState<'' | Method>('')
  const [creating, setCreating] = useState(false)
  const [stripePromise, setStripePromise] = useState<StripePromise | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [payError, setPayError] = useState('')
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

  async function chooseMethod(m: Method) {
    if (creating || !info) return
    setMethod(m); setClientSecret(''); setPayError(''); setCreating(true)
    try {
      const amount = m === 'ach' ? info.balance : Math.round(info.balance * 1.03 * 100) / 100
      const res = await fetch('/api/stripe/create-team-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount, baseAmount: info.balance,
          tournamentName: info.tournamentName, clubName: info.clubName, registrationId: regId,
          ...(m === 'ach' ? { paymentMethodType: 'us_bank_account' } : {}),
        }),
      })
      const intent = await res.json().catch(() => ({}))
      if (!res.ok || !intent.clientSecret) {
        setPayError(intent.error || 'Could not start the payment — please contact the tournament.')
      } else {
        setStripePromise(loadStripe(intent.publishableKey, intent.accountId ? { stripeAccount: intent.accountId } : undefined))
        setClientSecret(intent.clientSecret)
      }
    } catch {
      setPayError('Could not start the payment — please contact the tournament.')
    }
    setCreating(false)
  }

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
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button type="button" onClick={() => chooseMethod('ach')} disabled={creating}
          className={`rounded-xl border-2 p-4 text-left transition-colors ${method === 'ach' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm"><Landmark size={16} className="text-teal-600" /> Bank transfer (ACH)</div>
          <div className="text-xs text-teal-600 font-medium mt-1">No fee — pay {fmt(balance)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Clears in ~4 business days</div>
        </button>
        <button type="button" onClick={() => chooseMethod('card')} disabled={creating}
          className={`rounded-xl border-2 p-4 text-left transition-colors ${method === 'card' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm"><CreditCard size={16} className="text-teal-600" /> Card</div>
          <div className="text-xs text-gray-500 font-medium mt-1">3% fee — pay {fmt(cardTotal)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Instant confirmation</div>
        </button>
      </div>

      {creating && <p className="text-sm text-slate-400 text-center py-3">Setting up payment…</p>}
      {!creating && payError && method && <p className="text-sm text-red-500">{payError}</p>}
      {!creating && !payError && method === 'card' && stripePromise && clientSecret && (
        <Elements stripe={stripePromise}>
          <CardPayForm clientSecret={clientSecret} clubName={info?.clubName || ''} regId={regId} total={cardTotal} onSuccess={() => setStatus('success')} />
        </Elements>
      )}
      {!creating && !payError && method === 'ach' && stripePromise && clientSecret && (
        <AchPayForm
          stripePromise={stripePromise} clientSecret={clientSecret}
          clubName={info?.clubName || ''} tournamentName={info?.tournamentName || ''}
          regId={regId} total={balance}
          onProcessing={() => setStatus('initiated')}
          onMicrodeposits={url => { setMicroUrl(url); setStatus('microdeposits') }}
          onSuccess={() => setStatus('success')}
        />
      )}
      {!method && !creating && <p className="text-xs text-gray-400 text-center">Choose how you&apos;d like to pay.</p>}
      <p className="text-xs text-gray-400 text-center mt-5 pt-4 border-t border-gray-100 flex items-center justify-center gap-1.5">
        <Lock size={12} className="flex-shrink-0" /> Payments are processed securely by <span className="font-semibold text-gray-500">Stripe</span> — your card and bank details are never shared with the tournament.
      </p>
    </div>
  </>)
}
