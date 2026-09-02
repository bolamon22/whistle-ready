'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import PublicChirp from '@/components/PublicChirp'
import toast, { Toaster } from 'react-hot-toast'
import { parsePricing, calcFee, feeScheduleLines, DEFAULT_REG_PRICING, type RegPricing } from '@/lib/regPricing'
import { mdToHtml } from '@/app/o/[slug]/_md'
import StripePayPanel, { type PayMethod } from '@/components/StripePayPanel'
import ClubNameHint, { useKnownClubs } from '@/components/ClubNameHint'

interface TeamRow {
  clubName: string
  teamName: string
  division: string
  coachName: string
  coachPhone: string
  coachEmail: string
  logoUrl: string
}

const emptyTeam = (): TeamRow => ({
  clubName: '', teamName: '', division: '', coachName: '', coachPhone: '', coachEmail: '', logoUrl: '',
})

const DEFAULT_DIVISIONS = [
  'Boys High School A','Boys High School B','Boys High School B2',
  'Boys U14 A and B','Boys U12 A and B',
  'Boys U10 A and B (7v7)','Boys U10 A and B (10v10)','Boys U8 (7v7)',
  'Girls High School A','Girls High School B','Girls High School B2',
  'Girls Middle School A',"Girls Middle School B (No 2030's)",
  "Girls Lower School A (7v7)","Girls Lower School B (7v7 - No 2033's)",
]

type Pricing = RegPricing
const DEFAULT_PRICING: Pricing = DEFAULT_REG_PRICING

function calcInvoice(teams: TeamRow[], pricing: Pricing): number {
  return calcFee(teams, pricing)
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
const smallInputCls = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!r.ok) throw new Error('Upload failed')
  const data = await r.json()
  return data.url
}

