'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string }
interface Registration {
  id: string; clubName: string; clubContact: string; contactEmail: string
  invoiceAmount: number; discountAmount: number
  teams: { id: string; teamName: string; division: string; logoUrl?: string }[]
  payments: { amount: number; method: string; receivedAt: string }[]
}
interface PlayerReg {
  id: string; playerName: string; teamClubName: string; grade: string
  gender: string; jerseyNumber: string; waiverSignature: string; parentName: string; parentPhone: string
}
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean; isChampionship: boolean
}
interface HistoryEntry {
  tournament: { id: string; name: string; sport: string; startDate: string; endDate: string; location: string; logoUrl: string }
  clubs: string[]
  teams: { id: string; teamName: string; division: string; logoUrl?: string }[]
  registrations: {
    id: string; clubName: string; clubContact: string; contactEmail: string
    contactPhone: string; clubBasedIn: string; paymentMethod: string; notes: string
    numTeams: number; needsHotel: string; teams: { teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string }[]
  }[]
  record: { wins: number; losses: number; ties: number; gamesPlayed: number }
  championshipWins: string[]
  finance: { invoiceTotal: number; paidTotal: number; balance: number; payments: { amount: number; method: string; receivedAt: string; clubName: string }[] }
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Re-register modal
function ReregisterModal({ entry, tournaments, onClose }: {
  entry: HistoryEntry
  tournaments: Tournament[]
  onClose: () => void
}) {
  const reg = entry.registrations[0]
  const [targetTournament, setTargetTournament] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!targetTournament || !reg) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: targetTournament,
          clubName: reg.clubName,
          clubContact: reg.clubContact,
          contactEmail: reg.contactEmail,
          contactPhone: reg.contactPhone,
          clubBasedIn: reg.clubBasedIn,
          paymentMethod: reg.paymentMethod,
          notes: reg.notes,
          numTeams: reg.numTeams,
          needsHotel: reg.needsHotel,
          teams: reg.teams.map(t => ({
            clubName: reg.clubName,
            teamName: t.teamName,
            division: t.division,
            coachName: t.coachName,
            coachPhone: t.coachPhone,
            coachEmail: t.coachEmail,
          })),
          invoiceAmount: 0,
          discountAmount: 0,
          discountNote: '',
        }),
      })
      if (res.ok) {
        toast.success('Re-registered successfully! The tournament admin will confirm your invoice.')
        onClose()
      } else {
        toast.error('Registration failed — please contact the tournament office.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const targetName = tournaments.find(t => t.id === targetTournament)?.name

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md z-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Re-Register</h2>
        <p className="text-sm text-gray-500 mb-4">
          Pre-filled from <span className="font-medium text-violet-700">{entry.tournament.name}</span> — pick the tournament you want to register for.
        </p>

        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-violet-600 uppercase mb-2">What will be copied</p>
          <p className="text-sm text-gray-700 font-medium">{reg?.clubName}</p>
          <p className="text-sm text-gray-500">{reg?.clubContact} · {reg?.contactEmail}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {reg?.teams.map((t, i) => (
              <span key={i} className="text-xs bg-white border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full">{t.teamName} · {t.division}</span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Register for Tournament</label>
          <select value={targetTournament} onChange={e => setTargetTournament(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">Select tournament…</option>
            {tournaments.filter(t => t.id !== entry.tournament.id).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {targetTournament && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-800">
            ⚠️ Invoice amount will be set to $0 — the tournament admin will confirm your pricing.
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={submit} disabled={!targetTournament || submitting}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2 text-sm">
            {submitting ? 'Submitting…' : `Register for ${targetName ?? '…'}`}
          </button>
          <button onClick={onClose} className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ClubDirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selTournament, setSelTournament] = useState('')
  const [data, setData] = useState<{ clubs: string[]; registrations: Registration[]; playerRegs: PlayerReg[]; games: Game[]; teamNames: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'players' | 'schedule' | 'billing' | 'history'>('overview')
  const [noLinks, setNoLinks] = useState(false)
  const [perms, setPerms] = useState<Record<string, boolean>>({ cd_overview: true, cd_players: true, cd_schedule: true, cd_billing: true })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [reregEntry, setReregEntry] = useState<HistoryEntry | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/club-director/links').then(r => r.json()),
      fetch('/api/club-director/permissions').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([t, links, p]) => {
      setTournaments(t)
      if (p && !p.error) setPerms(p)
      if (!links || links.length === 0) { setNoLinks(true); setLoading(false); return }
      const linkedTournamentIds = [...new Set((links as { tournamentId: string }[]).map(l => l.tournamentId))]
      const first = t.find((x: Tournament) => linkedTournamentIds.includes(x.id)) || t[0]
      if (first) { setSelTournament(first.id); loadData(first.id) }
      setLoading(false)
    })
  }, [status])

  const loadData = async (tournamentId: string) => {
    setDataLoading(true)
    const res = await fetch(`/api/club-director/data?tournamentId=${tournamentId}`)
    const d = await res.json()
    setData(d)
    setDataLoading(false)
  }

  const loadHistory = async () => {
    if (history.length > 0) return
    setHistoryLoading(true)
    const res = await fetch('/api/club-director/history')
    const h = await res.json()
    setHistory(Array.isArray(h) ? h : [])
    setHistoryLoading(false)
  }

  const switchTab = (key: typeof tab) => {
    setTab(key)
    if (key === 'history') loadHistory()
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  if (noLinks) return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="bg-white border border-gray-200 rounded-2xl p-10">
        <div className="text-5xl mb-4">🏒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Welcome, {session?.user?.name}!</h1>
        <p className="text-gray-500">Your account hasn't been linked to a club yet.</p>
        <p className="text-sm text-gray-400 mt-2">Please contact your tournament administrator to get linked to your club.</p>
      </div>
    </div>
  )

  const totalPlayers = data?.playerRegs.length ?? 0
  const totalTeams = data?.registrations.reduce((s, r) => s + r.teams.length, 0) ?? 0
  const totalInvoiced = data?.registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0) ?? 0
  const totalPaid = data?.registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0) ?? 0
  const balance = totalInvoiced - totalPaid

  const TABS: { key: typeof tab; label: string; perm?: string }[] = [
    { key: 'overview',  label: '📋 Overview',  perm: 'cd_overview' },
    { key: 'players',   label: '👤 Players',   perm: 'cd_players'  },
    { key: 'schedule',  label: '📅 Schedule',  perm: 'cd_schedule' },
    { key: 'billing',   label: '💰 Billing',   perm: 'cd_billing'  },
    { key: 'history',   label: '🏆 History'                        },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8">
      {reregEntry && (
        <ReregisterModal entry={reregEntry} tournaments={tournaments} onClose={() => setReregEntry(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Club Director Dashboard</h1>
          <p className="text-violet-600 text-sm font-medium mt-0.5">{data?.clubs.join(', ')}</p>
        </div>
        {tab !== 'history' && (
          <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadData(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Stats — hide on History tab */}
      {tab !== 'history' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Teams', value: totalTeams, color: 'text-violet-600' },
            { label: 'Players', value: totalPlayers, color: 'text-blue-600' },
            { label: 'Invoiced', value: fmt(totalInvoiced), color: 'text-gray-800' },
            { label: 'Balance Due', value: fmt(balance), color: balance > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200 overflow-x-auto items-end">
        {TABS.filter(t => !t.perm || perms[t.perm] !== false).map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {selTournament && (
          <a href={`/tournaments/${selTournament}/public`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-semibold text-rose-600 hover:text-rose-700 whitespace-nowrap border-b-2 border-transparent hover:border-rose-300 transition-colors flex items-center gap-1">
            🌐 Public View
          </a>
        )}
      </div>

      {/* History tab */}
      {tab === 'history' && (
        historyLoading ? <div className="text-center py-12 text-gray-400">Loading history…</div> : (
          history.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No tournament history yet.</div>
          ) : (
            <div className="space-y-5">
              {history.map((entry, i) => {
                const { tournament, record, championshipWins, finance, teams } = entry
                const hasRecord = record.gamesPlayed > 0
                return (
                  <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    {/* Tournament header */}
                    <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-violet-50 to-white border-b border-gray-100">
                      {tournament.logoUrl && (
                        <img src={tournament.logoUrl} alt="" className="h-12 w-12 object-contain rounded-lg" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800">{tournament.name}</div>
                        <div className="text-xs text-gray-500">{tournament.startDate}{tournament.endDate && tournament.endDate !== tournament.startDate ? ` – ${tournament.endDate}` : ''} · {tournament.location}</div>
                      </div>
                      <button onClick={() => setReregEntry(entry)}
                        className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                        🔄 Register Again
                      </button>
                    </div>

                    <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                      {/* Teams & record */}
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Teams ({teams.length})</p>
                        <div className="space-y-1.5">
                          {teams.map((t, j) => (
                            <div key={j} className="flex items-center gap-2">
                              {t.logoUrl && <img src={t.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />}
                              <span className="text-sm text-gray-700">{t.teamName}</span>
                              <span className="text-xs text-gray-400">· {t.division}</span>
                            </div>
                          ))}
                        </div>
                        {championshipWins.length > 0 && (
                          <div className="mt-3">
                            {championshipWins.map((c, j) => (
                              <div key={j} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1">
                                🏆 {c}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Record */}
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Record</p>
                        {hasRecord ? (
                          <div className="flex items-center gap-3">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">{record.wins}</div>
                              <div className="text-xs text-gray-400">W</div>
                            </div>
                            <div className="text-gray-300 text-xl">–</div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-red-500">{record.losses}</div>
                              <div className="text-xs text-gray-400">L</div>
                            </div>
                            {record.ties > 0 && <>
                              <div className="text-gray-300 text-xl">–</div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-500">{record.ties}</div>
                                <div className="text-xs text-gray-400">T</div>
                              </div>
                            </>}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No games recorded</p>
                        )}
                      </div>

                      {/* Payments */}
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Payments</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Invoiced</span>
                            <span className="font-medium text-gray-800">{fmt(finance.invoiceTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Paid</span>
                            <span className="font-medium text-green-700">{fmt(finance.paidTotal)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                            <span className="text-gray-500">Balance</span>
                            <span className={`font-bold ${finance.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(finance.balance)}</span>
                          </div>
                        </div>
                        {finance.payments.length > 0 && (
                          <div className="mt-3 space-y-0.5">
                            {finance.payments.map((p, j) => (
                              <div key={j} className="flex justify-between text-xs text-gray-400">
                                <span>{new Date(p.receivedAt).toLocaleDateString()} · {p.method}</span>
                                <span className="text-green-600 font-medium">{fmt(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )
      )}

      {/* All other tabs */}
      {tab !== 'history' && (
        dataLoading ? <div className="text-center py-12 text-gray-400">Loading…</div> : (
          <>
            {/* Overview */}
            {tab === 'overview' && (
              <div className="space-y-3">
                {data?.registrations.map(reg => {
                  const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
                  const due = reg.invoiceAmount - reg.discountAmount
                  const bal = due - paid
                  return (
                    <div key={reg.id} className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-gray-800">{reg.clubName}</div>
                          <div className="text-sm text-gray-500">{reg.clubContact} · {reg.contactEmail}</div>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${bal <= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {bal <= 0 ? '✓ Paid' : `Balance: ${fmt(bal)}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {reg.teams.map(t => (
                          <div key={t.id} className="flex items-center gap-1.5 text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-lg">
                            {t.logoUrl && <img src={t.logoUrl} alt="" className="h-4 w-4 object-contain rounded" />}
                            {t.teamName} · {t.division}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Players */}
            {tab === 'players' && (
              <div>
                <p className="text-sm text-gray-500 mb-3">{totalPlayers} registered players across your club</p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['Player', 'Team', 'Grade', 'Jersey', 'Parent', 'Waiver'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data?.playerRegs.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{p.playerName}</td>
                          <td className="px-4 py-2.5 text-gray-500">{p.teamClubName}</td>
                          <td className="px-4 py-2.5 text-gray-500">{p.grade}</td>
                          <td className="px-4 py-2.5 text-gray-500">#{p.jerseyNumber || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{p.parentName}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${p.waiverSignature ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {p.waiverSignature ? '✓ Signed' : 'Missing'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!data?.playerRegs.length && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No players registered yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Schedule */}
            {tab === 'schedule' && (
              <div className="space-y-2">
                {data?.games.length === 0 && <div className="text-center py-12 text-gray-400">No games scheduled yet.</div>}
                {data?.games.map(g => {
                  const myTeam = data.teamNames.includes(g.team1) ? g.team1 : g.team2
                  const opponent = myTeam === g.team1 ? g.team2 : g.team1
                  const myScore = myTeam === g.team1 ? g.score1 : g.score2
                  const oppScore = myTeam === g.team1 ? g.score2 : g.score1
                  const hasScore = myScore !== null && oppScore !== null
                  const won = hasScore && myScore! > oppScore!
                  const lost = hasScore && myScore! < oppScore!
                  // Find team logos
                  const myTeamData = data.registrations.flatMap(r => r.teams).find(t => t.teamName === myTeam)
                  return (
                    <div key={g.id} className={`bg-white border rounded-xl px-5 py-3 flex items-center gap-4 ${g.isChampionship ? 'border-amber-300 bg-amber-50' : won ? 'border-green-200' : lost ? 'border-red-200' : 'border-gray-200'}`}>
                      <div className="w-14 text-center flex-shrink-0">
                        <div className="text-xs text-gray-400">{g.date}</div>
                        <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
                        {g.isChampionship && <div className="text-xs text-amber-600 font-bold">🏆 Final</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 flex items-center gap-1.5">
                          {myTeamData?.logoUrl && <img src={myTeamData.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />}
                          <span className="text-violet-700 font-semibold">{myTeam}</span>
                          <span className="text-gray-400 mx-1">vs</span>
                          {opponent}
                        </div>
                        <div className="text-xs text-gray-400">{g.division} · {g.location} · Game #{g.gameNumber}</div>
                      </div>
                      {hasScore ? (
                        <div className={`text-lg font-bold ${won ? 'text-green-600' : lost ? 'text-red-600' : 'text-gray-600'}`}>
                          {myScore} – {oppScore}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Upcoming</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Billing */}
            {tab === 'billing' && (
              <div className="space-y-4">
                {data?.registrations.map(reg => {
                  const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
                  const due = reg.invoiceAmount - reg.discountAmount
                  const bal = due - paid
                  return (
                    <div key={reg.id} className="bg-white border border-gray-200 rounded-xl p-5">
                      <h3 className="font-semibold text-gray-800 mb-4">{reg.clubName}</h3>
                      <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="font-bold text-gray-800">{fmt(reg.invoiceAmount)}</div>
                          <div className="text-xs text-gray-500">Invoice</div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-3 text-center">
                          <div className="font-bold text-green-700">{fmt(paid)}</div>
                          <div className="text-xs text-gray-500">Paid</div>
                        </div>
                        <div className={`rounded-xl p-3 text-center ${bal > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                          <div className={`font-bold ${bal > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(bal)}</div>
                          <div className="text-xs text-gray-500">Balance</div>
                        </div>
                      </div>
                      {reg.payments.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment History</p>
                          <div className="space-y-1">
                            {reg.payments.map((p, i) => (
                              <div key={i} className="flex justify-between text-sm text-gray-600">
                                <span>{new Date(p.receivedAt).toLocaleDateString()} · {p.method}</span>
                                <span className="font-medium text-green-700">{fmt(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {reg.payments.length === 0 && <p className="text-sm text-gray-400">No payments recorded yet.</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
