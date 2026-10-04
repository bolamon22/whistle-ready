'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import PublicChirp from '@/components/PublicChirp'
import toast, { Toaster } from 'react-hot-toast'
import { parsePricing, calcFee, feeScheduleLines, DEFAULT_REG_PRICING, type RegPricing } from '@/lib/regPricing'
import { isDivisionFull, type RegStatusFields } from '@/lib/regStatus'
import { mdToHtml } from '@/app/o/[slug]/_md'
import StripePayPanel, { type PayMethod } from '@/components/StripePayPanel'
import ClubNameHint, { useKnownClubs } from '@/components/ClubNameHint'
import PasswordInput from '@/components/PasswordInput'
import { useSession, signIn, signOut } from 'next-auth/react'
import { nameKey } from '@/lib/names'

interface TeamRow {
  clubName: string
  teamName: string
  division: string
  coachName: string
  coachPhone: string
  coachEmail: string
  logoUrl: string
}

// What the server did about the club's portal login (lib/claim PortalLogin).
// Typed here rather than imported: lib/claim imports the database, and a client
// page must never pull that in.
type PortalResult = { status: 'created' | 'linked' | 'existing_account' | 'none'; email: string; rolePromoted?: boolean }

// A signed-in director's clubs and past teams at this organizer (api/registrations/my-teams).
type MyTeam = { teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string; logoUrl: string; lastEvent: string }
type MyClub = {
  clubName: string; clubBasedIn: string; clubWebsite: string; clubLogoUrl: string
  contact: { name: string; email: string; phone: string }
  registeredHere: boolean; teams: MyTeam[]
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

// Mirrors the server (api/registrations): a team in a full division goes on the
// waiting list, so it is not billed -- but it still counts toward the volume
// tier, so the club keeps the rate it earned by committing the teams. If this
// drifts from calcFee's rule the club is quoted one number and invoiced another,
// which is the worst bug this page could have.
function calcInvoice(teams: TeamRow[], pricing: Pricing, site: RegStatusFields | null): number {
  return calcFee(teams.map(t => ({ division: t.division, waitlisted: isDivisionFull(t.division, site) })), pricing)
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

  const [site, setSite] = useState<RegStatusFields | null>(null)
  const [clubLogoUrl, setClubLogoUrl] = useState('')
  const [clubLogoUploading, setClubLogoUploading] = useState(false)
  const [teamLogoUploading, setTeamLogoUploading] = useState<Record<number, boolean>>({})

  // The club portal login, made right on this form (Bo, Oct 4 2026: "have them
  // create a password at the time of registration"). The contact email is the
  // login, so a password is all that was missing; the server does the rest (lib/
  // claim setUpPortalLogin). Only someone signed out is asked. Signed in as the
  // contact, the registration goes onto that account. Signed in as anyone else
  // (staff entering a club, say), the contact still gets the set-up link by
  // email, so nobody chooses another person's password.
  const { data: session, status: sessionStatus } = useSession()
  const [portalPassword, setPortalPassword] = useState('')
  const [portal, setPortal] = useState<PortalResult | null>(null)
  const [portalSignedIn, setPortalSignedIn] = useState(false)
  const askPassword = sessionStatus === 'unauthenticated'
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  const signedInAsContact = !!sessionEmail && sessionEmail === contactEmail.trim().toLowerCase()
  const staffSession = !!session && !['', 'club_director', 'coach', 'parent', 'viewer'].includes(String((session.user as { role?: string } | undefined)?.role || ''))

  // Same person, same club, another email (Bo, Oct 4 2026: "ask if they want to log
  // in with the email we have on file but allow them to say no"). lib/loginHint finds
  // their login on file; it comes back masked (j•••@g•••.com) with a token naming it.
  // Yes = sign in with it here, and the registration uses that email. No = keep the
  // typed email and set up a new login with the password box as usual.
  const [hint, setHint] = useState<null | { masked: string; token: string }>(null)
  const [hintChoice, setHintChoice] = useState<'' | 'yes' | 'no'>('')
  const [hintPassword, setHintPassword] = useState('')
  const [hintBusy, setHintBusy] = useState(false)
  const [hintErr, setHintErr] = useState('')
  // The on-file login's credentials, kept only until the registration is in, to
  // refresh the sign-in if registering raised their role (it lives in the token).
  const hintCreds = useRef<{ email: string; password: string } | null>(null)
  const hintKey = askPassword && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail.trim()) && nameKey(clubName).length >= 3 && nameKey(clubContact).length >= 4
    ? `${nameKey(clubName)}|${nameKey(clubContact)}|${contactEmail.trim().toLowerCase()}` : ''
  useEffect(() => {
    setHint(null); setHintChoice(''); setHintErr('')
    if (!hintKey) return
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/registrations/login-hint', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ tournamentId, clubName, clubContact, contactEmail }),
        })
        const d = await r.json().catch(() => ({}))
        if (d?.match && d.masked && d.hint) setHint({ masked: String(d.masked), token: String(d.hint) })
      } catch { /* no prompt: they set up a login as usual */ }
    }, 700)
    return () => { clearTimeout(t); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey])

  // Returning directors first (Bo, Oct 4 2026: "log in for easy registration ...
  // see teams they've done in the past and maybe check them off"). Signed out: a
  // sign-in bar at the top of the form, signed in right there so nothing typed is
  // lost. Signed in: their past teams here, ticked to fill in the form.
  const [signInOpen, setSignInOpen] = useState(false)
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siBusy, setSiBusy] = useState(false)
  const [siErr, setSiErr] = useState('')
  const [myClubs, setMyClubs] = useState<MyClub[]>([])
  const [myClubIdx, setMyClubIdx] = useState(0)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [pickerDone, setPickerDone] = useState<'' | 'filled' | 'skipped'>('')
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || staffSession) { setMyClubs([]); return }
    let live = true
    fetch(`/api/registrations/my-teams?tournamentId=${tournamentId}`)
      .then(r => r.ok ? r.json() : { clubs: [] })
      .then(d => { if (live) { setMyClubs(Array.isArray(d?.clubs) ? d.clubs : []); setMyClubIdx(0); setPicked({}) } })
      .catch(() => { /* no picker: they fill in the form as usual */ })
    return () => { live = false }
  }, [sessionStatus, staffSession, tournamentId])

  const signInAtTop = async (e: React.FormEvent) => {
    e.preventDefault()
    if (siBusy) return
    setSiBusy(true); setSiErr('')
    try {
      const addr = siEmail.trim().toLowerCase()
      const r = await signIn('credentials', { email: addr, password: siPassword, redirect: false })
      if (!r?.ok || r?.error) { setSiErr("That email and password don't match. Try again, or reset your password."); return }
      setSiPassword(''); setSignInOpen(false)
      if (!contactEmail.trim()) setContactEmail(addr)
      toast.success('Signed in')
    } catch {
      setSiErr('Could not reach the server. Try again.')
    } finally {
      setSiBusy(false)
    }
  }

  // Tick past teams, fill in the club and those teams. Divisions carry over only
  // where this event has the same one; otherwise they pick it below.
  const fillFromPast = () => {
    const c = myClubs[myClubIdx]
    if (!c) return
    const chosen = c.teams.filter(t => picked[`${myClubIdx}|${t.teamName}`])
    const matchDiv = (d: string) => divisions.find(x => nameKey(x) === nameKey(d)) || ''
    const rows: TeamRow[] = chosen.map(t => ({
      clubName: c.clubName, teamName: t.teamName, division: matchDiv(t.division),
      coachName: t.coachName, coachPhone: t.coachPhone, coachEmail: t.coachEmail, logoUrl: t.logoUrl || c.clubLogoUrl || '',
    }))
    const oldClub = clubName
    setClubName(c.clubName)
    if (c.contact.name) setClubContact(c.contact.name)
    if (c.contact.email) setContactEmail(c.contact.email)
    if (c.contact.phone) setContactPhone(c.contact.phone)
    if (c.clubBasedIn) setClubBasedIn(c.clubBasedIn)
    if (c.clubWebsite) setClubWebsite(c.clubWebsite)
    if (c.clubLogoUrl) setClubLogoUrl(c.clubLogoUrl)
    setTeams(prev => {
      // Rows they already started stay; the empty starter row goes.
      const kept = prev.filter(t => t.teamName.trim() || t.coachName.trim() || t.division)
        .map(t => (!t.clubName || t.clubName === oldClub) ? { ...t, clubName: c.clubName } : t)
      for (const r of rows) if (!kept.some(k => nameKey(k.teamName) === nameKey(r.teamName))) kept.push(r)
      return kept.length ? kept : [{ ...emptyTeam(), clubName: c.clubName, logoUrl: c.clubLogoUrl || '' }]
    })
    setPickerDone('filled')
    toast.success(`Filled in ${c.clubName}${rows.length ? ` and ${rows.length} team${rows.length === 1 ? '' : 's'}` : ''}. Pick each team's division below.`)
    setTimeout(() => document.getElementById('team-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const myClub = myClubs[myClubIdx] || null
  const pickedCount = myClub ? myClub.teams.filter(t => picked[`${myClubIdx}|${t.teamName}`]).length : 0
  const firstName = String(session?.user?.name || '').trim().split(' ')[0]

  const signInOnFile = async () => {
    if (!hint || !hintPassword || hintBusy) return
    setHintBusy(true); setHintErr('')
    try {
      const r = await fetch('/api/registrations/login-hint/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hint: hint.token, password: hintPassword }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d?.email) {
        setHintErr(r.status === 429 ? 'Too many tries. Wait a few minutes, or reset the password.' : `That isn't the password for ${hint.masked}.`)
        return
      }
      const res = await signIn('credentials', { email: d.email, password: hintPassword, redirect: false })
      if (!res?.ok || res?.error) { setHintErr('Could not sign you in. Try again.'); return }
      hintCreds.current = { email: d.email, password: hintPassword }
      setContactEmail(d.email)
      setHint(null); setHintChoice(''); setHintPassword('')
      toast.success('Signed in. This registration goes into your club portal.')
    } catch {
      setHintErr('Could not reach the server. Try again.')
    } finally {
      setHintBusy(false)
    }
  }

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
    // Which divisions are marked full, so this form quotes what will be invoiced.
    fetch(`/api/tournaments/${tournamentId}/site`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d === 'object') setSite(d) })
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
    if (askPassword && hint && hintChoice !== 'no') {
      toast.error(hintChoice === 'yes'
        ? 'Sign in with your login on file first, or choose to set up a new login.'
        : 'You have a login on file. Choose whether to sign in with it or set up a new one.')
      document.getElementById('login-on-file')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (askPassword && portalPassword.length < 8) { toast.error('Choose a club portal password of at least 8 characters'); return }
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
          // Signed out only: see askPassword.
          portalPassword: askPassword ? portalPassword : undefined,
        }),
      })
      if (!res.ok) throw new Error('Registration failed')
      const registration = await res.json()
      setConf(registration.confirmation || null)

      // The login is ready: sign them in now, before any payment step, so "Open
      // my club portal" lands inside it instead of on the sign-in page.
      const P: PortalResult | null = registration.portal || null
      setPortal(P)
      if (askPassword && P && (P.status === 'created' || P.status === 'linked')) {
        try {
          const r = await signIn('credentials', { email: P.email || contactEmail.trim().toLowerCase(), password: portalPassword, redirect: false })
          setPortalSignedIn(!!r?.ok && !r?.error)
        } catch { /* the portal button falls back to the sign-in page */ }
      }
      // Signed in with their login on file just now and registering raised its role:
      // sign in once more so the portal sees the new role (it lives in the token).
      if (!askPassword && P?.rolePromoted && hintCreds.current) {
        try {
          const r = await signIn('credentials', { ...hintCreds.current, redirect: false })
          setPortalSignedIn(!!r?.ok && !r?.error)
        } catch { /* the Sign in to open my portal button covers it */ }
      }
      hintCreds.current = null
      setPortalPassword('')

      if (paymentMethod === 'credit_card' || paymentMethod === 'ach' || (paymentMethod === 'paypal' && paypalLive)) {
        setInvoiceBase(calcInvoice(teams, pricing, site))
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
    // Signed in already and their role was just raised to club director: the old
    // role is in their sign-in token until they sign in again (same as /claim).
    const resignIn = !!portal?.rolePromoted && !portalSignedIn && sessionStatus === 'authenticated'
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="bg-white rounded-2xl shadow border border-slate-100 p-8 max-w-xl mx-auto">
          {tournamentLogo && <img src={tournamentLogo} alt="" className="h-16 w-16 object-contain mx-auto mb-3 rounded-xl" />}
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-1">{donePaid && !achNote ? 'Payment complete!' : L?.allWaitlisted ? "You're on the waiting list" : 'Registration received!'}</h2>
          {L ? (
            <div className="mt-4 text-left">
              <p className="font-semibold text-slate-800">{L.greeting}</p>
              <div className="text-slate-600 text-sm mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(L.welcome) }} />
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden text-sm">
                <div className="flex justify-between px-4 py-2 bg-slate-50"><span className="text-slate-500">Club</span><span className="font-semibold text-slate-800">{D?.clubName}</span></div>
                {L.teams.map((t: any, i: number) => <div key={i} className="flex justify-between gap-2 px-4 py-2 border-t border-slate-100"><span className="text-slate-700">{t.team}</span><span className="text-slate-500 text-right">{t.division}{t.waitlisted && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 rounded-full px-2 py-0.5 whitespace-nowrap">Waiting list</span>}</span></div>)}
                <div className="flex justify-between px-4 py-2 border-t border-slate-100"><span className="text-slate-500">Teams</span><span className="font-semibold text-slate-800">{L.numTeams}</span></div>
              </div>
              {/* Same note as the email, so the screen and the inbox say the same
                  thing about which teams are in and which are waiting. */}
              {L.waitlistNote && <div className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: mdToHtml(L.waitlistNote) }} />}
              {achNote === 'processing' && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">Bank transfer (ACH) initiated — it typically clears within 4 business days, and we&apos;ll mark your registration paid automatically once it does.</p>}
              {achNote === 'micro' && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">One more step: Stripe is sending a small verification deposit to your bank (1&ndash;2 days). Follow the emailed instructions{microUrl ? <> or <a href={microUrl} className="underline" target="_blank" rel="noreferrer">verify here</a></> : null} to complete your payment.</p>}
              {!achNote && (donePaid || L.payment) && <p className="mt-3 text-sm bg-teal-50 border border-teal-100 text-teal-800 rounded-lg px-3 py-2">{donePaid ? "Payment received — you're all set." : L.payment}</p>}

              {/* Account CTA — the main next step. Shown here (not just in the email)
                  because this is the moment the coach is actually paying attention.
                  Made or linked on the form just now: the portal is ready. A password
                  that isn't the email's existing login changed nothing, so they add
                  the event with the real one. Anyone else: the claim link sets it up. */}
              {portal && (portal.status === 'created' || portal.status === 'linked') ? (
                <div className="mt-4 border border-teal-200 bg-teal-50 rounded-xl px-4 py-4">
                  <p className="text-sm font-semibold text-slate-800">{portal.status === 'created' ? 'Your club portal is ready' : 'Added to your club portal'}</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {portal.status === 'created'
                      ? <>Sign in any time with <strong className="text-slate-800">{portal.email}</strong> and the password you chose. </>
                      : <>This registration is on your login, <strong className="text-slate-800">{portal.email}</strong>. </>}
                    Manage your roster and player waivers, track your balance, and see your schedule as soon as it&apos;s posted.{resignIn ? ' Sign in once more and it opens with your club access.' : ''}
                  </p>
                  {resignIn ? (
                    <button type="button" onClick={async () => { await signOut({ redirect: false }).catch(() => {}); window.location.href = '/login?claimed=1' }}
                      className="inline-block mt-3 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">
                      Sign in to open my portal →
                    </button>
                  ) : (
                    <a href={sessionStatus === 'authenticated' && signedInAsContact ? '/dashboard/club-director' : '/login'}
                      className="inline-block mt-3 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">
                      Open my club portal →
                    </a>
                  )}
                </div>
              ) : portal?.status === 'existing_account' ? (
                <div className="mt-4 border border-amber-200 bg-amber-50 rounded-xl px-4 py-4">
                  <p className="text-sm font-semibold text-amber-900">That email already has a login</p>
                  <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                    Your registration is in. <strong>{portal.email}</strong> already has a Whistle Ready login, and the password you typed doesn&apos;t match it, so nothing on that login was changed. Add this registration to it with your existing password{D?.claimUrl ? '' : ', using the link in your confirmation email'}.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {D?.claimUrl && (
                      <a href={D.claimUrl} className="inline-block text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">Add it to my portal →</a>
                    )}
                    <a href="/forgot" target="_blank" rel="noreferrer" className="text-xs font-medium text-amber-900 underline">Forgot your password?</a>
                  </div>
                </div>
              ) : D?.claimUrl && session && !signedInAsContact ? (
                <p className="mt-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                  <strong className="text-slate-800">{contactEmail.trim()}</strong> gets an email link to set up the club portal login for this registration.
                </p>
              ) : D?.claimUrl ? (
                <div className="mt-4 border border-slate-200 bg-slate-50 rounded-xl px-4 py-4">
                  <p className="text-sm font-semibold text-slate-800">{D.claimForExisting ? 'Add this event to your club portal' : 'Set up your team account'}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {D.claimForExisting ? 'You already have a Whistle Ready login with this email. Add this registration to it with your password. ' : ''}Manage your roster and player waivers, track your balance, and see your schedule as soon as it&apos;s posted.
                  </p>
                  <a href={D.claimUrl}
                    className="inline-block mt-3 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5">
                    {D.claimForExisting ? 'Add it to my portal →' : 'Set up my account →'}
                  </a>
                </div>
              ) : null}
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
          {/* Returning directors first: sign in here (its own small form, so Enter
              signs in rather than submitting the registration). */}
          {askPassword && (
            <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Registered a team with us before?</p>
                  <p className="text-xs text-slate-600 mt-0.5">Sign in to fill in your club and pick the teams you&apos;re bringing.</p>
                </div>
                {!signInOpen && (
                  <button type="button" onClick={() => setSignInOpen(true)}
                    className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2">
                    Sign in
                  </button>
                )}
              </div>
              {signInOpen && (
                <form onSubmit={signInAtTop} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                  <input type="email" required autoComplete="username" placeholder="Email" value={siEmail} onChange={e => setSiEmail(e.target.value)}
                    aria-label="Email" className={`${inputCls} bg-white`} />
                  <PasswordInput value={siPassword} onChange={setSiPassword} required autoComplete="current-password" placeholder="Password"
                    className={`${inputCls} bg-white`} />
                  <button type="submit" disabled={siBusy}
                    className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                    {siBusy ? 'Signing in…' : 'Sign in'}
                  </button>
                  {siErr && <p role="alert" className="sm:col-span-3 text-xs text-red-600">{siErr}</p>}
                  <p className="sm:col-span-3 text-xs text-slate-500">
                    <a href="/forgot" target="_blank" rel="noreferrer" className="underline hover:text-slate-700">Forgot your password?</a>
                    {' · '}New here? Just fill in the form below.
                  </p>
                </form>
              )}
            </div>
          )}
          {/* Signed in with past teams: tick the ones coming (api/registrations/my-teams). */}
          {!askPassword && !staffSession && myClub && !pickerDone && (
            <div className="mb-6 rounded-xl border border-teal-200 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-800">Welcome back{firstName ? `, ${firstName}` : ''}.</p>
              <p className="text-xs text-slate-600 mt-0.5">Pick the teams you&apos;re bringing to {tournamentName || 'this event'}. We&apos;ll fill in your club, and you choose each team&apos;s division below.</p>
              {myClubs.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {myClubs.map((c, i) => (
                    <button key={c.clubName} type="button" onClick={() => { setMyClubIdx(i); setPicked({}) }}
                      className={`text-xs font-semibold rounded-full px-3 py-1 border ${i === myClubIdx ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                      {c.clubName}
                    </button>
                  ))}
                </div>
              )}
              {myClub.registeredHere && (
                <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                  You&apos;ve already registered {myClub.clubName} for {tournamentName || 'this event'}. To add teams to it, use{' '}
                  <a href="/dashboard/club-director" className="underline font-semibold">your club portal</a>. Registering again here starts a second registration with its own invoice.
                </p>
              )}
              {myClub.teams.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {myClub.teams.map(t => {
                    const k = `${myClubIdx}|${t.teamName}`
                    return (
                      <li key={k}>
                        <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={!!picked[k]} onChange={e => setPicked(p => ({ ...p, [k]: e.target.checked }))}
                            className="mt-0.5 h-4 w-4 accent-teal-600 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-800">{t.teamName}</span>
                            <span className="block text-xs text-slate-500">{[t.division, t.coachName ? `Coach ${t.coachName}` : '', t.lastEvent ? `last at ${t.lastEvent}` : ''].filter(Boolean).join(' · ')}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">No past teams on file for {myClub.clubName}.</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" onClick={fillFromPast}
                  className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2">
                  {pickedCount ? `Fill in ${myClub.clubName} and ${pickedCount} team${pickedCount === 1 ? '' : 's'}` : `Fill in ${myClub.clubName}`}
                </button>
                <button type="button" onClick={() => setPickerDone('skipped')} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Start from a blank form
                </button>
              </div>
            </div>
          )}
          {!askPassword && !staffSession && myClub && pickerDone && (
            <p className="mb-6 text-xs text-slate-500">
              {pickerDone === 'filled' ? 'Filled in from your past registrations. ' : ''}
              <button type="button" onClick={() => setPickerDone('')} className="underline hover:text-slate-700">Pick from your past teams</button>
            </p>
          )}
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
                {/* Their login on file under another email (lib/loginHint). */}
                {askPassword && hint && hintChoice !== 'no' && (
                  <div id="login-on-file" className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">Have you registered before?</p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {clubContact.trim()} at {clubName.trim()} already has a Whistle Ready login with <strong className="text-slate-800">{hint.masked}</strong>.
                      Sign in with it to keep your clubs in one portal, or keep <strong className="text-slate-800">{contactEmail.trim()}</strong> and set up a new login.
                    </p>
                    {hintChoice === '' ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setHintChoice('yes'); setHintErr('') }}
                          className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3.5 py-2">
                          Yes, sign in with {hint.masked}
                        </button>
                        <button type="button" onClick={() => setHintChoice('no')}
                          className="text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-lg px-3.5 py-2">
                          No, set up a new login
                        </button>
                      </div>
                    ) : (
                      // Enter here signs in; it must not submit the whole registration.
                      <div className="mt-2.5" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); signInOnFile() } }}>
                        <label htmlFor="hint-password" className="block text-xs font-medium text-slate-700 mb-1">Password for {hint.masked}</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="flex-1">
                            <PasswordInput id="hint-password" value={hintPassword} onChange={setHintPassword} autoComplete="current-password" autoFocus
                              className={`${inputCls} bg-white`} />
                          </div>
                          <button type="button" onClick={signInOnFile} disabled={hintBusy || !hintPassword}
                            className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg px-4 py-2">
                            {hintBusy ? 'Signing in…' : 'Sign in'}
                          </button>
                        </div>
                        {hintErr && <p role="alert" className="text-xs text-red-600 mt-1">{hintErr}</p>}
                        <p className="text-xs text-slate-500 mt-1.5">
                          <a href="/forgot" target="_blank" rel="noreferrer" className="underline hover:text-slate-700">Forgot it?</a>
                          {' · '}
                          <button type="button" onClick={() => setHintChoice('no')} className="underline hover:text-slate-700">Use {contactEmail.trim()} instead</button>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {/* The club portal login, right under the email it belongs to. */}
                {askPassword ? ((!hint || hintChoice === 'no') && (
                  <div className="sm:col-span-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                    <label htmlFor="portal-password" className="block text-sm font-semibold text-slate-800">Create a password for your club <span className="whitespace-nowrap">portal <span className="text-red-500">*</span></span></label>
                    <p className="text-xs text-slate-600 mt-0.5 mb-2 leading-relaxed">Your contact email is your login. With a password, your portal is ready the moment you register: teams, player waivers, your balance, and the schedule once it&apos;s posted.</p>
                    {/* Tells password managers which account this password is for. Without
                        it they guess from the field just above it: the phone number. */}
                    <input type="text" name="username" autoComplete="username" value={contactEmail} readOnly hidden />
                    <PasswordInput id="portal-password" name="new-password" value={portalPassword} onChange={setPortalPassword}
                      required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={`${inputCls} bg-white`} />
                    <p className="text-xs text-slate-500 mt-1.5">Already have a Whistle Ready login with this email? Use that password. <a href="/forgot" target="_blank" rel="noreferrer" className="underline hover:text-slate-700">Forgot it?</a></p>
                  </div>
                )) : session ? (
                  <p className="sm:col-span-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
                    {signedInAsContact
                      ? <>Signed in as <strong className="text-slate-800">{sessionEmail}</strong>: this registration goes straight into your club portal.</>
                      : <>Signed in as <strong className="text-slate-800">{sessionEmail}</strong>. {contactEmail.trim() ? <><strong className="text-slate-800">{contactEmail.trim()}</strong> gets</> : 'The club contact gets'} an email link to set up their own club portal login.{staffSession ? '' : ' To add this registration to your own portal, use your email as the contact email.'}</>}
                  </p>
                ) : null}
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

            <section id="team-info" className="scroll-mt-4">
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
                          {divisions.map(d => <option key={d} value={d}>{d}{isDivisionFull(d, site) ? ' — full, waiting list' : ''}</option>)}
                        </select>
                        {isDivisionFull(team.division, site) && (
                          <p className="text-xs text-amber-700 mt-1">On the waiting list — not included in your total below.</p>
                        )}
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
              {teams.length > 0 && calcInvoice(teams, pricing, site) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Estimated Total</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {teams.filter(t => !isDivisionFull(t.division, site)).length} team{teams.filter(t => !isDivisionFull(t.division, site)).length !== 1 ? 's' : ''} &middot;{' '}
                      <button type="button" onClick={() => setShowFees(!showFees)} className="underline hover:text-blue-800">
                        {showFees ? 'hide fee schedule' : 'view fee schedule'}
                      </button>
                    </p>
                    {teams.some(t => isDivisionFull(t.division, site)) && (
                      <p className="text-xs text-amber-700 mt-1">
                        {teams.filter(t => isDivisionFull(t.division, site)).length} on the waiting list — not billed.
                        We will be in touch if a spot opens.
                      </p>
                    )}
                    {showFees && (
                      <div className="mt-2 text-xs text-blue-700 space-y-0.5">
                        {feeScheduleLines(pricing).map((line, i) => <div key={i}>{line}</div>)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-800">{fmt(calcInvoice(teams, pricing, site))}</p>
                    {paymentMethod === 'credit_card' && (
                      <p className="text-xs text-blue-500 mt-0.5">+3% CC fee = {fmt(Math.round(calcInvoice(teams, pricing, site) * 1.03))}</p>
                    )}
                    {paymentMethod === 'ach' && (
                      <p className="text-xs text-teal-600 mt-0.5">No fee with bank transfer (ACH)</p>
                    )}
                    {paymentMethod === 'paypal' && paypalLive && (
                      <p className="text-xs text-blue-500 mt-0.5">+3% fee = {fmt(Math.round(calcInvoice(teams, pricing, site) * 1.03))}</p>
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
