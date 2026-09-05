'use client'

// Org side of team housing: who the housing contact is, when the report goes,
// the private board link, Send now — and the live board itself underneath
// (same rows the housing company edits; same columns the travel/grant report
// totals). Static route wins over /staff/[id], so 'housing' never collides.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { BedDouble, Copy, RefreshCw, Send } from 'lucide-react'
import HousingBoard, { HousingCounts } from '@/components/HousingBoard'

type Settings = { contactName: string; contactEmail: string; cadence: 'weekly' | 'twice' | 'manual'; includeContact: boolean; lastSentAt: string }

export default function HousingAdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [boardUrl, setBoardUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [events, setEvents] = useState<any[]>([])

  const viewOrg = () => { const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )preview-org=([^;]*)/) : null; return m ? decodeURIComponent(m[1]) : null }

  useEffect(() => {
    const v = viewOrg()
    fetch(`/api/housing/settings${v ? `?viewOrgId=${encodeURIComponent(v)}` : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setSettings(d.settings); setBoardUrl(d.boardUrl) } })
      .catch(() => {})
  }, [])

  async function put(body: Record<string, unknown>, okMsg?: string) {
    setSaving(true)
    const res = await fetch('/api/housing/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, viewOrgId: viewOrg() }) })
    const d = res.ok ? await res.json() : null
    if (d?.ok) { if (d.settings) setSettings(d.settings); if (d.boardUrl) setBoardUrl(d.boardUrl); if (okMsg) toast.success(okMsg) }
    else toast.error('Failed to save')
    setSaving(false)
  }

  async function sendNow() {
    setSending(true)
    const res = await fetch('/api/housing/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewOrgId: viewOrg() }) })
    const d = await res.json().catch(() => null)
    if (res.ok && d?.ok) { toast.success('Report sent'); setSettings(s => s ? { ...s, lastSentAt: new Date().toISOString() } : s) }
    else toast.error(d?.error || 'Failed to send')
    setSending(false)
  }

  const lastSent = settings?.lastSentAt ? new Date(settings.lastSentAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2"><BedDouble size={20} className="text-teal-600" /><h1 className="section-title">Team Housing</h1></div>
          <p className="text-sm text-slate-500 mt-1">Weekly report to your housing company + their booking board. Bookings land in each event's <Link href="/tournaments" className="text-teal-600 hover:underline">Travel &amp; hotels</Link> grant totals automatically.</p>
        </div>
        <div className="hidden sm:block bg-[#0f1f3d] rounded-2xl px-4 py-2.5"><HousingCounts events={events} /></div>
      </div>

      {settings && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-1">Housing reports</h2>
          <p className="text-xs text-slate-400 mb-4">Who gets the report, when it goes, and the private board link. Clubs answer the hotel question at registration — that's what fills the board.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Housing contact</label><input className="input" value={settings.contactName} onChange={e => setSettings(s => s ? { ...s, contactName: e.target.value } : s)} onBlur={e => put({ contactName: e.target.value })} placeholder="Name" /></div>
            <div><label className="label">Email the report to</label><input className="input" value={settings.contactEmail} onChange={e => setSettings(s => s ? { ...s, contactEmail: e.target.value } : s)} onBlur={e => put({ contactEmail: e.target.value })} placeholder="name@housingcompany.com" /></div>
            <div>
              <label className="label">Schedule</label>
              <select className="select" value={settings.cadence} onChange={e => { const v = e.target.value as Settings['cadence']; setSettings(s => s ? { ...s, cadence: v } : s); put({ cadence: v }) }}>
                <option value="weekly">Every Monday, 8:00 AM</option>
                <option value="twice">Mondays + Thursdays, 8:00 AM</option>
                <option value="manual">Manual — only when I hit Send</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={settings.includeContact} onChange={e => { setSettings(s => s ? { ...s, includeContact: e.target.checked } : s); put({ includeContact: e.target.checked }) }} />
                Include coach contact info <span className="text-slate-400">(he reaches clubs directly)</span>
              </label>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">His board link <span className="text-slate-400 font-normal">— private, no login; rotate to kill old links</span></label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={boardUrl} />
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm flex items-center gap-1.5" onClick={() => { navigator.clipboard.writeText(boardUrl); toast.success('Board link copied') }}><Copy size={13} />Copy</button>
                <button className="btn-secondary btn-sm flex items-center gap-1.5" disabled={saving} onClick={() => { if (confirm('Rotate the link? Every previously shared board link stops working.')) put({ rotate: true }, 'New link minted — old links are dead') }}><RefreshCw size={13} />Rotate</button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 mt-5 pt-4">
            <button className="btn-primary btn-sm flex items-center gap-1.5" onClick={sendNow} disabled={sending || !settings.contactEmail}><Send size={13} />{sending ? 'Sending…' : 'Send report now'}</button>
            <span className="text-xs text-slate-400">{settings.contactEmail ? (lastSent ? `Last sent ${lastSent} — from your organization` : 'Never sent yet') : 'Add a contact email to send'}</span>
          </div>
        </div>
      )}

      <HousingBoard viewOrgId={viewOrg()} onData={setEvents} />
    </div>
  )
}
