'use client'
import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'

// How often the organizer gets emails of public Chirp chats (lib/publicChirp
// sendChirpDigest). Bundled every 3 hours by default.
type Mode = { id: string; label: string }

export default function ChirpMailSetting({ tournamentId }: { tournamentId: string }) {
  const [mode, setMode] = useState('')
  const [modes, setModes] = useState<Mode[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch(`/api/chirp/mail-mode?tournamentId=${encodeURIComponent(tournamentId)}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.mode) { setMode(d.mode); setModes(d.modes || []) }
    }).catch(() => {})
  }, [tournamentId])

  async function save(next: string) {
    const prev = mode
    setMode(next); setNote('')
    const r = await fetch('/api/chirp/mail-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId, mode: next }) }).catch(() => null)
    if (!r || !r.ok) { setMode(prev); setNote((await r?.json().catch(() => null))?.error || 'Could not save') } else setNote('Saved')
  }
  async function sendNow() {
    setNote('Sending…')
    const r = await fetch('/api/chirp/mail-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId, sendNow: true }) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setNote(d?.sent ? `Sent ${d.chats} chat${d.chats === 1 ? '' : 's'}` : d?.reason === 'nothing new' ? 'Nothing waiting' : d?.error || d?.reason || 'Could not send')
  }

  if (!mode) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      <Mail size={15} className="text-teal-600" />
      <label htmlFor="chirp-mail" className="font-medium">Email me visitor chats</label>
      <select id="chirp-mail" value={mode} onChange={e => save(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white">
        {modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {(mode === '3h' || mode === 'daily') && <button type="button" onClick={sendNow} className="text-teal-700 hover:text-teal-900 font-medium">Send what's waiting now</button>}
      {note && <span className="text-xs text-slate-400">{note}</span>}
    </div>
  )
}
