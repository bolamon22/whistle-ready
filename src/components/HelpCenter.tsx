'use client'
import { useState, useRef, useEffect } from 'react'
import { HelpCircle, X, ArrowLeft, Search, Send, Mail, BookOpen, Sparkles } from 'lucide-react'
import { HELP_ARTICLES, HELP_CATEGORIES } from '@/lib/helpArticles'
import { mdToHtml } from '@/app/o/[slug]/_md'
import SnapAvatar from '@/components/SnapAvatar'

const SUPPORT_EMAIL = 'support@whistleready.com'
const SUGGESTIONS = [
  'How do I add a registration fee tier?',
  'How does Auto-fill scheduling work?',
  'How do I assign refs to games?',
  'How do I edit the public event page?',
]
type Msg = { role: 'user' | 'assistant'; content: string }
const proseCls =
  'text-sm text-slate-600 leading-relaxed [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:mb-1 [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mt-2 [&_li]:mt-1 [&_p]:mt-2 [&_a]:text-teal-700 [&_a]:underline'

export default function HelpCenter({ tournamentId }: { tournamentId?: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'guides' | 'ai'>('guides')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = HELP_ARTICLES.filter(a => !q || (a.title + ' ' + a.keywords + ' ' + a.body).toLowerCase().includes(q))
  const active = activeId ? HELP_ARTICLES.find(a => a.id === activeId) : null

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/help', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: res.ok ? (data.message ?? 'Sorry, something went wrong.') : (data.error || 'Something went wrong.') }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error — please check your connection.' }])
    }
    setLoading(false)
  }

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('GameDay help request')}`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Help & support" aria-label="Help & support"
        className="px-3 py-3 text-slate-400 hover:text-white transition-colors flex items-center">
        <HelpCircle size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-[70] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-teal-600" />
                <span className="font-bold text-slate-900">Help &amp; support</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {([['guides', 'Guides', BookOpen], ['ai', 'Ask Snap', Sparkles]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => { setTab(id); setActiveId(null) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {tab === 'guides' && !active && (
                <div className="p-4">
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search help…"
                      className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  {HELP_CATEGORIES.map(cat => {
                    const items = matches.filter(a => a.category === cat)
                    if (!items.length) return null
                    return (
                      <div key={cat} className="mb-4">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">{cat}</p>
                        <div className="space-y-1">
                          {items.map(a => (
                            <button key={a.id} type="button" onClick={() => setActiveId(a.id)}
                              className="w-full text-left text-sm text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 transition-colors">
                              {a.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {matches.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No articles match “{query}”. Try the Ask AI tab.</p>}
                </div>
              )}

              {tab === 'guides' && active && (
                <div className="p-4">
                  <button type="button" onClick={() => setActiveId(null)} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900 font-medium mb-3"><ArrowLeft size={14} /> All guides</button>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-900 mb-2">{active.title}</h2>
                  <div className={proseCls} dangerouslySetInnerHTML={{ __html: mdToHtml(active.body) }} />
                </div>
              )}

              {tab === 'ai' && (
                <div className="p-4 space-y-3">
                  {messages.length === 0 ? (
                    <>
                      <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
                        <SnapAvatar size={48} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Hi, I'm Snap</p>
                          <p className="text-xs text-slate-500">Ask me how to do anything in Whistle Ready.</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {SUGGESTIONS.map(s => (
                          <button key={s} type="button" onClick={() => send(s)}
                            className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 transition-colors">{s}</button>
                        ))}
                      </div>
                    </>
                  ) : messages.map((m, i) => (
                    <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role === 'assistant' && <SnapAvatar size={26} />}
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#0f1f3d] text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>{m.content}</div>
                    </div>
                  ))}
                  {loading && <div className="flex gap-1 px-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Footer */}
            {tab === 'ai' ? (
              <div className="border-t border-slate-200 px-3 py-3 flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask a question…" disabled={loading}
                  className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <button type="button" onClick={() => send()} disabled={loading || !input.trim()}
                  className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white px-3 py-2 rounded-xl transition-colors inline-flex items-center"><Send size={15} /></button>
              </div>
            ) : (
              <a href={mailto} className="border-t border-slate-200 px-4 py-3 flex items-center gap-2 text-sm text-teal-700 hover:bg-slate-50 transition-colors">
                <Mail size={15} /> Still need help? Contact support
              </a>
            )}
          </div>
        </>
      )}
    </>
  )
}
