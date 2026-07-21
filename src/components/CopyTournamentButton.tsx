'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Copy, Check, X } from 'lucide-react'

// Copy tournament — button + modal, self-contained.
//
// This used to sit on the Settings page, but it's an action rather than a setting,
// so it moved to the dashboard when Settings was retired into Setup.
export default function CopyTournamentButton({
  tournamentId, tournamentName, className,
}: {
  tournamentId: string
  tournamentName: string
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [copying, setCopying] = useState(false)

  function launch() {
    setName(`${tournamentName} (Copy)`); setStart(''); setEnd(''); setOpen(true)
  }

  async function copyTournament() {
    if (!name.trim()) return
    setCopying(true)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/copy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), startDate: start, endDate: end }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (res.ok && data.id) {
        toast.success(`"${data.name}" created!`)
        setOpen(false)
        // Settings is retired — send them to the new tournament's setup.
        router.push(`/tournaments/${data.id}/builder`)
      } else {
        toast.error(data.error || 'Failed to copy')
      }
    } catch {
      toast.error('Failed to copy')
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <button type="button" onClick={launch}
        className={className || 'inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-100 text-slate-600 font-semibold px-4 py-2 rounded-xl text-sm transition-colors'}>
        <Copy size={15} /> Copy tournament
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><Copy size={16} /> Copy tournament</h2>
              <p className="text-sm text-slate-500 mt-1">Creates a new tournament with the same settings, venues, and staff roster. Games and registrations are not copied.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New tournament name</label>
                <input className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fall Classic 2027" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start date</label>
                  <input type="date" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={start} onChange={e => setStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End date</label>
                  <input type="date" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={end} onChange={e => setEnd(e.target.value)} />
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold">What gets copied:</p>
                <p className="flex items-start gap-1.5"><Check size={13} className="flex-shrink-0 mt-0.5" /> Venues &amp; fields · Divisions · Pay rates · Ref rules · Staff roster · Registration settings</p>
                <p className="font-semibold mt-1">What stays behind:</p>
                <p className="flex items-start gap-1.5"><X size={13} className="flex-shrink-0 mt-0.5" /> Games &amp; schedule · Team registrations · Assignments · Availability</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Cancel</button>
                <button type="button" onClick={copyTournament} disabled={!name.trim() || copying}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
                  {copying ? 'Copying…' : 'Create Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
