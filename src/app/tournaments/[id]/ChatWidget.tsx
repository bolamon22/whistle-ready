'use client'

import { useState, useRef, useEffect } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'
import ChirpText from '@/components/ChirpText'
import ChirpInput from '@/components/ChirpInput'

// The floating staff Chirp. Mounted once for the whole app by GlobalChirp, so it
// follows staff from page to page and keeps the conversation while they move
// around one tournament. Answers are cut to the asker's role in lib/chirp.

interface Message { role: 'user' | 'assistant'; content: string }
interface Props { tournamentId?: string; tournamentName?: string; liftOnPhones?: boolean }

const TOURNAMENT_SUGGESTIONS = [
  'How many games are unscheduled?',
  'How many refs are on the roster?',
  'Who gets the new-registration emails?',
  'How do I assign refs to games?',
]
const APP_SUGGESTIONS = [
  'How does Whistle Ready work?',
  'Who gets the new-registration emails?',
  'How do I set up a tournament?',
]
const EXPAND_KEY = 'chirp-expanded'

export default function ChatWidget({ tournamentId, tournamentName, liftOnPhones }: Props) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { try { setExpanded(localStorage.getItem(EXPAND_KEY) === '1') } catch {} }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  function toggleExpanded() {
    setExpanded(v => {
      try { localStorage.setItem(EXPAND_KEY, v ? '0' : '1') } catch {}
      return !v
    })
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next: Message[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, tournamentId, page: window.location.pathname }),
      })
      const data = await res.json()
      const reply = res.ok ? (data.message ?? 'Sorry, something went wrong.') : (data.error || 'Something went wrong. Please try again.')
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error — please check your connection.' }])
    }
    setLoading(false)
  }

  const suggestions = tournamentId ? TOURNAMENT_SUGGESTIONS : APP_SUGGESTIONS
  const subtitle = tournamentId ? (tournamentName || 'This tournament') : 'Whistle Ready help'
  const lift = liftOnPhones ? 'bottom-20' : 'bottom-4'

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed ${lift} right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all ${open ? 'bg-slate-600' : 'bg-[#0f1f3d] hover:bg-slate-700'}`}
        aria-label="Chirp assistant"
      >
        {open ? <X size={22} /> : <ChirpAvatar size={40} />}
      </button>

      {open && (
        <div
          className={`fixed ${liftOnPhones ? 'bottom-36' : 'bottom-20'} sm:bottom-24 left-3 right-3 sm:left-auto sm:right-6 z-50 w-auto ${expanded ? 'sm:w-[36rem]' : 'sm:w-96'} bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden`}
          style={{ maxHeight: expanded ? '85vh' : '70vh', height: expanded ? '85vh' : undefined }}>

          <div className="bg-[#0f1f3d] px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ChirpAvatar size={28} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Chirp</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="text-[10px] text-slate-400 hover:text-white transition-colors">Clear</button>
              )}
              <button onClick={toggleExpanded} aria-label={expanded ? 'Make Chirp smaller' : 'Make Chirp bigger'} title={expanded ? 'Smaller' : 'Bigger'}
                className="hidden sm:inline-flex text-slate-400 hover:text-white transition-colors">
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 text-center pt-2">
                  {tournamentId
                    ? <>Ask about <strong>{tournamentName || 'this tournament'}</strong>, or how to do something in Whistle Ready</>
                    : <>Ask me how to do anything in Whistle Ready</>}
                </p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user' ? 'bg-[#0f1f3d] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {m.role === 'assistant' ? <ChirpText text={m.content} /> : m.content}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 px-3 py-3 flex-shrink-0">
            <ChirpInput value={input} onChange={setInput} onSend={() => send()} disabled={loading} autoFocus={open} />
          </div>
        </div>
      )}
    </>
  )
}
