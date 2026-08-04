'use client'
// EXHIBIT A generator — fills the county "ISA Background Check Results" table
// (Background Screening and Concussion Affidavit, Attachment A) straight from
// the tournament staff roster. Each worker carries a bgCheckDate (raw Worker
// column, editable here); counties require re-screening every 12 months, so
// anything older than 12 months — or missing — is flagged before printing.
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Printer, ShieldCheck, AlertTriangle } from 'lucide-react'

interface Worker { id: string; name: string; defaultRole: string; bgCheckDate?: string }
interface RosterEntry { workerId: string; worker?: { id: string; name: string } }

const MS_YEAR = 365 * 24 * 3600 * 1000

export default function ExhibitAPage({ params }: { params: { id: string } }) {
  const [tournament, setTournament] = useState<any>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    const [tR, wR, rR] = await Promise.all([
      fetch(`/api/tournaments/${params.id}`),
      fetch('/api/workers'),
      fetch(`/api/tournaments/${params.id}/roster`),
    ])
    setTournament(await tR.json())
    setWorkers(await wR.json())
    setRoster(await rR.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function saveDate(workerId: string, date: string) {
    setSavingId(workerId)
    setWorkers(ws => ws.map(w => w.id === workerId ? { ...w, bgCheckDate: date } : w))
    await fetch(`/api/workers/${workerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bgCheckDate: date }),
    })
    setSavingId(null)
  }

  const byId = new Map(workers.map(w => [w.id, w]))
  const rows = roster
    .map(e => byId.get(e.workerId) || (e.worker ? { id: e.worker.id, name: e.worker.name, defaultRole: '' } as Worker : null))
    .filter((w): w is Worker => !!w)
    .sort((a, b) => a.name.localeCompare(b.name))

  const staleBefore = Date.now() - MS_YEAR
  const status = (w: Worker) => {
    const d = w.bgCheckDate ? Date.parse(w.bgCheckDate) : NaN
    if (isNaN(d)) return 'missing'
    return d < staleBefore ? 'stale' : 'ok'
  }
  const missing = rows.filter(w => status(w) === 'missing').length
  const stale = rows.filter(w => status(w) === 'stale').length

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Screen-only controls */}
      <div className="print:hidden">
        <Link href={`/tournaments/${params.id}/roster`} className="text-sm text-teal-700 hover:underline inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Staff roster
        </Link>
        <div className="page-header mt-2">
          <div>
            <h1 className="section-title">Exhibit A — background check results</h1>
            <p className="text-sm text-slate-500 mt-1">
              Fills the county affidavit table from your staff roster. Set each person&apos;s background-check
              date; print and attach to the notarized Background Screening &amp; Concussion Affidavit.
            </p>
          </div>
          <button onClick={() => window.print()} className="btn-primary btn-sm flex items-center gap-2">
            <Printer size={15} /> Print
          </button>
        </div>
        {(missing > 0 || stale > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3 mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {missing > 0 && <>{missing} staff missing a background-check date. </>}
              {stale > 0 && <>{stale} checked more than 12 months ago — counties require re-screening every 12 months. </>}
              Fix these before printing.
            </span>
          </div>
        )}
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">No confirmed staff on the roster yet — add people on the Staff Roster page first.</p>
        )}
      </div>

      {/* Printable sheet */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 print:border-0 print:p-0 print:rounded-none">
        <div className="text-center mb-4">
          <div className="font-bold underline">EXHIBIT A</div>
          <div className="font-bold underline mt-1">ISA BACKGROUND CHECK RESULTS</div>
          <div className="text-sm text-slate-600 mt-2">
            {tournament?.name || 'Tournament'} · {tournament?.startDate || ''}{tournament?.endDate && tournament.endDate !== tournament.startDate ? ` – ${tournament.endDate}` : ''}
          </div>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 print:bg-slate-100">
              {['Name of person (Printed)', 'Date tests completed', 'Level 2 Fingerprint', 'Dru Sjodin National Sex Offender Public', 'FDLE Sexual Offenders and Predators Search'].map(h => (
                <th key={h} className="border border-slate-400 px-2 py-1.5 text-left font-semibold text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(w => {
              const st = status(w)
              return (
                <tr key={w.id}>
                  <td className="border border-slate-400 px-2 py-1.5">{w.name}</td>
                  <td className="border border-slate-400 px-2 py-1">
                    <span className="hidden print:inline">{w.bgCheckDate || '________'}</span>
                    <span className="print:hidden inline-flex items-center gap-2">
                      <input type="date" value={w.bgCheckDate || ''} onChange={e => saveDate(w.id, e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 text-sm" />
                      {savingId === w.id ? <span className="text-xs text-slate-400">Saving…</span>
                        : st === 'ok' ? <ShieldCheck size={15} className="text-emerald-600" />
                        : <AlertTriangle size={15} className={st === 'stale' ? 'text-amber-500' : 'text-red-500'} />}
                    </span>
                  </td>
                  {[0, 1, 2].map(i => (
                    <td key={i} className="border border-slate-400 px-2 py-1.5 whitespace-nowrap">
                      <span className="mr-2">{st === 'ok' ? '☑' : '☐'} Passed</span>
                      <span>☐ Failed</span>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3">
          Checks: (1) Level 2 background screening; (2) Dru Sjodin National Sex Offender Public Website (nsopw.gov);
          (3) FDLE Sexual Offenders and Predators Search. Screening must be repeated every 12 months per § 943.0438, Fla. Stat.
        </p>
      </div>
    </div>
  )
}
