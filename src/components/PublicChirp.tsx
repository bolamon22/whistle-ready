'use client'
import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ClipboardCheck, PenLine, CreditCard, Trophy, MapPin } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'
import ChirpInput from '@/components/ChirpInput'
import ChirpText from '@/components/ChirpText'
import { ChirpLauncher, ChirpGreeting, ChirpHeader, ChirpWelcome, ChirpNote, useGreeting } from '@/components/ChirpLauncher'

interface Message { role: 'user' | 'assistant'; content: string }

const newId = () => {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 24) } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

// Public attendee assistant (coaches, parents, players, visitors). On a
// tournament's public pages (tournamentId) or on the org's own website
// (orgSlug). Labeled "Ask Chirp" launcher, a greeting card once per visit, and
// a help-desk panel (see ChirpLauncher). When the visitor closes the chat,
// clears it or leaves the page, the server emails the organizer the new part
// of the conversation.
export default function PublicChirp({ tournamentId, tournamentName, orgSlug }: { tournamentId?: string; tournamentName?: string; orgSlug?: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [team, setTeam] = useState('')
  const [info, setInfo] = useState<{ title: string; orgName: string; contactEmail: string }>({ title: tournamentName || '', orgName: '', contactEmail: '' })
  const bottomRef = useRef<HTMLDivElement>(null)
  const convoRef = useRef('')
  const unsentRef = useRef(false)
  const scopeKey = tournamentId || `org-${orgSlug || ''}`
  const greeting = useGreeting(scopeKey, open)

  useEffect(() => {
    const q = tournamentId ? `tournamentId=${encodeURIComponent(tournamentId)}` : orgSlug ? `orgSlug=${encodeURIComponent(orgSlug)}` : ''
    if (!q) return
    fetch(`/api/public-chat?${q}`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (d) setInfo(i => ({ title: i.title || d.title || '', orgName: d.orgName || '', contactEmail: d.contactEmail || '' }))
    }).catch(() => {})
  }, [tournamentId, orgSlug])

  function flush() {
    if (!convoRef.current || !unsentRef.current) return
    unsentRef.current = false
    const payload = JSON.stringify({ convoId: convoRef.current, tournamentId, orgSlug })
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/public-chat/transcript', new Blob([payload], { type: 'text/plain' }))
      else fetch('/api/public-chat/transcript', { method: 'POST', body: payload, keepalive: true }).catch(() => {})
    } catch {}
  }
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    return () => { window.removeEventListener('pagehide', onHide); flush() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (!open) flush() }, [open])
  function clearChat() { flush(); convoRef.current = ''; setMessages([]) }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { try { setTeam(localStorage.getItem(`chirp-team-${scopeKey}`) || '') } catch {} }, [scopeKey])
  const saveTeam = (v: string) => { setTeam(v); try { v ? localStorage.setItem(`chirp-team-${scopeKey}`, v) : localStorage.removeItem(`chirp-team-${scopeKey}`) } catch {} }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next: Message[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    if (!convoRef.current) convoRef.current = newId()
    try {
      const res = await fetch('/api/public-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, tournamentId, orgSlug, userTeam: team || undefined, page: window.location.pathname, convoId: convoRef.current }),
      })
      const data = await res.json()
      if (res.ok) unsentRef.current = true
      setMessages(m => [...m, { role: 'assistant', content: res.ok ? (data.message ?? 'Sorry, something went wrong.') : (data.error || 'Something went wrong.') }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error — please check your connection.' }])
    }
    setLoading(false)
  }
  const ask = (q: string) => { setOpen(true); send(q) }

  const isOrg = !tournamentId && !!orgSlug
  const place = info.title || (isOrg ? 'our events' : 'this event')
  const topics = isOrg ? [
    { label: 'Upcoming events', icon: <CalendarDays size={18} />, q: 'What events are coming up?' },
    { label: 'Register a team', icon: <ClipboardCheck size={18} />, q: 'How do I register a team?' },
    { label: 'Sign the player waiver', icon: <PenLine size={18} />, q: 'How do I sign the player waiver?' },
    { label: 'Past results', icon: <Trophy size={18} />, q: 'Where can I see results?' },
  ] : [
    { label: 'When does my team play?', icon: <CalendarDays size={18} />, q: 'What time does my team play?' },
    { label: 'Fields & parking', icon: <MapPin size={18} />, q: 'Where are the fields and where do we park?' },
    { label: 'Sign the player waiver', icon: <PenLine size={18} />, q: 'How do I sign the player waiver?' },
    { label: 'Pay my balance', icon: <CreditCard size={18} />, q: 'How do I pay our team balance?' },
  ]

  return (
    <>
      {greeting.show && (
        <ChirpGreeting
          title={`Hi! I'm Chirp, the ${info.orgName || 'event'} help desk.`}
          body="Ask me about schedules, registration, waivers or payments. Type or tap the mic and talk."
          chips={topics.slice(0, 3).map(t => ({ label: t.label, onPick: () => ask(t.q) }))}
          onDismiss={greeting.dismiss}
        />
      )}
      <ChirpLauncher open={open} onToggle={() => setOpen(o => !o)} />

      {open && (
        <div className="fixed bottom-20 sm:bottom-24 left-3 right-3 sm:left-auto sm:right-6 z-50 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '75vh' }}>
          <ChirpHeader
            subtitle={`${info.title || info.orgName || 'Events'} · answers in seconds, 24/7`}
            actions={messages.length > 0 ? <button type="button" onClick={clearChat} className="text-[11px] text-slate-300 hover:text-white">Clear</button> : undefined}
          />

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <>
                <ChirpWelcome
                  hello={`Hi! I'm Chirp. I can find your team's games, walk you through registering, waivers and payments for ${place}, or point you to the right page. What can I help with?`}
                  topics={topics.map(t => ({ label: t.label, icon: t.icon, onPick: () => send(t.q) }))}
                />
                <div className="pt-1">
                  <label htmlFor={`chirp-team-${scopeKey}`} className="text-[11px] text-slate-500">Your team (optional), I'll remember it</label>
                  <input id={`chirp-team-${scopeKey}`} value={team} onChange={e => saveTeam(e.target.value)} placeholder="e.g. Lightning U12"
                    className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </>
            ) : messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <ChirpAvatar size={24} />}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-[#0f1f3d] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>{m.role === 'assistant' ? <ChirpText text={m.content} /> : m.content}</div>
              </div>
            ))}
            {loading && <div className="flex gap-1 px-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 px-3 py-3 flex-shrink-0">
            <ChirpInput value={input} onChange={setInput} onSend={() => send()} disabled={loading} autoFocus={open} />
            <ChirpNote contact={info.contactEmail} />
          </div>
        </div>
      )}
    </>
  )
}
