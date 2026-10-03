'use client'

import { useState, useRef, useEffect } from 'react'
import { Maximize2, Minimize2, CalendarDays, Users, Mail, ClipboardList, BookOpen, UserPlus } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'
import ChirpText from '@/components/ChirpText'
import ChirpInput from '@/components/ChirpInput'
import { ChirpLauncher, ChirpHeader, ChirpWelcome, ChirpNote } from '@/components/ChirpLauncher'

// The floating staff Chirp. Mounted once for the whole app by GlobalChirp, so it
// follows staff from page to page and keeps the conversation while they move
// around one tournament. Answers are cut to the asker's role in lib/chirp.

interface Message { role: 'user' | 'assistant'; content: string }
interface Props { tournamentId?: string; tournamentName?: string; liftOnPhones?: boolean }

const TOURNAMENT_TOPICS = [
  { label: 'Unscheduled games', q: 'How many games are unscheduled?', icon: <CalendarDays size={18} /> },
  { label: 'Refs on the roster', q: 'How many refs are on the roster?', icon: <Users size={18} /> },
  { label: 'New-registration emails', q: 'Who gets the new-registration emails?', icon: <Mail size={18} /> },
  { label: 'Assign refs to games', q: 'How do I assign refs to games?', icon: <ClipboardList size={18} /> },
]
const APP_TOPICS = [
  { label: 'How Whistle Ready works', q: 'How does Whistle Ready work?', icon: <BookOpen size={18} /> },
  { label: 'Set up a tournament', q: 'How do I set up a tournament?', icon: <CalendarDays size={18} /> },
  { label: 'New-registration emails', q: 'Who gets the new-registration emails?', icon: <Mail size={18} /> },
  { label: 'Add a user', q: 'How do I add a user and set their role?', icon: <UserPlus size={18} /> },
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

  const topics = tournamentId ? TOURNAMENT_TOPICS : APP_TOPICS
  const subtitle = `${tournamentId ? (tournamentName || 'This tournament') : 'Whistle Ready'} · ask how to do anything`

  return (
    <>
      <ChirpLauncher open={open} onToggle={() => setOpen(o => !o)} sub="Help desk · ask anything" lift={liftOnPhones} />

      {open && (
        <div
          className={`fixed ${liftOnPhones ? 'bottom-36' : 'bottom-20'} sm:bottom-24 left-3 right-3 sm:left-auto sm:right-6 z-50 w-auto ${expanded ? 'sm:w-[36rem]' : 'sm:w-96'} bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden`}
          style={{ maxHeight: expanded ? '85vh' : '75vh', height: expanded ? '85vh' : undefined }}>

          <ChirpHeader subtitle={subtitle} actions={
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} className="text-[11px] text-slate-300 hover:text-white transition-colors">Clear</button>
              )}
              <button type="button" onClick={toggleExpanded} aria-label={expanded ? 'Make Chirp smaller' : 'Make Chirp bigger'} title={expanded ? 'Smaller' : 'Bigger'}
                className="hidden sm:inline-flex text-slate-300 hover:text-white transition-colors">
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          } />

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <ChirpWelcome
                hello={tournamentId
                  ? `Hi! Ask me about ${tournamentName || 'this tournament'}'s numbers, or how to do anything in Whistle Ready. I'll give you the steps and the page.`
                  : 'Hi! Ask me how to do anything in Whistle Ready. I\'ll give you the steps and the page.'}
                topics={topics.map(t => ({ label: t.label, icon: t.icon, onPick: () => send(t.q) }))}
              />
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && <ChirpAvatar size={24} />}
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
            <ChirpNote />
          </div>
        </div>
      )}
    </>
  )
}