export default function RegisterPage() {
  const { id: tournamentId } = useParams()
  const searchParams = useSearchParams()
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [org, setOrg] = useState<any>(null)
  const [divisions, setDivisions] = useState<string[]>(DEFAULT_DIVISIONS)
  const [submitted, setSubmitted] = useState(false)
  const [conf, setConf] = useState<any>(null)
  const paid = searchParams.get('paid') === '1'
  const [loading, setLoading] = useState(false)

  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form')
  const [savedRegistrationId, setSavedRegistrationId] = useState('')
  const [invoiceBase, setInvoiceBase] = useState(0)
  const [payChoice, setPayChoice] = useState<'' | PayMethod>('')
  const [paypalLive, setPaypalLive] = useState(false)
  const [achNote, setAchNote] = useState<'' | 'processing' | 'micro'>('')
  const [microUrl, setMicroUrl] = useState('')

  const [clubName, setClubName] = useState('')
  const [clubContact, setClubContact] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const knownClubs = useKnownClubs(tournamentId as string)
  const [clubBasedIn, setClubBasedIn] = useState('')
  const [clubWebsite, setClubWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [needsHotel, setNeedsHotel] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [hotelRooms, setHotelRooms] = useState('')
  const [hotelNights, setHotelNights] = useState('')
  const [hpExtra, setHpExtra] = useState('')  // honeypot -- bots autofill it, humans never see it
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [teams, setTeams] = useState<TeamRow[]>([emptyTeam()])

  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING)
  const [showFees, setShowFees] = useState(false)

  const [clubLogoUrl, setClubLogoUrl] = useState('')
  const [clubLogoUploading, setClubLogoUploading] = useState(false)
  const [teamLogoUploading, setTeamLogoUploading] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}`)
      .then(r => r.json())
      .then(d => {
        setTournamentName(d.name || 'Tournament')
        if (d.logoUrl) setTournamentLogo(d.logoUrl)
        try {
          const divs = JSON.parse(d.registrationDivisions || '[]')
          if (divs.length > 0) setDivisions(divs)
        } catch {}
        try {
          setPricing(parsePricing(d.registrationPricing))
        } catch {}
      })
      .catch(() => {})
    fetch('/api/admin/org').then(r => r.json()).then(d => { if (d) setOrg(d) }).catch(() => {})
    fetch('/api/paypal/config').then(r => setPaypalLive(r.ok)).catch(() => {})
  }, [tournamentId])

  const updateTeam = (i: number, field: keyof TeamRow, value: string) => {
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  // Typing the club name auto-fills every team row that hasn't been customized
  // (empty, or still matching the previous club name) — so Team 1, created
  // before the club name existed, follows along keystroke by keystroke.
  const changeClubName = (next: string) => {
    setTeams(prev => prev.map(t => (!t.clubName || t.clubName === clubName) ? { ...t, clubName: next } : t))
    setClubName(next)
  }

  const addTeam = () => setTeams(prev => [...prev, { ...emptyTeam(), clubName, logoUrl: clubLogoUrl }])
  const removeTeam = (i: number) => setTeams(prev => prev.filter((_, idx) => idx !== i))

  const handleClubLogoUpload = async (file: File) => {
    setClubLogoUploading(true)
    try {
      const url = await uploadFile(file)
      setClubLogoUrl(url)
      setTeams(prev => prev.map(t => t.logoUrl ? t : { ...t, logoUrl: url }))
      toast.success('Club logo uploaded!')
    } catch {
      toast.error('Logo upload failed')
    }
    setClubLogoUploading(false)
  }

  const handleTeamLogoUpload = async (i: number, file: File) => {
    setTeamLogoUploading(prev => ({ ...prev, [i]: true }))
    try {
      const url = await uploadFile(file)
      updateTeam(i, 'logoUrl', url)
    } catch {
      toast.error('Logo upload failed')
    }
    setTeamLogoUploading(prev => ({ ...prev, [i]: false }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentMethod) { toast.error('Please select a payment option'); return }
    if (!needsHotel) { toast.error('Please select hotel preference'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId, hp_extra: hpExtra, clubName, clubContact, contactEmail, contactPhone,
          clubBasedIn,
          // Accept "yourclub.com" — add the scheme for them.
          clubWebsite: clubWebsite.trim() && !/^https?:\/\//i.test(clubWebsite.trim()) ? `https://${clubWebsite.trim()}` : clubWebsite.trim(),
          instagram: instagram.trim(),
          numTeams: teams.length,
          needsHotel, paymentMethod, notes,
          hotelName: hotelName.trim(), hotelRooms: Number(hotelRooms) || 0, hotelNights: Number(hotelNights) || 0,
          // Safety net: any team row left without a club name gets the club's.
          teams: teams.map(t => ({ ...t, clubName: t.clubName || clubName })),
          clubLogoUrl,
        }),
      })
      if (!res.ok) throw new Error('Registration failed')
      const registration = await res.json()
      setConf(registration.confirmation || null)

      if (paymentMethod === 'credit_card' || paymentMethod === 'ach' || (paymentMethod === 'paypal' && paypalLive)) {
        setInvoiceBase(calcInvoice(teams, pricing))
        setSavedRegistrationId(registration.id)
        setStep('payment')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        setSubmitted(true)
      }
    } catch (err: any) {
      toast.error(err?.message || 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted || paid || step === 'success') {
    const L = conf?.letter
    const D = conf?.data
    const donePaid = paid || step === 'success'
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="bg-white rounded-2xl shadow border border-slate-100 p-8 max-w-xl mx-auto">
          {tournamentLogo && <img src={tournamentLogo} alt="" className="h-16 w-16 object-contain mx-auto mb-3 rounded-xl" />}
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-1">{donePaid && !achNote ? 'Payment complete!' : 'Registration received!'}</h2>
          {L ? (
            <div className="mt-4 text-left">
              <p className="font-semibold text-slate-800">{L.greeting}</p>
              <div className="text-slate-600 text-sm mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(L.welcome) }} />
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden text-sm">
                <div className="flex justify-between px-4 py-2 bg-slate-50"><span className="text-slate-500">Club</span><span className="font-semibold text-slate-800">{D?.clubName}</span></div>
                {L.teams.map((t: any, i: number) => <div key={i} className="flex justify-between px-4 py-2 border-t border-slate-100"><span className="text-slate-700">{t.team}</span><span className="text-slate-500">{t.division}</span></div>)}
                <div className="flex justify-between px-4 py-2 border-t border-slate-100"><span className="text-slate-500">Teams</span><span className="font-semibold text-slate-800">{L.numTeams}</span></div>
              </div>
              {achNote === 'processing' && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">Bank transfer (ACH) initiated — it typically clears within 4 business days, and we&apos;ll mark your registration paid automatically once it does.</p>}
              {achNote === 'micro' && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">One more step: Stripe is sending a small verification deposit to your bank (1&ndash;2 days). Follow the emailed instructions{microUrl ? <> or <a href={microUrl} className="underline" target="_blank" rel="noreferrer">verify here</a></> : null} to complete your payment.</p>}
              {!achNote && (donePaid || L.payment) && <p className="mt-3 text-sm bg-teal-50 border border-teal-100 text-teal-800 rounded-lg px-3 py-2">{donePaid ? "Payment received — you're all set." : L.payment}</p>}

              {/* Account CTA — the main next step. Shown here (not just in the email)
                  because this is the moment the coach is actually paying attention. */}
              {D?.claimUrl && (
                <div className="mt-4 border border-slate-200 bg-slate-50 rounded-xl px-4 py-4">
                  <p className="text-sm font-semibold text-slate-800">Set up your team account</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Manage your roster and player waivers, track your balance, and see your schedule as soon as it&apos;s posted.
                  </p>
                  <a href={D.claimUrl}
                    className="inline-block mt-3 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">
                    Set up my account →
                  </a>
                </div>
              )}
              <div className="text-slate-600 text-sm mt-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(L.nextSteps) }} />
              <div className="text-slate-600 text-sm mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(L.signoff) }} />
              <div className="mt-5 flex flex-wrap gap-2 justify-center">
                {D?.eventUrl && <a href={D.eventUrl} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-full px-4 py-2">Event page</a>}
                {D?.gameDayUrl && <a href={D.gameDayUrl} className="text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-full px-4 py-2">Game day</a>}
              </div>
              {conf?.emailed && <p className="text-xs text-slate-400 text-center mt-4">A copy was emailed to {contactEmail}.</p>}
            </div>
          ) : (
            <p className="text-gray-600 text-center mt-2">Thank you for registering for <strong>{tournamentName}</strong>. {donePaid && !achNote ? 'Your payment was successful. ' : achNote ? 'Your bank transfer is processing — it typically clears within 4 business days. ' : ''}We will be in touch soon with confirmation details.</p>
          )}
        </div>
      </div>
    )
  }

  if (step === 'payment' && savedRegistrationId) {
    const cardTotal = Math.round(invoiceBase * 1.03 * 100) / 100
    return (
      <div className="min-h-screen bg-gray-50">
        <Toaster />
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Order Summary</h2>
            <div className="text-sm text-gray-500 mb-3">{clubName} &middot; {teams.length} team{teams.length !== 1 ? 's' : ''}</div>
            <div className="mb-4 border border-gray-100 rounded-xl overflow-hidden">
              {teams.map((t, i) => (
                <div key={i} className={`flex justify-between items-center px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <span className="text-gray-700 font-medium">{t.teamName || `Team ${i + 1}`}</span>
                  <span className="text-gray-400 text-xs">{t.division}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between font-semibold text-gray-800"><span>Registration ({teams.length} team{teams.length !== 1 ? 's' : ''})</span><span>{fmt(invoiceBase)}</span></div>
              {payChoice === 'card' && <>
                <div className="flex justify-between text-gray-400 text-xs"><span>Card processing fee (3%)</span><span>+{fmt(cardTotal - invoiceBase)}</span></div>
                <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(cardTotal)}</span></div>
              </>}
              {payChoice === 'ach' && <>
                <div className="flex justify-between text-teal-600 text-xs"><span>Bank transfer (ACH) — no processing fee</span><span>+$0</span></div>
                <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(invoiceBase)}</span></div>
              </>}
              {payChoice === 'paypal' && <>
                <div className="flex justify-between text-gray-400 text-xs"><span>PayPal / Venmo processing fee (3%)</span><span>+{fmt(cardTotal - invoiceBase)}</span></div>
                <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2 mt-2"><span>Total due today</span><span>{fmt(cardTotal)}</span></div>
              </>}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">Payment</h2>
            <StripePayPanel
              registrationId={savedRegistrationId}
              balance={invoiceBase}
              clubName={clubName}
              tournamentName={tournamentName}
              contactEmail={contactEmail}
              initialMethod={paymentMethod === 'ach' ? 'ach' : paymentMethod === 'paypal' ? 'paypal' : 'card'}
              onMethodChange={setPayChoice}
              onCardSuccess={() => setStep('success')}
              onPayPalSuccess={() => setStep('success')}
              onAchProcessing={() => { setAchNote('processing'); setStep('success') }}
              onAchMicrodeposits={url => { setAchNote('micro'); setMicroUrl(url); setStep('success') }}
              onAchSuccess={() => setStep('success')}
            />
          </div>
          <button
            onClick={() => setStep('form')}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            Back to registration
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow p-8">
          <form onSubmit={handleSubmit} className="space-y-8" autoComplete="on">
              {/* Honeypot (spam bots): offscreen, name/autocomplete chosen so real
                  browser autofill ignores it -- same pattern as the signup form. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
                <input type="text" name="hp_extra" tabIndex={-1} autoComplete="one-time-code" value={hpExtra} onChange={e => setHpExtra(e.target.value)} />
              </div>
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
                  <input name="organization" autoComplete="organization" value={clubName} onChange={e => changeClubName(e.target.value)} className={inputCls} />
                  <ClubNameHint value={clubName} known={knownClubs} onUse={changeClubName} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact <span className="text-red-500">*</span></label>
                  <input required name="name" autoComplete="name" value={clubContact} onChange={e => setClubContact(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact Email <span className="text-red-500">*</span></label>
                  <input required type="email" name="email" autoComplete="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact Mobile Phone <span className="text-red-500">*</span></label>
                  <input required type="tel" name="tel" autoComplete="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Based In</label>
                  <input placeholder="City and State" name="address-level2" autoComplete="address-level2" value={clubBasedIn} onChange={e => setClubBasedIn(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Website</label>
                  {/* type=text on purpose: type=url rejects "yourclub.com" without a
                      scheme. We normalize to https:// at submit instead. */}
                  <input type="text" inputMode="url" placeholder="yourclub.com" name="url" autoComplete="url" value={clubWebsite} onChange={e => setClubWebsite(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instagram <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" placeholder="@yourclub" value={instagram} onChange={e => setInstagram(e.target.value)} className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">Drop your handle and we&apos;ll follow your club — and tag you in tournament coverage.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Will your club need hotel rooms? <span className="text-red-500">*</span></label>
                  <select required value={needsHotel} onChange={e => setNeedsHotel(e.target.value)} className={inputCls}>
                    <option value="">Select...</option>
                    <option>Yes</option>
                    <option>No</option>
                    <option>Maybe</option>
                  </select>
                </div>
                {(needsHotel === 'Yes' || needsHotel === 'Maybe') && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hotel <span className="text-gray-400 font-normal">(if known)</span></label>
                      <input type="text" placeholder="TBD" value={hotelName} onChange={e => setHotelName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rooms <span className="text-gray-400 font-normal">(est.)</span></label>
                      <input type="number" min="0" inputMode="numeric" placeholder="10" value={hotelRooms} onChange={e => setHotelRooms(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nights <span className="text-gray-400 font-normal">(est.)</span></label>
                      <input type="number" min="0" inputMode="numeric" placeholder="1" value={hotelNights} onChange={e => setHotelNights(e.target.value)} className={inputCls} />
                    </div>
                    <p className="sm:col-span-3 text-xs text-gray-400 -mt-2">Rough estimates are fine — this helps us reserve room blocks near the fields and support the event with local partners.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Logo</label>
                  <p className="text-xs text-gray-400 mb-2">Automatically applied to all your teams. You can override per team below.</p>
                  <div className="flex items-center gap-3">
                    {clubLogoUrl && (
                      <img src={clubLogoUrl} alt="Club logo" className="h-12 w-12 object-contain rounded-lg border border-gray-200 flex-shrink-0" />
                    )}
                    <label className={`cursor-pointer border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${clubLogoUploading ? 'opacity-50' : ''}`}>
                      {clubLogoUploading ? 'Uploading...' : clubLogoUrl ? 'Change Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" className="hidden" disabled={clubLogoUploading} onChange={e => e.target.files?.[0] && handleClubLogoUpload(e.target.files[0])} />
                    </label>
                    {clubLogoUrl && (
                      <button type="button" onClick={() => { setClubLogoUrl(''); setTeams(prev => prev.map(t => t.logoUrl === clubLogoUrl ? { ...t, logoUrl: '' } : t)) }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Team Information</h2>
              <div className="space-y-3">
                {teams.map((team, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        {(team.logoUrl || clubLogoUrl) && (
                          <img src={team.logoUrl || clubLogoUrl} alt="logo" className="h-8 w-8 object-contain rounded-lg border border-gray-200 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-600">Team {i + 1}</span>
                      </div>
                      {teams.length > 1 && (
                        <button type="button" onClick={() => removeTeam(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Club Name <span className="text-red-500">*</span></label>
                        <input required autoComplete="organization" value={team.clubName} onChange={e => updateTeam(i, 'clubName', e.target.value)} className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Team <span className="text-red-500">*</span></label>
                        <input required placeholder="IE: Eagles White" autoComplete="off" value={team.teamName} onChange={e => updateTeam(i, 'teamName', e.target.value)} className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Division <span className="text-red-500">*</span></label>
                        <select required value={team.division} onChange={e => updateTeam(i, 'division', e.target.value)} className={smallInputCls}>
                          <option value="">Choose Division</option>
                          {divisions.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Name <span className="text-red-500">*</span></label>
                        <input required autoComplete="name" value={team.coachName} onChange={e => updateTeam(i, 'coachName', e.target.value)} className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Phone <span className="text-red-500">*</span></label>
                        <input required type="tel" autoComplete="tel" value={team.coachPhone} onChange={e => updateTeam(i, 'coachPhone', e.target.value)} className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Email <span className="text-red-500">*</span></label>
                        <input required type="email" autoComplete="email" value={team.coachEmail} onChange={e => updateTeam(i, 'coachEmail', e.target.value)} className={smallInputCls} />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Team Logo
                        {clubLogoUrl && !team.logoUrl && <span className="ml-1 text-gray-400 font-normal">(using club logo - upload here to override)</span>}
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && <span className="ml-1 text-green-600 font-normal">custom logo</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && (
                          <img src={team.logoUrl} alt="team logo" className="h-8 w-8 object-contain rounded border border-gray-200 flex-shrink-0" />
                        )}
                        <label className={`cursor-pointer border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white ${teamLogoUploading[i] ? 'opacity-50' : ''}`}>
                          {teamLogoUploading[i] ? 'Uploading...' : team.logoUrl && team.logoUrl !== clubLogoUrl ? 'Change' : 'Upload Custom'}
                          <input type="file" accept="image/*" className="hidden" disabled={teamLogoUploading[i]} onChange={e => e.target.files?.[0] && handleTeamLogoUpload(i, e.target.files[0])} />
                        </label>
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && (
                          <button type="button" onClick={() => updateTeam(i, 'logoUrl', clubLogoUrl)} className="text-xs text-gray-400 hover:text-gray-600">
                            {clubLogoUrl ? 'Use club logo' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={addTeam} className="inline-flex items-center gap-1 border border-orange-400 text-orange-500 hover:bg-orange-50 rounded-lg px-4 py-2 text-sm font-medium">
                  + Add Team
                </button>
                <span className="text-sm text-gray-500">Total Teams: {teams.length}</span>
              </div>
            </section>

            <section>
              {teams.length > 0 && calcInvoice(teams, pricing) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Estimated Total</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {teams.length} team{teams.length !== 1 ? 's' : ''} &middot;{' '}
                      <button type="button" onClick={() => setShowFees(!showFees)} className="underline hover:text-blue-800">
                        {showFees ? 'hide fee schedule' : 'view fee schedule'}
                      </button>
                    </p>
                    {showFees && (
                      <div className="mt-2 text-xs text-blue-700 space-y-0.5">
                        {feeScheduleLines(pricing).map((line, i) => <div key={i}>{line}</div>)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-800">{fmt(calcInvoice(teams, pricing))}</p>
                    {paymentMethod === 'credit_card' && (
                      <p className="text-xs text-blue-500 mt-0.5">+3% CC fee = {fmt(Math.round(calcInvoice(teams, pricing) * 1.03))}</p>
                    )}
                    {paymentMethod === 'ach' && (
                      <p className="text-xs text-teal-600 mt-0.5">No fee with bank transfer (ACH)</p>
                    )}
                    {paymentMethod === 'paypal' && paypalLive && (
                      <p className="text-xs text-blue-500 mt-0.5">+3% fee = {fmt(Math.round(calcInvoice(teams, pricing) * 1.03))}</p>
                    )}
                  </div>
                </div>
              )}

              <h2 className="text-lg font-semibold text-gray-800 mb-3">Payment Options <span className="text-red-500">*</span></h2>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: 'ach', label: 'Bank Transfer (ACH) — No Fee' },
                  { value: 'credit_card', label: 'Credit Card' },
                  { value: 'paypal', label: paypalLive ? 'PayPal / Venmo' : 'PayPal' },
                  { value: 'zelle', label: 'Zelle' },
                  { value: 'check', label: 'Check' },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-center gap-2 cursor-pointer text-sm border rounded-lg px-4 py-2 transition-colors ${paymentMethod === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <input type="radio" name="paymentMethod" value={opt.value} checked={paymentMethod === opt.value} onChange={e => setPaymentMethod(e.target.value)} className="hidden" />
                    {opt.label}
                  </label>
                ))}
              </div>
              {paymentMethod === 'credit_card' && (
                <p className="text-sm text-blue-600 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">You will enter your card details on the next step. A 3% processing fee applies.</p>
              )}
              {paymentMethod === 'zelle' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Please send Zelle to <strong>{org?.zelleHandle || 'info@sunshinelax.com'}</strong></p>
              )}
              {paymentMethod === 'check' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Please mail checks payable to <strong>{org?.checkPayableTo || 'Sunshine Events Group'}</strong> to:<br/>{org?.checkAddress || '11830 Wiles Rd. Coral Springs, FL 33076'}</p>
              )}
              {paymentMethod === 'ach' && (
                <p className="text-sm text-teal-700 mt-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">Pay online by secure bank login on the next step — <strong>no processing fee</strong>.</p>
              )}
              {paymentMethod === 'paypal' && (paypalLive ? (
                <p className="text-sm text-blue-600 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Pay with your PayPal or Venmo account on the next step. A 3% processing fee applies.</p>
              ) : (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Send PayPal to <strong>{org?.paypalEmail || 'info@sunshinelax.com'}</strong></p>
              ))}
            </section>

            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoComplete="off"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </section>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
              {loading
                ? (paymentMethod === 'credit_card' || paymentMethod === 'ach' || (paymentMethod === 'paypal' && paypalLive) ? 'Preparing payment...' : 'Submitting...')
                : (paymentMethod === 'credit_card' || paymentMethod === 'ach' || (paymentMethod === 'paypal' && paypalLive) ? 'Continue to Payment' : 'Submit Registration')}
            </button>
          </form>
        </div>
      </div>
      </div>
      <PublicChirp tournamentId={tournamentId as string} tournamentName={tournamentName} />
    </div>
  )
}
