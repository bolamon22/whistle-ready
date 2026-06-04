'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

const GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear - 1919 }, (_, i) => String(currentYear - i))

export default function PlayerRegisterPage() {
  const { id: tournamentId } = useParams()
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  // Player info
  const [playerName, setPlayerName] = useState('')
  const [playerEmail, setPlayerEmail] = useState('')
  const [usLacrosseNumber, setUsLacrosseNumber] = useState('')
  const [gender, setGender] = useState('')
  const [dobMonth, setDobMonth] = useState('')
  const [dobDay, setDobDay] = useState('')
  const [dobYear, setDobYear] = useState('')
  const [grade, setGrade] = useState('')
  const [teamClubName, setTeamClubName] = useState('')
  const [jerseyNumber, setJerseyNumber] = useState('')

  // Parent info
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parent2Name, setParent2Name] = useState('')
  const [parent2Email, setParent2Email] = useState('')
  const [parent2Phone, setParent2Phone] = useState('')

  // Emergency contact
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')

  // Waiver
  const [waiverSignature, setWaiverSignature] = useState('')
  const [waiverAgreed, setWaiverAgreed] = useState(false)

  // Other
  const [needsHotel, setNeedsHotel] = useState('')
  const [wantsUpdates, setWantsUpdates] = useState(false)

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}`)
      .then(r => r.json())
      .then(d => {
        setTournamentName(d.name || 'Tournament')
        if (d.logoUrl) setTournamentLogo(d.logoUrl)
      })
      .catch(() => {})
  }, [tournamentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waiverAgreed) { toast.error('You must agree to the waiver'); return }
    if (!waiverSignature.trim()) { toast.error('Please type your signature'); return }
    if (!needsHotel) { toast.error('Please select hotel preference'); return }

    const dob = dobMonth && dobDay && dobYear ? `${dobMonth} ${dobDay}, ${dobYear}` : ''

    setLoading(true)
    try {
      const res = await fetch('/api/player-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId, playerName, playerEmail, usLacrosseNumber,
          gender, dob, grade, teamClubName, jerseyNumber,
          parentName, parentEmail, parentPhone,
          parent2Name, parent2Email, parent2Phone,
          emergencyContactName, emergencyContactPhone,
          waiverSignature, needsHotel, wantsUpdates,
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
          <p className="text-gray-600">Thank you for registering for <strong>{tournamentName}</strong>. We'll be in touch with confirmation details.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <Toaster />
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            {tournamentLogo && (
              <img src={tournamentLogo} alt="logo" className="h-16 w-16 object-contain rounded-xl border border-gray-100 flex-shrink-0" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{tournamentName} — Player Registration</h1>
              <p className="text-gray-500 text-sm mt-0.5">All players are required to complete this form to compete in the tournament</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8" autoComplete="on">

            {/* Player Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Player Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Full Name <span className="text-red-500">*</span></label>
                  <input required autoComplete="name" value={playerName}
                    onChange={e => setPlayerName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Email</label>
                  <input type="email" autoComplete="email" value={playerEmail}
                    onChange={e => setPlayerEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    US Lacrosse Member Number <span className="text-red-500">*</span>
                  </label>
                  <input required value={usLacrosseNumber}
                    onChange={e => setUsLacrosseNumber(e.target.value)} className={inputCls} />
                  <p className="text-xs text-blue-600 mt-1">
                    <a href="https://www.uslacrosse.org/membership/member-lookup" target="_blank" rel="noopener noreferrer" className="hover:underline">
                      US Lacrosse Member Look Up →
                    </a>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-red-500">*</span></label>
                  <select required value={gender} onChange={e => setGender(e.target.value)} className={inputCls}>
                    <option value="">Please Select</option>
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={dobMonth} onChange={e => setDobMonth(e.target.value)} className={inputCls}>
                      <option value="">Month</option>
                      {MONTHS.map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select value={dobDay} onChange={e => setDobDay(e.target.value)} className={inputCls}>
                      <option value="">Day</option>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <select value={dobYear} onChange={e => setDobYear(e.target.value)} className={inputCls}>
                      <option value="">Year</option>
                      {YEARS.map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Grade <span className="text-red-500">*</span></label>
                  <select required value={grade} onChange={e => setGrade(e.target.value)} className={inputCls}>
                    <option value="">Please Select</option>
                    {GRADES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team or Club Name <span className="text-red-500">*</span></label>
                  <input required autoComplete="organization" value={teamClubName}
                    onChange={e => setTeamClubName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Player Jersey Number</label>
                  <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Parent Information */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Parent Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Name <span className="text-red-500">*</span></label>
                  <input required autoComplete="name" value={parentName}
                    onChange={e => setParentName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Email <span className="text-red-500">*</span></label>
                  <input required type="email" autoComplete="email" value={parentEmail}
                    onChange={e => setParentEmail(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Mobile Phone <span className="text-red-500">*</span></label>
                  <input required type="tel" autoComplete="tel" placeholder="(000) 000-0000" value={parentPhone}
                    onChange={e => setParentPhone(e.target.value)} className={inputCls} />
                </div>
                <div />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent 2 Full Name</label>
                  <input autoComplete="name" value={parent2Name}
                    onChange={e => setParent2Name(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent 2 Email</label>
                  <input type="email" autoComplete="email" value={parent2Email}
                    onChange={e => setParent2Email(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent 2 Mobile Phone</label>
                  <input type="tel" autoComplete="tel" placeholder="(000) 000-0000" value={parent2Phone}
                    onChange={e => setParent2Phone(e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Emergency Contact */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Emergency Contact</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name <span className="text-red-500">*</span></label>
                  <input required value={emergencyContactName}
                    onChange={e => setEmergencyContactName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone <span className="text-red-500">*</span></label>
                  <input required type="tel" placeholder="(000) 000-0000" value={emergencyContactPhone}
                    onChange={e => setEmergencyContactPhone(e.target.value)} className={inputCls} />
                </div>
              </div>
            </section>

            {/* Waiver */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">Player Participation Waiver &amp; Release of Liability</h2>
              <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-600 space-y-4 max-h-72 overflow-y-auto border border-gray-200">
                <div>
                  <p className="font-semibold text-gray-700 mb-1">1. Acknowledgment of Risk</p>
                  <p>I understand that lacrosse is a high-intensity sport involving aggressive play and physical contact. I acknowledge that participation carries inherent risks, including but not limited to:</p>
                  <ul className="list-disc ml-5 mt-1 space-y-0.5">
                    <li>Serious physical injury, permanent disability, or death.</li>
                    <li>Head and neck injuries, including concussions, even when proper protective headgear is worn.</li>
                    <li>Exposure to communicable diseases or illnesses.</li>
                  </ul>
                  <p className="mt-1">I voluntarily and freely choose to incur these risks and assume full responsibility for my/my child's participation.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">2. Medical Authorization &amp; Responsibility</p>
                  <p>In the event of an injury or medical emergency, I hereby grant permission to Sunshine Lax, Sunshine Events Group, and their contracted athletic trainers or staff to facilitate medical treatment. I authorize transport to the nearest medical facility and treatment by hospital staff. I understand and agree that I am solely responsible for all costs associated with such medical treatment, including ambulance transport.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">3. Release of Liability &amp; Hold Harmless</p>
                  <p>I, for myself, my heirs, and my personal representatives, hereby release, waive, discharge, and hold harmless Sunshine Lax, Sunshine Events Group, its owners, employees, coaches, volunteers, and the city and facility in which the event takes place from any and all liability, claims, or causes of action arising out of participation in this event.</p>
                  <p className="mt-1">This includes, but is not limited to, claims arising from the ordinary negligence of the parties released above. I agree not to sue any of the aforementioned parties for any injury or damage resulting from participation in league activities.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">4. Media Release</p>
                  <p>I grant Sunshine Lax and Sunshine Events Group the right to use photographs or video footage of me/my child taken during activities for promotional, social media, or marketing purposes without further compensation.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">5. Electronic Signature &amp; Verification</p>
                  <p>By submitting this form, I verify that I have read and understood this waiver in its entirety, I am at least 18 years of age, I am the participant or the legal parent/guardian of the minor participant registered, and I agree that this digital acknowledgment carries the same legal weight as a handwritten signature.</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                    checked={waiverAgreed} onChange={e => setWaiverAgreed(e.target.checked)} />
                  <span className="text-sm text-gray-700">I agree to the terms of the Player Participation Waiver &amp; Release of Liability <span className="text-red-500">*</span></span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Electronic Signature — Type your full name <span className="text-red-500">*</span>
                  </label>
                  <input value={waiverSignature} onChange={e => setWaiverSignature(e.target.value)}
                    placeholder="Type your full legal name" className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">By typing your name you certify that you are the person named or the legal parent/guardian of the minor participant and that your typed name constitutes your legal electronic signature.</p>
                </div>
              </div>
            </section>

            {/* Hotel */}
            <section>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Is your family staying at a hotel or vacation rental during the tournament? <span className="text-red-500">*</span>
                </label>
                <select required value={needsHotel} onChange={e => setNeedsHotel(e.target.value)} className={inputCls}>
                  <option value="">Please Select</option>
                  <option>Yes</option>
                  <option>No</option>
                  <option>Maybe</option>
                </select>
              </div>
            </section>

            {/* Newsletter */}
            <section>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  checked={wantsUpdates} onChange={e => setWantsUpdates(e.target.checked)} />
                <span className="text-sm text-gray-700">Stay in the loop — I would like to get the latest updates, exclusive offers, and helpful tips delivered straight to my inbox</span>
              </label>
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
