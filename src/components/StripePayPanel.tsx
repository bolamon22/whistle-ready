'use client'
import { useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Landmark, Lock, Wallet } from 'lucide-react'

// Shared Stripe payment panel: method chooser (fee-free ACH vs card +3%),
// card form, ACH bank-login flow, and the trust badge. Used by the public
// pay-by-link page and the team registration flow so every payment surface
// behaves identically.

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
type StripePromise = ReturnType<typeof loadStripe>
export type PayMethod = 'card' | 'ach' | 'paypal'

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

function AchPayForm({ stripePromise, clientSecret, clubName, tournamentName, regId, total, contactEmail, onProcessing, onMicrodeposits, onSuccess }: {
  stripePromise: StripePromise; clientSecret: string; clubName: string; tournamentName: string
  regId: string; total: number; contactEmail: string
  onProcessing: () => void; onMicrodeposits: (url: string) => void; onSuccess: () => void
}) {
  const [name, setName] = useState(clubName)
  const [email, setEmail] = useState(contactEmail)
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

function PayPalPayForm({ clientId, registrationId, balance, total, tournamentName, clubName, onSuccess }: {
  clientId: string; registrationId: string; balance: number; total: number
  tournamentName: string; clubName: string; onSuccess: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    const markReady = () => { if (!cancelled) setSdkReady(true) }
    if ((window as any).paypal?.Buttons) { markReady(); return }
    const id = 'paypal-sdk-js'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = id
      script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
        '&currency=USD&intent=capture&enable-funding=venmo&disable-funding=card,paylater,credit'
      document.body.appendChild(script)
    }
    script.addEventListener('load', markReady)
    script.addEventListener('error', () => { if (!cancelled) setErr('Could not load PayPal — please choose another payment method.') })
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    if (!sdkReady || !containerRef.current) return
    const paypal = (window as any).paypal
    if (!paypal?.Buttons) return
    containerRef.current.innerHTML = ''
    paypal.Buttons({
      style: { layout: 'vertical', height: 44, label: 'pay' },
      createOrder: async () => {
        setErr('')
        const res = await fetch('/api/paypal/create-order', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: total, baseAmount: balance, tournamentName, clubName, registrationId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.orderId) throw new Error(data.error || 'Could not start the PayPal payment')
        return data.orderId
      },
      onApprove: async (data: any, actions: any) => {
        setCapturing(true); setErr('')
        try {
          const res = await fetch('/api/paypal/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID }),
          })
          const out = await res.json().catch(() => ({}))
          if (out.issue === 'INSTRUMENT_DECLINED' && actions?.restart) {
            setCapturing(false)
            setErr('That funding source was declined — pick a different one inside PayPal.')
            return actions.restart()
          }
          if (!res.ok || !out.ok) {
            setErr(out.error || 'The PayPal payment could not be completed.')
            setCapturing(false)
            return
          }
          onSuccess()
        } catch {
          setErr('The PayPal payment could not be completed. If you were charged, contact the tournament before retrying.')
          setCapturing(false)
        }
      },
      onError: () => { setCapturing(false); setErr('PayPal ran into a problem — please try again or choose another method.') },
      onCancel: () => setCapturing(false),
    }).render(containerRef.current).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady])

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Pay {fmt(total)} with PayPal or Venmo &mdash; you&apos;ll finish in their secure window.</p>
      {err && <p className="text-red-500 text-sm">{err}</p>}
      {capturing && <p className="text-sm text-slate-500 text-center py-1">Finishing your payment&hellip;</p>}
      <div ref={containerRef} className={capturing ? 'pointer-events-none opacity-50' : ''} />
      {!sdkReady && !err && <p className="text-sm text-slate-400 text-center py-3">Loading PayPal&hellip;</p>}
    </div>
  )
}

