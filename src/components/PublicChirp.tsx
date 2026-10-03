'use client'
import { useState, useRef, useEffect } from 'react'
import ChirpAvatar from '@/components/ChirpAvatar'
import ChirpInput from '@/components/ChirpInput'
import ChirpText from '@/components/ChirpText'

interface Message { role: 'user' | 'assistant'; content: string }
const SUGGESTIONS = [
  'What time does my team play?',
  'Where are the fields?',
  'How do I register a team?',
  'What are the rules?',
]
const ORG_SUGGESTIONS = [
  'What events are coming up?',
  'How do I register a team?',
  'Where can I see results?',
  'How do I sign the player waiver?',
]

const newId = () => {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 24) } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}

// Public attendee assistant (coaches, parents, players, visitors). Floating
// bubble on a tournament's public pages (tournamentId) or on the org's own
// website (orgSlug). When the visitor closes the chat, clears it or leaves the
// page, the server emails the organizer the new part of the conversation.
export default function PublicChirp({ tournamentId, tournamentName, orgSlug }: { tournamentId?: string; tournamentName?: string; orgSlug?: string }) {
  const [open, setOpen] = useState(false)
  const convoRef = useRef('')
  const unsentRef = useRef(false)
  const scopeKey = tournamentId || `org-${orgSlug || ''}`

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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [team, setTeam] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

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

  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-label="Ask Chirp"
        className={`fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${open ? 'bg-slate-700 text-white text-2xl' : 'bg-[#0f1f3d] hover:bg-slate-700'}`}>
        {open ? '✕' : <ChirpAvatar size={44} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[22rem] sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
          <div className="bg-[#0f1f3d] px-4 py-3 flex items-center gap-2 flex-shrink-0">
            <ChirpAvatar size={30} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Chirp</p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{tournamentName || (orgSlug ? 'Events, schedules & registration' : 'Event assistant')}</p>
            </div>
            {messages.length > 0 && <button onClick={clearChat} className="text-[10px] text-slate-400 hover:text-white">Clear</button>}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-2 pt-1 text-center">
                  <ChirpAvatar size={44} />
                  <p className="text-xs text-slate-500">Hi, I'm Chirp! Ask me anything about <strong>{tournamentName || (orgSlug ? 'our events' : 'this event')}</strong>.</p>
                </div>
                <div className="space-y-1.5">
                  {(orgSlug ? ORG_SUGGESTIONS : SUGGESTIONS).map(s => (
                    <button key={s} onClick={() => send(s)} className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 transition-colors">{s}</button>
                  ))}
                </div>
                <div className="pt-1">
                  <label className="text-[11px] text-slate-400">Your team (optional) — I'll remember it</label>
                  <input value={team} onChange={e => saveTeam(e.target.value)} placeholder="e.g. Lightning U12"
                    className="mt-1 w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <ChirpAvatar size={24} />}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#0f1f3d] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>{m.role === 'assistant' ? <ChirpText text={m.content} /> : m.content}</div>
              </div>
            ))}
            {loading && <div className="flex gap-1 px-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 px-3 py-3 flex-shrink-0">
            <ChirpInput value={input} onChange={setInput} onSend={() => send()} disabled={loading} placeholder="Ask about this event…" autoFocus={open} />
          </div>
        </div>
      )}
    </>
  )
}
