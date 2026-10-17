'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { Eye, Link2, Send, UserRound, Wallet, X } from 'lucide-react'
import TournamentNav from '../TournamentNav'

// The event's tournament director (Bo, Oct 17 2026: "where I can add them to an existing
// tournament ... We should be able to just add their name in at least"). Their name is
// enough to keep here; with an email, one click lets them log in and see this event:
// the schedule with officials and Staff pay (lib/clientEvents, /dashboard/client).

type Contact = { name: string; email: string; phone: string }
type Answer = { contact: Contact | null; logins: { id: string; name: string; email: string }[]; pending: { email: string; createdAt: string; url: string }[] }

export default function TournamentDirectorPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState('')
  const [a, setA] = useState<Answer | null>(null)
  const [form, setForm] = useState<Contact>({ name: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  function take(d: Answer) { setA(d); setForm(d.contact ?? { name: '', email: '', phone: '' }) }
  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => (r.ok ? r.json() : null)).then(t => setName(t?.name || '')).catch(() => {})
    fetch(`/api/tournaments/${params.id}/tournament-director`).then(r => (r.ok ? r.json() : Promise.reject())).then(take).catch(() => setFailed(true))
  }, [params.id])

  async function send(method: 'PUT' | 'POST' | 'DELETE', body?: unknown, qs = '') {
    setBusy(true)
    try {
      const r = await fetch(`/api/tournaments/${params.id}/tournament-director${qs}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { toast.error(d?.error || 'That didn’t save. Please try again.'); return null }
      take(d); return d
    } finally { setBusy(false) }
  }
  async function save() { if (await send('PUT', form)) toast.success(form.name.trim() ? 'Saved' : 'Removed') }
  async function invite() {
    const d = await send('POST')
    if (!d) return
    toast.success(d.assigned ? 'They already have a login: this event is on their home page now.' : 'Invite sent')
  }
  async function stop(id: string, who: string) {
    if (!window.confirm(`Stop sharing ${name || 'this event'} with ${who}?`)) return
    if (await send('DELETE', undefined, `?userId=${encodeURIComponent(id)}`)) toast.success('Stopped sharing')
  }
  function copy(url: string) { navigator.clipboard?.writeText(location.origin + url); toast.success('Link copied') }

  const saved = a?.contact
  const changed = !!a && (form.name !== (saved?.name ?? '') || form.email !== (saved?.email ?? '') || form.phone !== (saved?.phone ?? ''))
  const first = (saved?.name || '').split(' ')[0]

  return (
    <div>
      <Toaster position="top-center" />
      <TournamentNav id={params.id} name={name} />
      <div className="mx-auto max-w-2xl">
        <div className="page-header">
          <div>
            <h1 className="section-title">Tournament director</h1>
            <p className="mt-1 text-sm text-slate-500">Who you&apos;re assigning officials for at this event.</p>
          </div>
        </div>
        {failed && <p className="card p-6 text-center text-slate-500">Only the head assigner can open this page.</p>}
        {a && (
          <div className="space-y-4">
            <div className="card p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="sm:col-span-3"><span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Their name" className="input w-full" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-slate-500">Email (optional)</span>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="director@example.com" className="input w-full" /></label>
                <label><span className="mb-1 block text-xs font-medium text-slate-500">Phone (optional)</span>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} type="tel" placeholder="(555) 000-0000" className="input w-full" /></label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Just a name is fine. Add their email when you want them to see this event in Whistle Ready.</p>
                <button type="button" onClick={save} disabled={busy || !changed} className="btn-primary btn-sm flex-shrink-0">Save</button>
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800"><UserRound size={16} className="text-teal-600" aria-hidden />Their login</h2>
              <p className="mb-3 text-sm text-slate-500">With a login they see this event&apos;s schedule, with who is on each game and their phone numbers, and Staff pay, where they can mark people paid. Nothing else.</p>
              {a.logins.map(u => (
                <div key={u.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                  <span className="text-emerald-900"><b>{u.name}</b> ({u.email}) can see this event</span>
                  <button type="button" onClick={() => stop(u.id, u.name)} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600"><X size={13} aria-hidden />Stop sharing</button>
                </div>
              ))}
              {a.pending.map(p => (
                <div key={p.url} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span>Invite sent to <b>{p.email}</b> on {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <button type="button" onClick={() => copy(p.url)} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"><Link2 size={13} aria-hidden />Copy link</button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                {saved?.email && !a.logins.some(u => u.email.toLowerCase() === saved.email) && (
                  <button type="button" onClick={invite} disabled={busy || changed} className="btn-primary btn-sm inline-flex items-center gap-1.5">
                    <Send size={14} aria-hidden />{a.pending.length ? 'Send the invite again' : `Invite ${first || 'them'} to see this event`}
                  </button>
                )}
                {!saved?.email && <p className="text-sm text-slate-400">{form.email.trim() ? 'Save, then you can invite them.' : 'Add their email above to invite them.'}</p>}
                <Link href={`/dashboard/client/${params.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700"><Eye size={14} aria-hidden />See their view</Link>
              </div>
            </div>

            <p className="text-sm text-slate-500"><Wallet size={14} className="mr-1 inline align-text-bottom text-teal-600" aria-hidden />Your assigning fee is set on <Link href={`/tournaments/${params.id}/pay-summary`} className="font-semibold text-teal-700">Staff pay</Link>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
