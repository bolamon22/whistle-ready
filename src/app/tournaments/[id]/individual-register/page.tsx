'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

interface FeeTier { id: string; name: string; price: number; description: string }
interface TournamentInfo {
  name: string; logoUrl: string; sport: string; startDate: string; endDate: string
  individualRegEnabled: boolean; individualRegDescription: string
  individualRegTiers: FeeTier[]; individualRegPositions: string[]; individualRegSizes: string[]
}

const PROCESSING_FEE_PCT = 0.029
const PROCESSING_FEE_FIXED = 0.30

function calcFee(amount: number) {
  return Math.round((amount * PROCESSING_FEE_PCT + PROCESSING_FEE_FIXED) * 100) / 100
}

const inputCls = "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
const labelCls = "block text-sm font-medium text-gray-700 mb-1"

// ── Card Payment Form (must be inside <Elements>) ──────────────────────────
function CardPayForm({
  clientSecret, total, firstName, lastName, email,
  registrationId, tournamentId, onSuccess,
}: {
  clientSecret: string; total: number; firstName: string; lastName: string; email: string
  registrationId: string; tournamentId: string; onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [cardError, setCardError] = useState('')

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    setCardError('')

    const card = elements.getElement(CardElement)!
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card,
        billing_details: { name: `${firstName} ${lastName}`, email },
      },
    })

    if (error) {
      setCardError(error.message || 'Payment failed')
      setPaying(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      try {
        await fetch(`/api/tournaments/${tournamentId}/individual-reg/${registrationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentStatus: 'paid' }),
        })
      } catch {}
      onSuccess()
    }

    setPaying(false)
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div>
        <label className={labelCls}>Card Details</label>
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
      <button
        type="submit"
        disabled={paying || !stripe || !elements}
        className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-sm"
      >
        {paying ? 'Processing...' : `Pay $${total.toFixed(2)}`}
      </button>
      <p className="text-center text-xs text-gray-400">
        🔒 Secured by Stripe. Your card is never stored on our servers.
      </p>
    </form>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function IndividualRegPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const successParam = searchParams.get('success')

  const [tournament, setTournament] = useState<TournamentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Multi-step state
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form')
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [registrationId, setRegistrationId] = useState('')

  // Form state
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [email, setEmail]           = useState('')
  const [phone, setPhone]           = useState('')
  const [position, setPosition]     = useState('')
  const [numberRequest, setNumber]  = useState('')
  const [jerseySize, setJerseySize] = useState('')
  const [shortsSize, setShortsSize] = useState('')
  const [usLax, setUsLax]           = useState('')
  const [dob, setDob]               = useState('')
  const [guardianName, setGuardianName]   = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [ecName, setecName]       = useState('')
  const [ecPhone, setEcPhone]     = useState('')
  const [ecRel, setEcRel]         = useState('')
  const [medNotes, setMedNotes]   = useState('')
  const [waiverSigned, setWaiverSigned] = useState(false)
  const [waiverSig, setWaiverSig] = useState('')
  const [selectedTier, setSelectedTier] = useState<FeeTier | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`)
      .then(r => r.json())
      .then(d => {
        const tiers: FeeTier[] = (() => { try { return JSON.parse(d.individualRegTiers || '[]') } catch { return [] } })()
        const positions: string[] = (() => { try { return JSON.parse(d.individualRegPositions || '[]') } catch { return ['Attack','Midfield','Defense','Goalie','Utility/Other'] } })()
        const sizes: string[] = (() => { try { return JSON.parse(d.individualRegSizes || '[]') } catch { return ['YS','YM','YL','S','M','L','XL','XXL'] } })()
        setTournament({ ...d, individualRegTiers: tiers, individualRegPositions: positions, individualRegSizes: sizes })
        if (tiers.length > 0) setSelectedTier(tiers[0])
        setLoading(false)
      })
  }, [id])

  const processingFee = selectedTier ? calcFee(selectedTier.price) : 0
  const total = selectedTier ? selectedTier.price + processingFee : 0
  const isMinor = dob ? (new Date().getFullYear() - new Date(dob).getFullYear()) < 18 : false

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTier) { toast.error('Please select a registration option'); return }
    if (!waiverSigned || !waiverSig.trim()) { toast.error('Please sign the waiver'); return }
    if (!position) { toast.error('Please select your position'); return }
    if (!jerseySize || !shortsSize) { toast.error('Please select your sizes'); return }

    setSubmitting(true)

    const regData = {
      firstName, lastName, email, phone, position, numberRequest, jerseySize, shortsSize,
      usLacrosseNumber: usLax, dateOfBirth: dob,
      guardianName, guardianPhone, guardianEmail,
      emergencyContactName: ecName, emergencyContactPhone: ecPhone, emergencyRelationship: ecRel,
      medicalNotes: medNotes, waiverSigned, waiverSignature: waiverSig,
    }

    try {
      const res = await fetch(`/api/tournaments/${id}/individual-reg/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regData, tierId: selectedTier.id, tierName: selectedTier.name, tierAmount: selectedTier.price }),
      })
      const data = await res.json()

      if (res.ok && data.clientSecret) {
        const sp = loadStripe(data.publishableKey, data.accountId ? { stripeAccount: data.accountId } : undefined)
        setStripePromise(sp)
        setClientSecret(data.clientSecret)
        setRegistrationId(data.registrationId)
        setStep('payment')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        toast.error(data.error || 'Something went wrong')
      }
    } catch {
      toast.error('Network error — please try again')
    }

    setSubmitting(false)
  }

  // ── Loading / Error states ─────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 animate-pulse">Loading…</p>
    </div>
  )

  if (!tournament) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Tournament not found.</p>
    </div>
  )

  if (!tournament.individualRegEnabled) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow p-10 max-w-md text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">Registration not open</h1>
        <p className="text-sm text-gray-500">Individual registration for this tournament isn't open yet.</p>
      </div>
    </div>
  )

  // ── Success ────────────────────────────────────────────────────────────
  if (successParam || step === 'success') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow p-10 max-w-md text-center">
        <div className="text-4xl mb-3">🎉</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">You're registered!</h1>
        <p className="text-sm text-gray-500 mb-4">Payment received. We'll send confirmation to your email.</p>
        <Link href={`/tournaments/${id}/public`} className="inline-block bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
          View Tournament →
        </Link>
      </div>
    </div>
  )

  // ── Payment Step ──────────────────────────────────────────────────────
  if (step === 'payment' && stripePromise && clientSecret) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Toaster />
        {/* Header */}
        <div className="bg-[#0f1f3d] px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            {tournament.logoUrl && (
              <img src={tournament.logoUrl} alt="logo" className="h-11 w-11 object-contain rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
            )}
            <div>
              <h1 className="text-base font-bold text-white leading-tight">{tournament.name}</h1>
              <p className="text-[11px] text-teal-300 mt-0.5 font-medium">Individual Player Registration</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          {/* Order Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Order Summary</h2>
            <div className="text-sm text-gray-500 mb-3">{firstName} {lastName} · {email}</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{selectedTier?.name}</span>
                <span>${selectedTier?.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Processing fee</span>
                <span>+${processingFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2">
                <span>Total due</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Card Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-5 pb-2 border-b border-gray-100">Payment</h2>
            <Elements stripe={stripePromise}>
              <CardPayForm
                clientSecret={clientSecret}
                total={total}
                firstName={firstName}
                lastName={lastName}
                email={email}
                registrationId={registrationId}
                tournamentId={id}
                onSuccess={() => setStep('success')}
              />
            </Elements>
          </div>

          <button
            onClick={() => setStep('form')}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            ← Edit registration
          </button>
        </div>
      </div>
    )
  }

  // ── Form Step ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />

      {/* Header */}
      <div className="bg-[#0f1f3d] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {tournament.logoUrl && (
            <img src={tournament.logoUrl} alt="logo" className="h-11 w-11 object-contain rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
          )}
          <div>
            <h1 className="text-base font-bold text-white leading-tight">{tournament.name}</h1>
            <p className="text-[11px] text-teal-300 mt-0.5 font-medium">Individual Player Registration</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {tournament.individualRegDescription && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-4 mb-6">
            <p className="text-sm text-teal-800 leading-relaxed">{tournament.individualRegDescription}</p>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-6">

          {/* ── Player Info ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Player Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>First Name *</label>
                <input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Last Name *</label>
                <input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <p className="text-xs text-gray-400 mt-1">For payment confirmation and follow-up</p>
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth *</label>
                <input className={inputCls} type="date" value={dob} onChange={e => setDob(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>US Lacrosse Member # *</label>
                <input className={inputCls} value={usLax} onChange={e => setUsLax(e.target.value)} placeholder="e.g. 1234567" required />
                <a href="https://www.uslacrosse.org/membership" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:underline mt-1 inline-block">US Lacrosse Member Look Up →</a>
              </div>
            </div>
          </div>

          {/* ── Guardian (if minor) ── */}
          {(isMinor || dob === '') && (
            <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
              <h2 className="text-base font-bold text-gray-800 mb-1 pb-2 border-b border-gray-100">Parent / Guardian</h2>
              <p className="text-xs text-amber-600 mb-4">Required for players under 18</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-1">
                  <label className={labelCls}>Guardian Name *</label>
                  <input className={inputCls} value={guardianName} onChange={e => setGuardianName(e.target.value)} required={isMinor} />
                </div>
                <div>
                  <label className={labelCls}>Guardian Phone *</label>
                  <input className={inputCls} type="tel" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} required={isMinor} />
                </div>
                <div>
                  <label className={labelCls}>Guardian Email</label>
                  <input className={inputCls} type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Emergency Contact ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Emergency Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input className={inputCls} value={ecName} onChange={e => setecName(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Phone *</label>
                <input className={inputCls} type="tel" value={ecPhone} onChange={e => setEcPhone(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Relationship *</label>
                <input className={inputCls} value={ecRel} onChange={e => setEcRel(e.target.value)} placeholder="e.g. Parent, Spouse" required />
              </div>
              <div>
                <label className={labelCls}>Medical Notes</label>
                <input className={inputCls} value={medNotes} onChange={e => setMedNotes(e.target.value)} placeholder="Allergies, conditions, etc." />
              </div>
            </div>
          </div>

          {/* ── Playing Details ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Playing Details</h2>

            <div className="mb-4">
              <label className={labelCls}>Position *</label>
              <div className="flex flex-wrap gap-2">
                {tournament.individualRegPositions.map(p => (
                  <button key={p} type="button" onClick={() => setPosition(p)}
                    className={`px-4 py-2 text-sm rounded-xl border font-medium transition-all ${position === p ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Jersey Number Request</label>
                <input className={inputCls} value={numberRequest} onChange={e => setNumber(e.target.value)} placeholder="e.g. 12" />
              </div>
              <div />
              <div>
                <label className={labelCls}>Jersey Size *</label>
                <div className="flex flex-wrap gap-1.5">
                  {tournament.individualRegSizes.map(s => (
                    <button key={s} type="button" onClick={() => setJerseySize(s)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${jerseySize === s ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Shorts Size *</label>
                <div className="flex flex-wrap gap-1.5">
                  {tournament.individualRegSizes.map(s => (
                    <button key={s} type="button" onClick={() => setShortsSize(s)}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-all ${shortsSize === s ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-200 text-gray-600 hover:border-teal-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Fee Tier ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Registration Fee *</h2>
            <div className="space-y-3">
              {tournament.individualRegTiers.map(tier => (
                <label key={tier.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedTier?.id === tier.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-200'}`}>
                  <input type="radio" name="tier" checked={selectedTier?.id === tier.id}
                    onChange={() => setSelectedTier(tier)} className="mt-0.5 accent-teal-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${selectedTier?.id === tier.id ? 'text-teal-800' : 'text-gray-800'}`}>{tier.name}</span>
                      <span className={`text-sm font-bold ${selectedTier?.id === tier.id ? 'text-teal-700' : 'text-gray-700'}`}>${tier.price.toFixed(2)}</span>
                    </div>
                    {tier.description && <p className="text-xs text-gray-500 mt-0.5">{tier.description}</p>}
                  </div>
                </label>
              ))}
            </div>
            {selectedTier && (
              <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>${selectedTier.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>Processing fees</span><span>${processingFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1.5">
                  <span>Amount Due</span><span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Waiver ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Waiver & Release</h2>
            <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 leading-relaxed mb-4 max-h-40 overflow-y-auto">
              <p className="font-semibold mb-2">PARTICIPANT WAIVER AND RELEASE OF LIABILITY</p>
              <p>I, the undersigned, acknowledge that participation in lacrosse and related activities involves inherent risks, including but not limited to physical injury. I voluntarily assume all risks associated with participation in this tournament. I hereby release, waive, and discharge the tournament organizers, sponsors, staff, and volunteers from any and all liability, claims, demands, actions, and causes of action arising out of or related to any loss, damage, or injury that may be sustained by the participant.</p>
              <p className="mt-2">I further agree to comply with all tournament rules and regulations and to behave in a sportsmanlike manner. I grant permission for the use of any photographs or videos taken during the event for promotional purposes.</p>
              <p className="mt-2">If the participant is a minor, I certify that I am the parent or legal guardian and have the authority to sign this waiver on their behalf.</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input type="checkbox" checked={waiverSigned} onChange={e => setWaiverSigned(e.target.checked)}
                className="mt-0.5 accent-teal-500 w-4 h-4" />
              <span className="text-sm text-gray-700">I have read and agree to the waiver and release of liability above *</span>
            </label>
            <div>
              <label className={labelCls}>Type your full name as signature *</label>
              <input className={inputCls} value={waiverSig} onChange={e => setWaiverSig(e.target.value)}
                placeholder="Full legal name" required />
            </div>
          </div>

          {/* ── Submit ── */}
          <button type="submit" disabled={submitting || !selectedTier || !waiverSigned}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base transition-colors shadow-sm">
            {submitting ? 'Preparing payment...' : `Continue to Payment →`}
          </button>
          <p className="text-center text-xs text-gray-400">Secured by Stripe. Your payment info is never stored on our servers.</p>
        </form>
      </div>
    </div>
  )
}
