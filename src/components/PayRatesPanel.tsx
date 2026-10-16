'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import StaffPayEditor from '@/components/StaffPayEditor'
import { staffPayOf, staffPayBody, type StaffPayConfig } from '@/lib/staffPay'

// Pay rates on Staff pay: the event's staff pay rates and officials per game, in the
// editor Tournament setup uses (components/StaffPayEditor). Setup belongs to Event
// setup & scheduling, which the Assigner plan leaves off, so a Head Assigner had no
// way to set his own rates or how many officials a game gets (Bo, Oct 16 2026, setting
// one up: "he would need to have the payroll for the official scorekeepers and
// possibly any miscellaneous staff"). Directors and admins, as in Setup.
export default function PayRatesPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [cfg, setCfg] = useState<StaffPayConfig | null>(null)
  const [failed, setFailed] = useState(false)
  const [changed, setChanged] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/tournaments/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(t => { if (live) setCfg(staffPayOf(t)) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [id])

  async function save() {
    if (!cfg) return
    setSaving(true)
    const res = await fetch(`/api/tournaments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staffPayBody(cfg)),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast.error('The pay rates didn’t save. Please try again.'); return }
    toast.success('Pay rates saved')
    onClose()
  }

  return (
    <section aria-labelledby="pay-rates-title" className="card mb-5 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pay-rates-title" className="text-base font-bold text-slate-900">Pay rates</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            What each role earns at this event, and how many officials a game gets. A <strong className="font-semibold text-slate-700">Pay Rate Override</strong> on someone’s Staff Pool card comes first. A new rate applies to games assigned after you save.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close pay rates"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <X size={18} aria-hidden />
        </button>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-red-600">The pay rates didn’t load. Close this and try again.</p>
      ) : !cfg ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <StaffPayEditor value={cfg} onChange={next => { setCfg(next); setChanged(true) }} />
          <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
            <button type="button" onClick={save} disabled={saving || !changed} className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving…' : 'Save pay rates'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
