'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast, { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import { Radio, Send, Trash2, ChevronLeft, Users, TrafficCone, HeartPulse, Flag, ClipboardList, ListChecks } from 'lucide-react'

const GROUPS: { key: string; label: string; Icon: any }[] = [
  { key: 'all', label: 'All staff', Icon: Users },
  { key: 'fieldops', label: 'Field Ops', Icon: TrafficCone },
  { key: 'medical', label: 'Medical', Icon: HeartPulse },
  { key: 'refs', label: 'Refs', Icon: Flag },
  { key: 'scorekeepers', label: 'Scorekeepers', Icon: ClipboardList },
  { key: 'assigners', label: 'Assigners', Icon: ListChecks },
]
const groupLabel = (k: string) => GROUPS.find(g => g.key === k)?.label || 'All staff'

const TEMPLATES: { label: string; make: (f: string) => string; group: string }[] = [
  { label: 'Ball needed', make: f => `Need a ball on Field ${f || '?'}`, group: 'fieldops' },
  { label: 'Trainer needed', make: f => `Trainer needed on Field ${f || '?'}`, group: 'medical' },
  { label: 'Water needed', make: f => `Need water on Field ${f || '?'}`, group: 'fieldops' },
  { label: 'Sub ref', make: f => `Sub referee needed on Field ${f || '?'}`, group: 'refs' },
  { label: 'Field ready', make: f => `Field ${f || '?'} is ready to start`, group: 'all' },
]

export default function OpsBoardPage() {
  const { id } = useParams()
  const { data: session, status } = useSession()
  const [group, setGroup] = useState('all')
  const [field, setField] = useState('')
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [sending, setSending] = useState(false)
  const timer = useRef<any>(null)

  function load() {
    fetch(`/api/tournaments/${id}/ops-messages`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.messages)) setMessages(d.messages) }).catch(() => {})
  }
  useEffect(() => {
    if (!id) return
    load()
    timer.current = setInterval(load, 15000) // light polling so the feed stays current
    return () => clearInterval(timer.current)
  }, [id])

  async function send() {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/ops-messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), group }),
      })
      if (res.ok) { setText(''); load() }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed to send') }
    } catch { toast.error('Failed to send') } finally { setSending(false) }
  }
  async function remove(mid: string) {
    try { const res = await fetch(`/api/tournaments/${id}/ops-messages?id=${encodeURIComponent(mid)}`, { method: 'DELETE' }); if (res.ok) load() } catch {}
  }

  if (status === 'loading') return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster position="top-right" />
      <Link href={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Dashboard</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Radio size={22} className="text-teal-600" /> Ops board</h1>
      <p className="text-sm text-slate-500 mb-5">Quick game-day requests to staff — “need a ball on Field 5,” “trainer to Field 7.” Anyone on staff can post; it shows here for everyone.</p>

      {/* composer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs font-medium text-slate-500">Field #</label>
          <input value={field} onChange={e => setField(e.target.value)} placeholder="5" inputMode="numeric"
            className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <span className="text-[11px] text-slate-400">tap a quick request:</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TEMPLATES.map(t => (
            <button key={t.label} type="button" onClick={() => { setText(t.make(field)); setGroup(t.group) }}
              className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100">{t.label}</button>
          ))}
        </div>

        <label className="block text-xs font-medium text-slate-500 mb-1.5">Send to</label>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {GROUPS.map(({ key, label, Icon }) => (
            <button key={key} type="button" onClick={() => setGroup(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${group === key ? 'bg-teal-600 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a request…"
            onKeyDown={e => { if (e.key === 'Enter') send() }}
            className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <button type="button" onClick={send} disabled={!text.trim() || sending}
            className={`px-4 rounded-xl font-bold inline-flex items-center gap-1.5 ${text.trim() && !sending ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
            <Send size={15} /> Send
          </button>
        </div>
      </div>

      {/* feed */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Recent</h2>
        <span className="text-[11px] text-slate-400">auto-refreshes</span>
      </div>
      {messages.length === 0 && <p className="text-sm text-slate-400">No ops messages yet.</p>}
      <div className="space-y-2">
        {messages.map((m: any) => {
          const G = GROUPS.find(g => g.key === m.group)
          const Icon = G?.Icon || Users
          return (
            <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full"><Icon size={11} />{groupLabel(m.group)}</span>
                  <span className="text-[11px] text-slate-400">{m.from} · {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-slate-800">{m.text}</p>
              </div>
              <button type="button" onClick={() => remove(m.id)} className="text-slate-300 hover:text-red-500 flex-shrink-0" title="Remove"><Trash2 size={14} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
