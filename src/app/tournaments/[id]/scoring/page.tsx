'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Timer, Search, ChevronLeft } from 'lucide-react'

interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}

function fmt12(t: string) {
  if (!t) return 'TBD'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function LiveScoringPicker() {
  const { id } = useParams()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}/games`).then(r => r.ok ? r.json() : []).then(g => { setGames(Array.isArray(g) ? g : []); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  const filtered = games
    .filter(g => !g.isCanceled)
    .filter(g => {
      const s = q.toLowerCase().trim()
      if (!s) return true
      return [g.team1, g.team2, g.division, g.location, String(g.gameNumber)].some(v => (v || '').toLowerCase().includes(s))
    })
    .sort((a, b) => `${a.date || ''}${a.startTime || ''}` < `${b.date || ''}${b.startTime || ''}` ? -1 : 1)

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => history.back()} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Back</button>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><Timer size={22} className="text-teal-600" /> Live scoring</h1>
      <p className="text-sm text-slate-500 mb-4">Pick a game to open the live scorekeeper — clock, score, and penalties.</p>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search team, division, field, game #…"
          className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      {filtered.length === 0 && <p className="text-sm text-slate-400">No games found.</p>}
      <div className="space-y-2">
        {filtered.map(g => {
          const scored = g.score1 != null && g.score2 != null
          return (
            <Link key={g.id} href={`/tournaments/${id}/games/${g.id}/scorekeeper`} className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-teal-300">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                <span className="font-bold text-slate-700">{fmt12(g.startTime)}</span>
                <span>·</span><span>{g.location || '—'}</span>
                {g.gameNumber && <><span>·</span><span>#{g.gameNumber}</span></>}
                {scored && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{g.score1}–{g.score2}</span>}
              </div>
              <p className="text-sm font-semibold text-slate-800">{g.team1} <span className="text-slate-400 font-normal">vs</span> {g.team2}</p>
              <p className="text-xs text-slate-400">{g.division}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
