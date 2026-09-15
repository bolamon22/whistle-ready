'use client'

import { useEffect, useMemo, useState } from 'react'
import { Send, Mail, X, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import {
  MEDIA_INVITE_TEMPLATES, MEDIA_INVITE_DEFAULT, mergeMediaInvite, mediaApplyUrl,
  parseInvitees, inviteeGreeting, type MediaInvitee,
} from '@/lib/mediaInvite'

// Asking somebody to shoot the weekend.
//
// The review queue this sits above only ever fills if someone gets invited, and
// the organizer is not going to open a mail client, find the wording they used
// last time, and hand-build an application link. So the whole thing is here: the
// letter, the list, the send, and a record of who has already been asked.

type Meta = {
  orgName: string
  tournamentName: string
  dates: string
  applyBase: string
  galleryUrl: string
  emailReady: boolean
}
type SentInvite = { email: string; name?: string; business?: string; at: string; by?: string; template?: string }

const box = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500'

export default function InvitePanel({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [saved, setSaved] = useState<Record<string, { subject?: string; body?: string }>>({})
  const [invites, setInvites] = useState<SentInvite[]>([])

  const [tplKey, setTplKey] = useState(MEDIA_INVITE_DEFAULT.key)
  const [subject, setSubject] = useState(MEDIA_INVITE_DEFAULT.subject)
  const [body, setBody] = useState(MEDIA_INVITE_DEFAULT.body)
  const [saveLetter, setSaveLetter] = useState(false)
  const [paste, setPaste] = useState('')
  const [people, setPeople] = useState<MediaInvitee[]>([])
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/tournaments/${id}/media-invites`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || d.error) return
        setMeta(d)
        setSaved(d.letters || {})
        setInvites(Array.isArray(d.invites) ? d.invites : [])
        const s = (d.letters || {})[MEDIA_INVITE_DEFAULT.key]
        if (s?.subject) setSubject(s.subject)
        if (s?.body) setBody(s.body)
      })
      .catch(() => {})
  }, [id])

  // Switching letters loads the org's own wording if they have saved one for it,
  // and the shipped text otherwise. Unsaved edits to the letter you are leaving
  // are lost on purpose -- keeping them would silently mix two letters together.
  function pickTemplate(key: string) {
    const t = MEDIA_INVITE_TEMPLATES.find(x => x.key === key) || MEDIA_INVITE_DEFAULT
    setTplKey(key)
    setSubject(saved[key]?.subject || t.subject)
    setBody(saved[key]?.body || t.body)
  }

  function addPaste() {
    const found = parseInvitees(paste)
    if (!found.length) { setErr('No email addresses in that.'); return }
    setErr('')
    const have = new Set(people.map(p => p.email))
    setPeople([...people, ...found.filter(p => !have.has(p.email))])
    setPaste('')
  }

  const alreadyAsked = useMemo(() => new Set(invites.map(i => String(i.email || '').toLowerCase())), [invites])

  // The preview is the real merge, run against the first person on the list, so
  // what is on screen is what that person receives -- not an approximation.
  const sample = people[0] || { email: 'them@example.com', name: '', business: '' }
  const vars = {
    name: inviteeGreeting(sample),
    business: sample.business || '',
    orgName: meta?.orgName || '',
    tournamentName: meta?.tournamentName || '',
    dates: meta?.dates || '',
    applyUrl: meta ? mediaApplyUrl(meta.applyBase, id, sample) : '',
    galleryUrl: meta?.galleryUrl || '',
  }
  const previewSubject = mergeMediaInvite(subject, vars)
  const previewBody = mergeMediaInvite(body, vars)

  async function send() {
    if (!people.length) { setErr('Add at least one email address.'); return }
    if (!confirm(`Send this invite to ${people.length} ${people.length === 1 ? 'person' : 'people'}?`)) return
    setSending(true); setErr(''); setMsg('')
    try {
      const res = await fetch(`/api/tournaments/${id}/media-invites`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: tplKey, subject, body, to: people, saveLetter }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not send those invites.'); return }
      setInvites(Array.isArray(j.invites) ? j.invites : invites)
      setPeople([])
      const bits = [`${j.sent} sent`]
      if (j.skipped) bits.push(`${j.skipped} already invited`)
      if (j.errors?.length) bits.push(`${j.errors.length} failed`)
      setMsg(j.note || bits.join(' · '))
      if (j.errors?.length) setErr(j.errors.join('; '))
    } catch { setErr('Could not send those invites.') } finally { setSending(false) }
  }

  const copyLetter = () => {
    navigator.clipboard?.writeText(`${previewSubject}\n\n${previewBody}`)
    setMsg('Letter copied — paste it into your own email.')
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span className="flex items-center gap-2 min-w-0">
          <Mail size={16} className="text-teal-600 shrink-0" />
          <span className="font-semibold text-slate-800 text-sm">Invite someone to shoot</span>
          <span className="text-xs text-slate-400 truncate">
            {invites.length ? `${invites.length} invited for this event` : 'Nobody invited yet'}
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          <div>
            <p className="text-[12.5px] font-semibold text-slate-700 mb-1.5">Letter</p>
            <div className="flex flex-wrap gap-2">
              {MEDIA_INVITE_TEMPLATES.map(t => (
                <button key={t.key} onClick={() => pickTemplate(t.key)}
                  className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${tplKey === t.key ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  {t.label}{saved[t.key] ? ' ·' : ''}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {(MEDIA_INVITE_TEMPLATES.find(t => t.key === tplKey) || MEDIA_INVITE_DEFAULT).hint}
            </p>
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Who gets it</label>
            <div className="flex gap-2 min-w-0">
              <input value={paste} onChange={e => setPaste(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPaste() } }}
                placeholder="name@studio.com, or  Jane Doe &lt;jane@studio.com&gt;" className={box} />
              <button onClick={addPaste} className="shrink-0 text-sm font-semibold border border-slate-300 rounded-lg px-3 text-slate-600 hover:bg-slate-50">Add</button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Paste a whole list if you have one — commas, semicolons or one per line.</p>
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {people.map(p => (
                  <span key={p.email}
                    className={`inline-flex items-center gap-1.5 text-xs rounded-full pl-2.5 pr-1.5 py-1 border max-w-full min-w-0 ${alreadyAsked.has(p.email) ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-100 border-slate-200 text-slate-700'}`}
                    title={`${p.name ? `${p.name} · ` : ''}${p.email}${alreadyAsked.has(p.email) ? ' — already invited for this event, will be skipped' : ''}`}>
                    <span className="truncate">{p.name ? `${p.name} · ` : ''}{p.email}</span>
                    <button onClick={() => setPeople(people.filter(x => x.email !== p.email))} className="text-slate-400 hover:text-slate-700 shrink-0"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <label className="block text-[12.5px] font-semibold text-slate-700">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={box} />
            <label className="block text-[12.5px] font-semibold text-slate-700 mt-1">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className={`${box} font-mono text-[12.5px] leading-relaxed`} />
            <p className="text-xs text-slate-400">
              {'{{name}} {{business}} {{orgName}} {{tournamentName}} {{dates}} {{applyUrl}} {{galleryUrl}}'} fill in per person.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
              Preview{people.length ? ` — as ${people[0].email} gets it` : ''}
            </p>
            <p className="text-sm font-semibold text-slate-900 mb-2">{previewSubject}</p>
            <pre className="text-[12.5px] text-slate-600 whitespace-pre-wrap break-words font-sans leading-relaxed">{previewBody}</pre>
          </div>

          {msg && <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">{msg}</p>}
          {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          {meta && !meta.emailReady && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Email isn&rsquo;t configured, so Send won&rsquo;t work — use Copy letter and send it from your own inbox.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={send} disabled={sending || !people.length}
              className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5">
              <Send size={14} /> {sending ? 'Sending…' : `Send${people.length ? ` to ${people.length}` : ''}`}
            </button>
            <button onClick={copyLetter} className="text-sm font-semibold border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50">Copy letter</button>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={saveLetter} onChange={e => setSaveLetter(e.target.checked)} className="rounded border-slate-300" />
              Remember this wording
            </label>
          </div>

          {invites.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5">
                <Clock size={12} /> Already invited
              </p>
              <ul className="space-y-1">
                {invites.slice().reverse().map((i, n) => (
                  <li key={`${i.email}-${n}`} className="text-xs text-slate-500 flex flex-wrap justify-between gap-2">
                    <span className="text-slate-700">
                      <Check size={11} className="inline mr-1 text-teal-600" />
                      {i.name || i.business ? `${i.name || i.business} · ` : ''}{i.email}
                    </span>
                    <span>{(() => { try { return new Date(i.at).toLocaleDateString() } catch { return '' } })()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
