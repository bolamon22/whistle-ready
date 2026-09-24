'use client'
// Ask Chirp — brainstorm chat on the social scheduler (/api/social/chirp).
// The conversation lives in the parent page so it survives jumping into Compose
// from an idea and coming back.
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { X, Send, Globe, Sparkles, ExternalLink, RotateCcw } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'
import { chirpIdea, localDayKey, AUDIENCE_LABEL, type Idea } from '@/lib/socialIdeas'

export interface ChirpMsg {
  role: 'user' | 'assistant'
  content: string          // what goes back to the API next turn
  text?: string            // assistant prose shown in the bubble
  ideas?: Idea[]
  sources?: { url: string; title: string }[]
  searches?: number
  note?: string
}

const STARTERS = [
  'Give me 3 posts for next week that push Jingle Brawl',
  'What\'s happening in Florida sports this weekend we could tie into?',
  'I want something fun for Halloween week — ideas?',
  'Which empty days should I fill first, and with what?',
]
const AUD_TEXT: Record<string, string> = { clubs: 'text-violet-700', players: 'text-orange-700', parents: 'text-sky-800', all: 'text-slate-600' }

export default function ChirpPanel({ msgs, setMsgs, site, onClose, onDraft }: { msgs: ChirpMsg[]; setMsgs: (m: ChirpMsg[]) => void; site?: string; onClose: () => void; onDraft: (idea: Idea) => void }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [web, setWeb] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, busy])

  async function ask(q: string) {
    const question = q.trim(); if (!question || busy) return
    const next: ChirpMsg[] = [...msgs, { role: 'user', content: question }]
    setMsgs(next); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/social/chirp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), today: localDayKey(new Date()), tz: new Date().getTimezoneOffset(), web }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Chirp couldn't answer (${res.status})`)
      const today = localDayKey(new Date())
      const ideas = (Array.isArray(d.ideas) ? d.ideas : []).map((r: any) => chirpIdea(r, today, site)).filter(Boolean) as Idea[]
      setMsgs([...next, { role: 'assistant', content: d.raw || d.text || '', text: d.text || '', ideas, sources: d.sources || [], searches: d.searches || 0, note: d.note || '' }])
    } catch (e: any) {
      toast.error(e.message); setMsgs(msgs); setInput(question)
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0"><ChirpAvatar size={30} /><div className="min-w-0"><div className="font-extrabold text-sm leading-tight">Ask Chirp</div><div className="text-[11px] text-slate-500 truncate">Brainstorm posts · knows your events, calendar and top posts</div></div></div>
        <div className="flex items-center gap-1.5">
          {msgs.length > 0 && <button onClick={() => setMsgs([])} title="Start over" className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900"><RotateCcw size={13} /></button>}
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Close"><X size={14} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50/60">
        {!msgs.length && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-3 text-sm text-slate-700 flex gap-2.5"><ChirpAvatar size={26} /><div>Tell me what you're thinking — even half an idea — and I'll turn it into posts you can draft in one click. I can check the web for this week's games and local events too.</div></div>
            <div className="flex flex-col gap-1.5">{STARTERS.map(s => <button key={s} onClick={() => ask(s)} className="text-left rounded-xl border border-slate-200 bg-white hover:border-teal-400 px-3 py-2 text-xs font-semibold text-slate-700">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => m.role === 'user'
          ? <div key={i} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-teal-600 text-white text-sm px-3 py-2 whitespace-pre-wrap">{m.content}</div>
          : (
            <div key={i} className="flex gap-2 items-start">
              <ChirpAvatar size={24} className="mt-0.5" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {m.text && <div className="rounded-2xl rounded-tl-md bg-white border border-slate-200 text-sm text-slate-800 px-3 py-2 whitespace-pre-wrap leading-relaxed">{m.text}</div>}
                {m.note && <div className="rounded-xl bg-amber-50 text-amber-900 text-xs px-3 py-2">{m.note}</div>}
                {(m.ideas || []).map(idea => (
                  <div key={idea.key} className="rounded-xl bg-white border border-dashed border-slate-300 p-2.5 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                      <span>{idea.fmt} · {new Date(idea.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{idea.eventShort ? ` · ${idea.eventShort}` : ''}</span>
                      <span className={`font-bold ${AUD_TEXT[idea.aud]}`}>{AUDIENCE_LABEL[idea.aud]}</span>
                    </div>
                    <div className="text-sm font-bold leading-snug">{idea.title}</div>
                    {idea.why && <div className="text-xs text-slate-600 leading-snug">{idea.why}</div>}
                    {idea.hook && <div className="text-xs text-slate-800 border-l-2 border-teal-500 pl-2">{idea.hook}</div>}
                    <button onClick={() => onDraft(idea)} className="self-start mt-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-2.5 py-1.5 inline-flex items-center gap-1"><Sparkles size={12} /> Draft with AI</button>
                  </div>
                ))}
                {!!m.sources?.length && (
                  <div className="text-[11px] text-slate-500 flex flex-col gap-0.5">
                    <span className="font-bold uppercase tracking-wide text-[10px]">Sources{m.searches ? ` · ${m.searches} search${m.searches === 1 ? '' : 'es'}` : ''}</span>
                    {m.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline truncate"><ExternalLink size={10} className="flex-none" /><span className="truncate">{s.title}</span></a>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        {busy && <div className="flex gap-2 items-center text-xs text-slate-500"><ChirpAvatar size={24} /><span className="animate-pulse">{web ? 'Thinking — and checking the web if it helps…' : 'Thinking…'}</span></div>}
        <div ref={end} />
      </div>

      <div className="border-t border-slate-200 p-3 flex flex-col gap-2 bg-white">
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }} rows={2} maxLength={2000} placeholder="I'm thinking about… / What should I post for…" className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="h-10 w-10 flex-none rounded-xl bg-teal-600 hover:bg-teal-700 text-white grid place-items-center disabled:opacity-40" aria-label="Send"><Send size={15} /></button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <button onClick={() => setWeb(!web)} aria-pressed={web} className={`flex-none whitespace-nowrap inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${web ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-500'}`}><Globe size={11} /> {web ? 'Web search on' : 'Web search off'}</button>
          <span className="text-right">Nothing posts without your approval</span>
        </div>
      </div>
    </>
  )
}
