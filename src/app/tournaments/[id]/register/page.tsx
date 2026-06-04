'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

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
  'Boys 2030', 'Boys 2029', 'Boys 2028', 'Boys 2027', 'Boys 2026',
  'Boys 2025', 'Boys 2024', 'Boys 2023',
  'Girls 2030', 'Girls 2029', 'Girls 2028', 'Girls 2027', 'Girls 2026',
  'Girls 2025', 'Girls 2024', 'Girls 2023',
  'HS Boys JV', 'HS Boys Varsity', 'HS Girls JV', 'HS Girls Varsity',
]

interface Pricing { tier1: number; tier1Max: number; tier2: number; tier2Max: number; tier3: number; sevenVSeven: number }
const DEFAULT_PRICING: Pricing = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }

function calcInvoice(teams: TeamRow[], pricing: Pricing): number {
  const sevenV = teams.filter(t => t.division.toLowerCase().includes('7v7') || t.division.toLowerCase().includes('7 v 7'))
  const regular = teams.filter(t => !t.division.toLowerCase().includes('7v7') && !t.division.toLowerCase().includes('7 v 7'))
  let total = sevenV.length * pricing.sevenVSeven
  const n = regular.length
  const rate = n <= pricing.tier1Max ? pricing.tier1 : n <= pricing.tier2Max ? pricing.tier2 : pricing.tier3
  total += n * rate
  return total
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
  const [divisions, setDivisions] = useState<string[]>(DEFAULT_DIVISIONS)
  const [submitted, setSubmitted] = useState(false)
  const paid = searchParams.get('paid') === '1'
  const [loading, setLoading] = useState(false)

  const [clubName, setClubName] = useState('')
  const [clubContact, setClubContact] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [clubBasedIn, setClubBasedIn] = useState('')
  const [clubWebsite, setClubWebsite] = useState('')
  const [needsHotel, setNeedsHotel] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [teams, setTeams] = useState<TeamRow[]>([emptyTeam()])

  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING)
  const [showFees, setShowFees] = useState(false)

  // Club logo state
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
          const p = JSON.parse(d.registrationPricing || '{}')
          if (p.tier1) setPricing(p)
        } catch {}
      })
      .catch(() => {})
  }, [tournamentId])

  const updateTeam = (i: number, field: keyof TeamRow, value: string) => {
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  const addTeam = () => setTeams(prev => [...prev, { ...emptyTeam(), clubName, logoUrl: clubLogoUrl }])
  const removeTeam = (i: number) => setTeams(prev => prev.filter((_, idx) => idx !== i))

  const handleClubLogoUpload = async (file: File) => {
    setClubLogoUploading(true)
    try {
      const url = await uploadFile(file)
      setClubLogoUrl(url)
      // Auto-assign to all teams that don't have their own logo
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
          tournamentId, clubName, clubContact, contactEmail, contactPhone,
          clubBasedIn, clubWebsite, numTeams: teams.length,
          needsHotel, paymentMethod, notes, teams, clubLogoUrl,
        }),
      })
      if (!res.ok) throw new Error()
      const registration = await res.json()

      // Redirect to Stripe if paying by credit card
      const calculatedAmount = calcInvoice(teams, pricing)
      if (paymentMethod === 'credit_card' && calculatedAmount > 0) {
        const baseAmount = calculatedAmount
        const amountWithFee = Math.round(baseAmount * 1.03 * 100) / 100 // +3% to offset Stripe fees
        const stripeRes = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountWithFee,
            tournamentName,
            clubName,
            registrationId: registration.id,
            successUrl: 'https://sunshineeventsgroup.com',
            cancelUrl: window.location.href,
          }),
        })
        const { url, error } = await stripeRes.json()
        if (error) throw new Error(error)
        window.location.href = url
        return
      }

      setSubmitted(true)
    } catch {
      toast.error('Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted || paid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-10 max-w-lg text-center">
          {tournamentLogo && <img src={tournamentLogo} alt="logo" className="h-20 w-20 object-contain mx-auto mb-4 rounded-xl" />}
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{paid ? 'Payment Complete!' : 'Registration Received!'}</h2>
          <p className="text-gray-600">Thank you for registering for <strong>{tournamentName}</strong>. {paid ? 'Your payment was successful and ' : ''}We'll be in touch soon with confirmation details.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <Toaster />
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow p-8">
          <div className="flex items-center gap-4 mb-4">
            {tournamentLogo && <img src={tournamentLogo} alt="logo" className="h-16 w-16 object-contain rounded-xl border border-gray-100 flex-shrink-0" />}
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{tournamentName} — Team Registration</h1>
              <p className="text-gray-500 text-sm mt-0.5">Reserve your team spots today</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8" autoComplete="on">
            {/* Club Info */}
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
                  <input
                    name="organization" autoComplete="organization"
                    value={clubName} onChange={e => setClubName(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact <span className="text-red-500">*</span></label>
                  <input
                    required name="name" autoComplete="name"
                    value={clubContact} onChange={e => setClubContact(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact Email <span className="text-red-500">*</span></label>
                  <input
                    required type="email" name="email" autoComplete="email"
                    value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Contact Mobile Phone <span className="text-red-500">*</span></label>
                  <input
                    required type="tel" name="tel" autoComplete="tel"
                    value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Based In</label>
                  <input
                    placeholder="City and State" name="address-level2" autoComplete="address-level2"
                    value={clubBasedIn} onChange={e => setClubBasedIn(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Website</label>
                  <input
                    type="url" placeholder="https://" name="url" autoComplete="url"
                    value={clubWebsite} onChange={e => setClubWebsite(e.target.value)}
                    className={inputCls} />
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

                {/* Club Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club Logo</label>
                  <p className="text-xs text-gray-400 mb-2">Automatically applied to all your teams. You can override per team below.</p>
                  <div className="flex items-center gap-3">
                    {clubLogoUrl && (
                      <img src={clubLogoUrl} alt="Club logo" className="h-12 w-12 object-contain rounded-lg border border-gray-200 flex-shrink-0" />
                    )}
                    <label className={`cursor-pointer border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${clubLogoUploading ? 'opacity-50' : ''}`}>
                      {clubLogoUploading ? 'Uploading…' : clubLogoUrl ? 'Change Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" className="hidden"
                        disabled={clubLogoUploading}
                        onChange={e => e.target.files?.[0] && handleClubLogoUpload(e.target.files[0])} />
                    </label>
                    {clubLogoUrl && (
                      <button type="button" onClick={() => { setClubLogoUrl(''); setTeams(prev => prev.map(t => t.logoUrl === clubLogoUrl ? { ...t, logoUrl: '' } : t)) }}
                        className="text-xs text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Team Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Team Information</h2>
              <div className="space-y-3">
                {teams.map((team, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        {(team.logoUrl || clubLogoUrl) && (
                          <img src={team.logoUrl || clubLogoUrl} alt="logo"
                            className="h-8 w-8 object-contain rounded-lg border border-gray-200 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-600">Team {i + 1}</span>
                      </div>
                      {teams.length > 1 && (
                        <button type="button" onClick={() => removeTeam(i)}
                          className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Club Name <span className="text-red-500">*</span></label>
                        <input required autoComplete="organization"
                          value={team.clubName} onChange={e => updateTeam(i, 'clubName', e.target.value)}
                          className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Team <span className="text-red-500">*</span></label>
                        <input required placeholder="IE: Eagles White" autoComplete="off"
                          value={team.teamName} onChange={e => updateTeam(i, 'teamName', e.target.value)}
                          className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Division <span className="text-red-500">*</span></label>
                        <select required value={team.division} onChange={e => updateTeam(i, 'division', e.target.value)}
                          className={smallInputCls}>
                          <option value="">Choose Division</option>
                          {divisions.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Name <span className="text-red-500">*</span></label>
                        <input required autoComplete="name"
                          value={team.coachName} onChange={e => updateTeam(i, 'coachName', e.target.value)}
                          className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Phone <span className="text-red-500">*</span></label>
                        <input required type="tel" autoComplete="tel"
                          value={team.coachPhone} onChange={e => updateTeam(i, 'coachPhone', e.target.value)}
                          className={smallInputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Coach Email <span className="text-red-500">*</span></label>
                        <input required type="email" autoComplete="email"
                          value={team.coachEmail} onChange={e => updateTeam(i, 'coachEmail', e.target.value)}
                          className={smallInputCls} />
                      </div>
                    </div>

                    {/* Per-team logo override */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Team Logo
                        {clubLogoUrl && !team.logoUrl && <span className="ml-1 text-gray-400 font-normal">(using club logo — upload here to override)</span>}
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && <span className="ml-1 text-green-600 font-normal">✓ custom logo</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && (
                          <img src={team.logoUrl} alt="team logo" className="h-8 w-8 object-contain rounded border border-gray-200 flex-shrink-0" />
                        )}
                        <label className={`cursor-pointer border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white ${teamLogoUploading[i] ? 'opacity-50' : ''}`}>
                          {teamLogoUploading[i] ? 'Uploading…' : team.logoUrl && team.logoUrl !== clubLogoUrl ? 'Change' : 'Upload Custom'}
                          <input type="file" accept="image/*" className="hidden"
                            disabled={teamLogoUploading[i]}
                            onChange={e => e.target.files?.[0] && handleTeamLogoUpload(i, e.target.files[0])} />
                        </label>
                        {team.logoUrl && team.logoUrl !== clubLogoUrl && (
                          <button type="button" onClick={() => updateTeam(i, 'logoUrl', clubLogoUrl)}
                            className="text-xs text-gray-400 hover:text-gray-600">
                            {clubLogoUrl ? 'Use club logo' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={addTeam}
                  className="inline-flex items-center gap-1 border border-orange-400 text-orange-500 hover:bg-orange-50 rounded-lg px-4 py-2 text-sm font-medium">
                  + Add Team
                </button>
                <span className="text-sm text-gray-500">Total Teams: {teams.length}</span>
              </div>
            </section>

            {/* Estimated Total */}
            <section>
              {teams.length > 0 && calcInvoice(teams, pricing) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Estimated Total</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {teams.length} team{teams.length !== 1 ? 's' : ''} ·{' '}
                      <button type="button" onClick={() => setShowFees(!showFees)} className="underline hover:text-blue-800">
                        {showFees ? 'hide fee schedule' : 'view fee schedule'}
                      </button>
                    </p>
                    {showFees && (
                      <div className="mt-2 text-xs text-blue-700 space-y-0.5">
                        <div>1–{pricing.tier1Max} teams: {fmt(pricing.tier1)}/team</div>
                        <div>{pricing.tier1Max + 1}–{pricing.tier2Max} teams: {fmt(pricing.tier2)}/team</div>
                        <div>{pricing.tier2Max + 1}+ teams: {fmt(pricing.tier3)}/team</div>
                        <div>7v7 teams: {fmt(pricing.sevenVSeven)}/team</div>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-800">{fmt(calcInvoice(teams, pricing))}</p>
                    {paymentMethod === 'credit_card' && (
                      <p className="text-xs text-blue-500 mt-0.5">+3% CC fee = {fmt(Math.round(calcInvoice(teams, pricing) * 1.03))}</p>
                    )}
                  </div>
                </div>
              )}

              <h2 className="text-lg font-semibold text-gray-800 mb-3">Payment Options <span className="text-red-500">*</span></h2>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: 'credit_card', label: 'Credit Card' },
                  { value: 'check', label: 'Check' },
                  { value: 'zelle', label: 'Zelle' },
                  { value: 'ach', label: 'ACH' },
                  { value: 'paypal', label: 'PayPal' },
                ].map(opt => (
                  <label key={opt.value} className={`flex items-center gap-2 cursor-pointer text-sm border rounded-lg px-4 py-2 transition-colors ${paymentMethod === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <input type="radio" name="paymentMethod" value={opt.value}
                      checked={paymentMethod === opt.value}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="hidden" />
                    {opt.value === 'credit_card' && '💳 '}
                    {opt.value === 'check' && '✉️ '}
                    {opt.value === 'zelle' && '⚡ '}
                    {opt.value === 'ach' && '🏦 '}
                    {opt.value === 'paypal' && '🅿️ '}
                    {opt.label}
                  </label>
                ))}
              </div>
              {paymentMethod === 'credit_card' && (
                <p className="text-sm text-blue-600 mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">You'll be redirected to a secure Stripe payment page after submitting. A 3% processing fee applies.</p>
              )}
              {paymentMethod === 'zelle' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Please send Zelle to <strong>info@sunshinelax.com</strong></p>
              )}
              {paymentMethod === 'check' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Please mail checks payable to <strong>Sunshine Events Group</strong> to:<br/>11830 Wiles Rd. Coral Springs, FL 33076</p>
              )}
              {paymentMethod === 'ach' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">ACH payment instructions will be provided after registration is confirmed.</p>
              )}
              {paymentMethod === 'paypal' && (
                <p className="text-sm text-gray-600 mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">PayPal payment instructions will be provided after registration is confirmed.</p>
              )}
            </section>

            {/* Notes */}
            <section>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoComplete="off"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </section>

            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
              {loading ? 'Submitting...' : 'Submit Registration'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