export default function StripePayPanel({ registrationId, balance, clubName, tournamentName, contactEmail = '', initialMethod = '', onMethodChange, onCardSuccess, onPayPalSuccess, onAchProcessing, onAchMicrodeposits, onAchSuccess }: {
  registrationId: string; balance: number; clubName: string; tournamentName: string
  contactEmail?: string
  initialMethod?: '' | PayMethod
  onMethodChange?: (m: PayMethod) => void
  onCardSuccess: () => void
  onPayPalSuccess?: () => void
  onAchProcessing: () => void
  onAchMicrodeposits: (url: string) => void
  onAchSuccess: () => void
}) {
  const [method, setMethod] = useState<'' | PayMethod>('')
  const [creating, setCreating] = useState(false)
  const [stripePromise, setStripePromise] = useState<StripePromise | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [payError, setPayError] = useState('')
  const [paypalClientId, setPaypalClientId] = useState('')
  const [paypalProbe, setPaypalProbe] = useState<'pending' | 'ready' | 'off'>('pending')

  useEffect(() => {
    fetch('/api/paypal/config')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.configured && d.clientId) { setPaypalClientId(d.clientId); setPaypalProbe('ready') } else { setPaypalProbe('off') }
      })
      .catch(() => setPaypalProbe('off'))
  }, [])

  const cardTotal = Math.round(balance * 1.03 * 100) / 100

  async function chooseMethod(m: PayMethod) {
    if (creating) return
    setMethod(m); setClientSecret(''); setPayError('')
    onMethodChange?.(m)
    if (m === 'paypal') return // the PayPal pane creates its own order when clicked
    setCreating(true)
    try {
      const amount = m === 'ach' ? balance : cardTotal
      const res = await fetch('/api/stripe/create-team-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount, baseAmount: balance,
          tournamentName, clubName, registrationId,
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

  useEffect(() => {
    if (initialMethod && !method) chooseMethod(initialMethod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className={paypalProbe !== 'off' ? 'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5' : 'grid grid-cols-2 gap-3 mb-5'}>
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
        {paypalProbe !== 'off' && (
          <button type="button" onClick={() => chooseMethod('paypal')} disabled={creating}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${method === 'paypal' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
            <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm"><Wallet size={16} className="text-teal-600" /> PayPal / Venmo</div>
            <div className="text-xs text-gray-500 font-medium mt-1">3% fee &mdash; pay {fmt(cardTotal)}</div>
            <div className="text-xs text-gray-400 mt-0.5">Instant confirmation</div>
          </button>
        )}
      </div>

      {creating && <p className="text-sm text-slate-400 text-center py-3">Setting up payment…</p>}
      {!creating && payError && method && <p className="text-sm text-red-500">{payError}</p>}
      {!creating && !payError && method === 'card' && stripePromise && clientSecret && (
        <Elements stripe={stripePromise}>
          <CardPayForm clientSecret={clientSecret} clubName={clubName} regId={registrationId} total={cardTotal} onSuccess={onCardSuccess} />
        </Elements>
      )}
      {!creating && !payError && method === 'ach' && stripePromise && clientSecret && (
        <AchPayForm
          stripePromise={stripePromise} clientSecret={clientSecret}
          clubName={clubName} tournamentName={tournamentName}
          regId={registrationId} total={balance} contactEmail={contactEmail}
          onProcessing={onAchProcessing} onMicrodeposits={onAchMicrodeposits} onSuccess={onAchSuccess}
        />
      )}
      {!creating && method === 'paypal' && (
        paypalProbe === 'ready' && paypalClientId ? (
          <PayPalPayForm clientId={paypalClientId} registrationId={registrationId} balance={balance} total={cardTotal}
            tournamentName={tournamentName} clubName={clubName} onSuccess={onPayPalSuccess || onCardSuccess} />
        ) : paypalProbe === 'pending' ? (
          <p className="text-sm text-slate-400 text-center py-3">Loading PayPal&hellip;</p>
        ) : (
          <p className="text-sm text-red-500">PayPal isn&apos;t available right now &mdash; please choose another method above.</p>
        )
      )}
      {!method && !creating && <p className="text-xs text-gray-400 text-center">Choose how you&apos;d like to pay.</p>}

      <div className="mt-5 pt-4 border-t border-gray-100 text-center">
        {method === 'paypal' ? (
          <>
            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5">
              <Lock size={13} className="text-slate-500 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-600">Powered by</span>
              <span className="text-[15px] font-bold italic leading-none" style={{ color: '#003087', letterSpacing: '-0.01em' }}>PayPal</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">You log in on PayPal&apos;s own site &mdash; your details are never shared with the tournament.</p>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5">
              <Lock size={13} className="text-slate-500 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-600">Powered by</span>
              <span className="text-[15px] font-bold leading-none" style={{ color: '#635BFF', letterSpacing: '-0.02em' }}>stripe</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Your card and bank details go directly to Stripe &mdash; never shared with the tournament.</p>
          </>
        )}
      </div>
    </div>
  )
}
