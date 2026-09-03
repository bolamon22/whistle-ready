'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

// Badge sheet: every player's pass (the same PNG parents get) laid out at CR80 badge size,
// three across on letter paper, for lanyards. Filter by team, then print.
type Sub = { id: string; submittedAt: string; updatedAt?: string; data: any; passToken?: string | null }
const teamLabel = (t: any) => { const s = String(t || '').trim(); return !s ? '—' : s === '__other' ? 'Other / not listed' : s }

export default function BadgeSheet() {
  const { id } = useParams() as { id: string }
  const [subs, setSubs] = useState<Sub[]>([])
  const [teams, setTeams] = useState<{ name: string; count: number }[]>([])
  const [team, setTeam] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState(0)
  const [passOn, setPassOn] = useState(true)
  useEffect(() => { try { setTeam(String(new URLSearchParams(window.location.search).get('team') || '')) } catch {} }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setLoaded(0); setFailed(0)
    fetch(`/api/tournaments/${id}/player-waivers?team=${encodeURIComponent(team)}&sort=name&limit=20000&pass=1`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (cancelled) return
      if (!r.ok) { setError(j.error || 'Could not load players'); setSubs([]); return }
      setSubs(Array.isArray(j.submissions) ? j.submissions : [])
      setTeams(Array.isArray(j.teams) ? j.teams : [])
      setPassOn(j.playerPass === true)
    }).catch(() => { if (!cancelled) setError('Could not load players') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, team])

  const cards = useMemo(() => (passOn ? subs.filter(s => s.passToken) : []), [subs, passOn])
  const ready = !loading && loaded + failed >= cards.length

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.3in; }
          .no-print { display: none !important; }
          .sheet { display: grid !important; grid-template-columns: repeat(3, 2.125in) !important; gap: 0.12in !important; padding: 0 !important; }
          .badge { width: 2.125in !important; height: 3.365in !important; break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <Link href={`/tournaments/${id}/player-waivers`} className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"><ArrowLeft size={15} /> Player waivers</Link>
          <div className="sm:ml-2">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Player badges</h1>
            <p className="text-xs text-slate-500">
              {loading ? 'Loading players…' : `${cards.length} badge${cards.length === 1 ? '' : 's'}`}
              {!loading && cards.length > 0 && !ready && ` · rendering ${loaded + failed} of ${cards.length}…`}
              {!loading && cards.length > 0 && ready && ' · ready to print'}
              {failed > 0 && ` · ${failed} could not render`}
            </p>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <select value={team} onChange={e => setTeam(e.target.value)} className="min-w-0 sm:w-64 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="">All teams</option>
              {teams.map(t => <option key={t.name || '(blank)'} value={t.name}>{teamLabel(t.name)} ({t.count})</option>)}
            </select>
            <button onClick={() => window.print()} disabled={loading || !cards.length}
              className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5 whitespace-nowrap"><Printer size={15} /> Print</button>
          </div>
        </div>
        <p className="max-w-6xl mx-auto px-4 pb-3 text-xs text-slate-500 -mt-1">Prints 9 badges per letter page at standard ID-card size (2⅛ × 3⅜ in). Wait for “ready to print” so every card has rendered.</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && !passOn && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
            Player passes are turned off for this organization. Turn on <span className="font-semibold">Player pass</span> under Forms → Player waiver → Optional fields to print badges.
          </div>
        )}
        {!loading && !error && passOn && cards.length === 0 && <p className="text-sm text-slate-500">No players{team ? ' on this team' : ''} yet.</p>}
        <div className="sheet grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {cards.map(s => (
            <img key={s.id} src={`/pass/${s.passToken}/card.png?v=${encodeURIComponent(s.updatedAt || s.submittedAt || '')}`} alt={`Badge for ${s.data?.playerName || 'player'}`}
              width={720} height={1140} loading="eager" decoding="async"
              onLoad={() => setLoaded(n => n + 1)} onError={() => setFailed(n => n + 1)}
              className="badge w-full h-auto rounded-xl shadow-md bg-white" />
          ))}
        </div>
      </div>
    </div>
  )
}
