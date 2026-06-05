'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from 'ai/react'

interface Props { tournamentId: string; tournamentName: string }

export default function ChatWidget({ tournamentId, tournamentName }: Props) {
  const [open, setOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: '/api/chat',
    body: { tournamentId },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function clearChat() {
    setMessages([])
  }

  const suggestions = [
    'How many games are unscheduled?',
    'How many refs are on the roster?',
    'What\'s the balance due?',
    'Which divisions have the most teams?',
  ]

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-all ${open ? 'bg-slate-700 rotate-90' : 'bg-[#0f1f3d] hover:bg-slate-700'}`}
        aria-label="AI Assistant"
      >
        {open ? '✕' : '✦'}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ maxHeight: '70vh' }}>

          {/* Header */}
          <div className="bg-[#0f1f3d] px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">AI Assistant</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{tournamentName}</p>
            </div>
            {messages.length > 0 && (
              <button onClick={clearChat} className="text-[10px] text-slate-400 hover:text-white transition-colors">
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 text-center pt-2">
                  Ask me anything about <strong>{tournamentName}</strong>
                </p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => {
                      handleInputChange({ target: { value: s } } as React.ChangeEvent<HTMLInputElement>)
                      setTimeout(() => {
                        const form = document.getElementById('chat-form') as HTMLFormElement
                        form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                      }, 50)
                    }}
                      className="w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#0f1f3d] text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 px-3 py-3">
            <form id="chat-form" onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about this tournament…"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !input.trim()}
                className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white px-3 py-2 rounded-xl transition-colors text-sm font-medium">
                →
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
