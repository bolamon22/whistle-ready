'use client'

// Public staff recruiting signup — the page behind the org's recruiting link
// (Staff Pool → "Recruiting link"; short form /join/<code>). Code-gated: see
// /api/join for the gate, the duplicate guard (an email already in the pool links
// to that Worker), event self-signup (RosterEntry), the headshot (staff ID card),
// and the welcome email. Redesigned Sep 2026 to Bo's approved mockup.

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Check, Clock, CreditCard, Camera, Printer } from 'lucide-react'
import StaffIdCard from '@/components/StaffIdCard'

const ROLES = [
  { value: 'ref', label: 'Referee', desc: 'Officiate games on the field',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2v20M7 4.5v15M17 4.5v15" /></svg> },
  { value: 'scorekeeper', label: 'Scorekeeper', desc: 'Track scores and game stats',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6v4H9zM9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="M9 12h6M9 16h4" /></svg> },
  { value: 'field_ops', label: 'Field Ops', desc: 'Field setup and operations',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 6l-8.5 8.5a2.1 2.1 0 0 0 3 3L17 9" /><path d="M12 8l4 4M14 4l6 6M19 3l2 2" /></svg> },
  { value: 'athletic_trainer', label: 'Athletic Trainer', desc: 'Player health and safety',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></svg> },
]

const GENDERS = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'both', label: 'Both' },
]

const CERT_LEVELS = [
  { value: 'youth', label: 'Youth' },
  { value: 'hs', label: 'High School' },
  { value: 'college', label: 'College' },
  { value: 'none', label: 'N/A' },
]

type JoinEvent = { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl?: string }

function fmtRange(a: string, b: string) {
  const f = (d: string) => { const t = new Date(d.includes('T') ? d : d + 'T12:00:00'); return isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  const s1 = f(a), s2 = b && b !== a ? f(b) : ''
  return s1 ? (s2 ? `${s1} – ${s2}` : s1) : ''
}

/** Downscale a headshot to ≤512px JPEG data URL so it travels in the signup POST. */
function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 512
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.width * scale))
      c.height = Math.max(1, Math.round(img.height * scale))
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return }
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')) }
    img.src = url
  })
}

import { Suspense } from 'react'

