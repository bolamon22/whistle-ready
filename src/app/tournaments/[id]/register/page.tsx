'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

interface TeamRow {
  clubName: string
  teamName: string
  division: string
  coachName: string
  coachPhone: string
  coachEmail: string
}

const emptyTeam = (): TeamRow => ({
  clubName: '', teamName: '', division: '', coachName: '', coachPhone: '', coachEmail: '',
})

const DEFAULT_DIVISIONS = [
  'Boys 2030', 'Boys 2029', 'Boys 2028', 'Boys 2027', 'Boys 2026',
  'Boys 2025', 'Boys 2024', 'Boys 2023',
  'Girls 2030', 'Girls 2029', 'Girls 2028', 'Girls 2027', 'Girls 2026',
  'Girls 2025', 'Girls 2024', 'Girls 2023',
  'HS Boys JV', 'HS Boys Varsity', 'HS Girls JV', 'HS Girls Varsity',
]

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
const smallInputCls = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function RegisterPage() {
  const { id: tournamentId } = useParams()
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [divisions, setDivisions] = useState<string[]>(DEFAULT_DIVISIONS)
  const [submitted, setSubmitted] = useState(false)
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
      })
      .catch(() => {})
  }, [tournamentId])

  const updateTeam = (i: number, field: keyof TeamRow, value: string) => {
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  const addTeam = () => setTeams(prev => [...prev, { ...emptyTeam(), clubName }])
  const removeTeam = (i: number) => setTeams(prev => prev.filter((_, idx) => idx !== i))

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
          needsHotel, paymentMethod, notes, teams,
        }),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
    } catch {
      toast.error('Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-10 max-w-lg text-center">
          {tournamentLogo && <img src={tournamentLogo} alt="logo" className="h-20 w-20 object-contain mx-auto mb-4 rounded-xl" />}
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Registration Received!</h2>
          <p className="text-gray-600">Thank you for registering for <strong>{tournamentName}</strong>. We'll be in touch soon with confirmation details.</p>
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
                  <select required value={needsHotel} onChange={e => setNeedsHotel(e.target.value)}
                    className={inputCls}>
                    <option value="">Select...</option>
                    <option>Yes</option>
                    <option>No</option>
                    <option>Maybe</option>
                  </select>
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
                      <span className="text-sm font-medium text-gray-600">Team {i + 1}</span>
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

            {/* Payment Options */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Payment Options <span className="text-red-500">*</span></h2>
              <div className="flex flex-wrap gap-6">
                {[
                  { value: 'credit_card', label: 'Pay By Credit Card' },
                  { value: 'check', label: 'Pay By Check' },
                  { value: 'zelle', label: 'Pay By Zelle' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="radio" name="paymentMethod" value={opt.value}
                      checked={paymentMethod === opt.value}
                      onChange={e => setPaymentMethod(e.target.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
              {paymentMethod === 'zelle' && (
                <p className="text-sm text-gray-500 mt-2">Please send Zelle to <strong>info@sunshinelax.com</strong></p>
              )}
              {paymentMethod === 'check' && (
                <p className="text-sm text-gray-500 mt-2">Please mail checks payable to <strong>Sunshine Events Group</strong></p>
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
