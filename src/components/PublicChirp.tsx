'use client'
import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ClipboardCheck, PenLine, CreditCard, Trophy, MapPin } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'
import ChirpInput from '@/components/ChirpInput'
import ChirpText from '@/components/ChirpText'
import { pickNudge, type NudgeEvent } from '@/lib/chirpNudges'
import { ChirpLauncher, ChirpGreeting, ChirpHeader, ChirpWelcome, ChirpNote, useGreeting, useChirpHistory, ChirpHeaderActions, ChirpHistoryList } from '@/components/ChirpLauncher'

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
  const [info, setInfo] = useState<{ title: string; orgName: string; contactEmail: string; event: NudgeEvent; loaded: boolean }>({ title: tournamentName || '', orgName: '', contactEmail: '', event: null, loaded: false })
  const bottomRef = useRef<HTMLDivElement>(null)
  const convoRef = useRef('')
  const unsentRef = useRef(false)
  const scopeKey = tournamentId || `org-${orgSlug || ''}`
  // A returning visitor is a browser that chatted before: a random id kept on
  // the device, never an IP address or anything that names the person.
  const visitorRef = useRef<{ id: string; n: number; first: number } | null>(null)
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('chirp-visitor') || 'null')
      visitorRef.current = v && typeof v.id === 'string' ? v : { id: newId(), n: 0, first: Date.now() }
      localStorage.setItem('chirp-visitor', JSON.stringify(visitorRef.current))
    } catch { visitorRef.current = { id: newId(), n: 0, first: Date.now() } }
  }, [])
  function countChat() {
    const v = visitorRef.current
    if (!v) return
    v.n += 1
    try { localStorage.setItem('chirp-visitor', JSON.stringify(v)) } catch {}
  }

  // What Chirp opens with depends on the page and the event (see chirpNudges).
  const [path, setPath] = useState('')
  useEffect(() => { setPath(window.location.pathname) }, [])
  const nudge = pickNudge({ path, event: info.event, orgName: info.orgName, returning: (visitorRef.current?.n || 0) > 0 })
  const greeting = useGreeting(`${scopeKey}-${nudge.id}`, open, info.loaded && !!path, 6000, nudge.pageSpecific ? 0 : 2)

  // Keep the chat across pages: a link in an answer moves to that page, and on
  // tournament pages that remounts this widget, so the conversation lives in
  // session storage (this tab only, cleared after a few hours of quiet).
  const STORE = 'chirp-public-chat'
  const restored = useRef(false)
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(STORE) || 'null')
      if (v && Date.now() - (v.at || 0) < 3 * 3600000 && Array.isArray(v.messages)) {
        setMessages(v.messages)
        if (v.open) setOpen(true)
        if (v.scopeKey === scopeKey && v.convoId) convoRef.current = v.convoId
      }
    } catch {}
    restored.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!restored.current) return
    try { sessionStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-30), open, convoId: convoRef.current, scopeKey, at: Date.now() })) } catch {}
  }, [messages, open, scopeKey])
  // On a phone the open chat covers the page, so step aside after following a
  // link; the conversation is still there when they tap Ask Chirp.
  const onNavigate = () => { if (window.innerWidth < 640) setOpen(false) }

  useEffect(() => {
    const q = tournamentId ? `tournamentId=${encodeURIComponent(tournamentId)}` : orgSlug ? `orgSlug=${encodeURIComponent(orgSlug)}` : ''
    if (!q) return
    fetch(`/api/public-chat?${q}`).then(r => (r.ok ? r.json() : null)).then(d => {
      setInfo(i => d ? ({ title: i.title || d.title || '', orgName: d.orgName || '', contactEmail: d.contactEmail || '', event: d.event || null, loaded: true }) : { ...i, loaded: true })
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
  const hist = useChirpHistory('public')
  const [showHistory, setShowHistory] = useState(false)
  // New chat files the current one under History instead of deleting it.
  function newChat() { flush(); hist.archive(messages); convoRef.current = ''; setMessages([]) }
  function openPast(id: string) {
    const past = hist.take(id)
    if (!past) return
    flush(); hist.archive(messages); convoRef.current = ''
    setMessages(past); setShowHistory(false)
  }

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
    if (!convoRef.current) { convoRef.current = newId(); countChat() }
    try {
      const res = await fetch('/api/public-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, tournamentId, orgSlug, userTeam: team || undefined, page: window.location.pathname, convoId: convoRef.current, visitor: visitorRef.current || undefined }),
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
          title={nudge.title}
          body={nudge.body}
          chips={nudge.chips.map(c => ({ label: c.label, onPick: () => ask(c.q) }))}
          onDismiss={greeting.dismiss}
        />
      )}
      <ChirpLauncher open={open} onToggle={() => setOpen(o => !o)} />

      {open && (
        <div className="fixed bottom-20 sm:bottom-24 left-3 right-3 sm:left-auto sm:right-6 z-50 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '75vh' }}>
          <ChirpHeader
            subtitle={`${info.title || info.orgName || 'Events'} · answers in seconds, 24/7`}
            actions={<ChirpHeaderActions hasMessages={messages.length > 0} historyCount={hist.items.length} showingHistory={showHistory} onHistory={() => setShowHistory(v => !v)} onNew={newChat} />}
          />

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {showHistory ? (
              <ChirpHistoryList items={hist.items} onPick={openPast} onBack={() => setShowHistory(false)} />
            ) : messages.length === 0 ? (
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
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-[#0f1f3d] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>{m.role === 'assistant' ? <ChirpText text={m.content} onNavigate={onNavigate} /> : m.content}</div>
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