function JoinForm() {
  const searchParams = useSearchParams()
  const orgId = searchParams.get('org') || ''
  const code = searchParams.get('code') || ''
  const roleParam = searchParams.get('role') || ''

  const [linkState, setLinkState] = useState<'loading' | 'invalid' | 'valid'>('loading')
  const [orgName, setOrgName] = useState<string | null>(null)
  const [events, setEvents] = useState<JoinEvent[]>([])
  const [selEvents, setSelEvents] = useState<Set<string>>(new Set())

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState(ROLES.some(r => r.value === roleParam) ? roleParam : '')
  const [gender, setGender] = useState('both')
  const [certLevel, setCertLevel] = useState('youth')
  const [photo, setPhoto] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const [payMethod, setPayMethod] = useState('check')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [zelleHandle, setZelleHandle] = useState('')
  const [mailingAddress, setMailingAddress] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hpExtra, setHpExtra] = useState('') // honeypot — humans never see it
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [doneEvents, setDoneEvents] = useState<{ name: string; logoUrl?: string }[]>([])
  const [doneWorkerId, setDoneWorkerId] = useState('')
  const [doneQr, setDoneQr] = useState('')
  const [linked, setLinked] = useState(false)

  useEffect(() => {
    if (!code) { setLinkState('invalid'); return }
    fetch(`/api/join?code=${encodeURIComponent(code)}${orgId ? `&org=${encodeURIComponent(orgId)}` : ''}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setLinkState('invalid'); return }
        setOrgName(d.orgName ?? null)
        setEvents(Array.isArray(d.events) ? d.events : [])
        setLinkState('valid')
      })
      .catch(() => setLinkState('invalid'))
  }, [orgId, code])

  // Real QR for the finished card on the welcome screen (workerId comes back from the signup)
  useEffect(() => {
    if (!doneWorkerId) return
    const url = `${window.location.origin}/verify/${doneWorkerId}`
    import('qrcode').then(m => m.default.toDataURL(url, { width: 220, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then(setDoneQr).catch(() => setDoneQr(''))
  }, [doneWorkerId])

  function toggleEvent(id: string) {
    setSelEvents(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    try { setPhoto(await compressPhoto(file)) } catch { setError('Could not read that image — try another photo') }
    finally { setPhotoBusy(false); if (photoRef.current) photoRef.current.value = '' }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) { setError('Please select your role'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSubmitting(true)
    setError('')

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org: orgId, code, name, email, phone: phone || null, role, gender, certLevel, password,
        tournamentIds: Array.from(selEvents), photo: photo || null, hp_extra: hpExtra,
        payMethod, venmoHandle: venmoHandle || null, zelleHandle: zelleHandle || null, mailingAddress: mailingAddress || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'Could not sign you up'); setSubmitting(false); return }

    setLinked(!!data.linked)
    setDoneEvents(Array.isArray(data.events) ? data.events : [])
    setDoneWorkerId(typeof data.workerId === 'string' ? data.workerId : '')
    setDone(true)
  }

  if (linkState === 'loading') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Checking your link…</p>
    </div>
  )

  if (linkState === 'invalid') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">This signup link isn't active</h1>
        <p className="text-sm text-slate-500">Ask your assigner or coordinator for the current link — or if you already have an account, just sign in.</p>
        <Link href="/login" className="inline-block mt-5 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors">
          Sign in →
        </Link>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center mx-auto">
          <Check size={30} className="text-teal-700" strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mt-4">Welcome to the crew{name ? `, ${name.split(' ')[0]}` : ''}!</h1>
        <p className="text-sm text-slate-500 mt-2">
          {linked
            ? `Good news — you were already on the ${orgName ?? 'staff'} list, so we connected your new login to your existing record.`
            : `You're on the ${orgName ?? ''} staff list. We sent a welcome email with everything below.`}
        </p>
        {doneEvents.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {doneEvents.map(ev => (
              <span key={ev.name} className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1">{ev.name}</span>
            ))}
          </div>
        )}
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #staff-card, #staff-card * { visibility: visible !important; }
            #staff-card { position: fixed !important; left: 0.5in; top: 0.5in; margin: 0; box-shadow: none !important; transform: none !important; }
          }
        `}</style>
        <div className="flex justify-center mt-5">
          <StaffIdCard
            cardId="staff-card"
            scale={1.15}
            name={name}
            defaultRole={role || 'ref'}
            gender={role === 'ref' ? gender : ''}
            certLevel={role === 'ref' ? certLevel : ''}
            events={doneEvents}
            orgName={orgName || 'Whistle Ready'}
            photoUrl={photo || null}
            qrDataUrl={doneQr || null}
            workerId={doneWorkerId || null}
          />
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 text-xs font-bold text-teal-700 border border-teal-200 bg-teal-50 rounded-xl px-4 py-2 mt-3">
          <Printer size={14} /> Print my staff ID
        </button>
        <div className="text-left mt-6 space-y-3">
          {['Sign in to your staff portal — your events and schedule live there.',
            'Set your availability for each event you signed up for.',
            'Game assignments land in your portal; pay follows each event.'].map((step, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-[#0f1f3d] text-white text-xs font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>
              <p className="text-xs text-slate-600 leading-relaxed pt-1">{step}</p>
            </div>
          ))}
        </div>
        <Link href="/login" className="block bg-teal-500 hover:bg-teal-400 text-white font-bold text-sm py-3 rounded-xl transition-colors mt-6">
          Sign in to your portal →
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-5xl lg:flex lg:justify-center lg:items-start lg:gap-10">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md lg:max-w-2xl mx-auto lg:mx-0 overflow-hidden">

        {/* Header */}
        <div className="bg-[#0f1f3d] px-6 py-5">
          <p className="text-xs text-teal-400 font-semibold tracking-wide mb-1.5">{(orgName ?? 'Whistle Ready').toUpperCase()} · STAFF SIGNUP</p>
          <h1 className="text-lg font-bold text-white leading-snug">Work our tournaments this season</h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Refs, scorekeepers, trainers, and field ops — one profile gets you scheduled, paid, and on the field.</p>
          <div className="flex gap-2 mt-3.5">
            <div className="flex-1 bg-white/[0.07] border border-teal-400/40 rounded-xl px-2.5 py-2">
              <CalendarDays size={15} className="text-teal-300" />
              <p className="text-[10px] font-bold text-slate-200 mt-1">See your schedule</p>
            </div>
            <div className="flex-1 bg-white/[0.07] border border-teal-400/40 rounded-xl px-2.5 py-2">
              <Clock size={15} className="text-teal-300" />
              <p className="text-[10px] font-bold text-slate-200 mt-1">Pick your events</p>
            </div>
            <div className="flex-1 bg-white/[0.07] border border-teal-400/40 rounded-xl px-2.5 py-2">
              <CreditCard size={15} className="text-teal-300" />
              <p className="text-[10px] font-bold text-slate-200 mt-1">Get paid fast</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Honeypot — hidden from humans, filled by bots */}
          <div className="hidden" aria-hidden="true">
            <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={hpExtra} onChange={e => setHpExtra(e.target.value)} /></label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required autoComplete="name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="(555) 000-0000" autoComplete="tel" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email address *</label>
            <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">What's your role? *</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${role === r.value ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400 text-teal-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                  {r.icon}
                  <div className={`text-xs font-bold mt-1.5 ${role === r.value ? 'text-teal-700' : 'text-slate-700'}`}>{r.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {role === 'ref' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification level</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CERT_LEVELS.map(c => (
                    <button key={c.value} type="button" onClick={() => setCertLevel(c.value)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${certLevel === c.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Which games can you officiate?</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map(g => (
                    <button key={g.value} type="button" onClick={() => setGender(g.value)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-all ${gender === g.value ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {events.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600">Which events can you work?</label>
                <span className="text-[10px] text-slate-400">optional — pick any</span>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {events.map(ev => {
                  const on = selEvents.has(ev.id)
                  return (
                    <button key={ev.id} type="button" onClick={() => toggleEvent(ev.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400' : 'border-slate-200 hover:border-slate-300'}`}>
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-teal-500' : 'border-2 border-slate-300 bg-white'}`}>
                        {on && <Check size={13} className="text-white" strokeWidth={3.5} />}
                      </span>
                      {ev.logoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={ev.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-100" />
                      ) : null}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{ev.name}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{[fmtRange(ev.startDate, ev.endDate), ev.location].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  )
                })}
                <p className="text-[10.5px] text-slate-400 px-0.5">More events open all season — you can add or drop events anytime from your staff portal.</p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-xs font-semibold text-slate-600">Getting paid</label>
            </div>
            <p className="text-[10.5px] text-slate-400 mb-2">Fill in whatever you have — if one method doesn't work out, we'll use the next. Tap your preferred one.</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 'check', l: 'Check' }, { v: 'venmo', l: 'Venmo' }, { v: 'zelle', l: 'Zelle' }].map(m => (
                <button key={m.v} type="button" onClick={() => setPayMethod(m.v)}
                  className={`relative py-2 text-xs font-semibold rounded-xl border transition-all ${payMethod === m.v ? 'border-teal-400 bg-teal-50 text-teal-700 ring-1 ring-teal-400' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {m.l}
                  {payMethod === m.v && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-extrabold tracking-wide bg-teal-500 text-white rounded-full px-1.5 py-px">PREFERRED</span>}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Venmo <span className="font-medium text-slate-400">(optional)</span></label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={venmoHandle} onChange={e => setVenmoHandle(e.target.value)} placeholder="@your-venmo-username" />
                <p className="text-[10px] text-amber-600 mt-1">Venmo has transfer limits — can take longer than Zelle.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Zelle <span className="font-medium text-slate-400">(optional)</span></label>
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={zelleHandle} onChange={e => setZelleHandle(e.target.value)} placeholder="Zelle phone or email" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mailing address <span className="font-medium text-slate-400">(for checks and tax forms)</span></label>
              <textarea rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={mailingAddress} onChange={e => setMailingAddress(e.target.value)} placeholder="Street, city, state, ZIP" />
            </div>
          </div>

          <div className="lg:hidden">
            <div className="flex items-baseline justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600">Your staff ID card</label>
              <span className="text-[10px] text-slate-400">builds as you fill this out</span>
            </div>
            <div className="flex justify-center py-1">
              <StaffIdCard
                scale={1.05}
                name={name}
                defaultRole={role || 'ref'}
                gender={role === 'ref' ? gender : ''}
                certLevel={role === 'ref' ? certLevel : ''}
                events={events.filter(e => selEvents.has(e.id)).map(e => ({ name: e.name, logoUrl: e.logoUrl }))}
                orgName={orgName || 'Whistle Ready'}
                photoUrl={photo || null}
              />
            </div>
          </div>

          <div className="flex items-center gap-3.5 border-[1.5px] border-dashed border-slate-300 rounded-xl p-3 bg-slate-50">
            {photo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo} alt="Headshot preview" className="w-[52px] h-[52px] rounded-full object-cover" />
            ) : (
              <div className="w-[52px] h-[52px] rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                <Camera size={22} className="text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700">Add a headshot <span className="font-medium text-slate-400">(optional)</span></p>
              <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">Goes on your printable staff ID card — you can also add it later.</p>
            </div>
            <button type="button" onClick={() => photoRef.current?.click()} disabled={photoBusy}
              className="text-[11px] font-bold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
              {photoBusy ? '…' : photo ? 'Change' : 'Upload'}
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Min 6 chars" required autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirm *</label>
              <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Repeat" required autoComplete="new-password" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={submitting || !role}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-xl transition-colors">
            {submitting ? 'Creating your profile…' : 'Join the Staff →'}
          </button>

          <p className="text-center text-xs text-slate-400">
            Already have an account? <Link href="/login" className="text-teal-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>

      {/* Right rail: the ID card builds beside the form (desktop) */}
      <div className="hidden lg:block w-[300px] shrink-0 sticky top-8 self-start">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Your staff ID</p>
        <StaffIdCard
          scale={1.4}
          name={name}
          defaultRole={role || 'ref'}
          gender={role === 'ref' ? gender : ''}
          certLevel={role === 'ref' ? certLevel : ''}
          events={events.filter(e => selEvents.has(e.id)).map(e => ({ name: e.name, logoUrl: e.logoUrl }))}
          orgName={orgName || 'Whistle Ready'}
          photoUrl={photo || null}
        />
        <p className="text-[10.5px] text-slate-400 mt-3 leading-relaxed">Builds as you fill out the form. After you join, you can print it anytime from your staff portal.</p>
      </div>
      </div>
    </div>
  )
}

export default function JoinStaffPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>}>
      <JoinForm />
    </Suspense>
  )
}
