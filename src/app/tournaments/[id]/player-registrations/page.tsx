'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

interface PlayerRegistration {
  id: string
  playerName: string
  playerEmail: string
  usLacrosseNumber: string
  gender: string
  dob: string
  grade: string
  teamClubName: string
  jerseyNumber: string
  parentName: string
  parentEmail: string
  parentPhone: string
  parent2Name: string
  parent2Email: string
  parent2Phone: string
  emergencyContactName: string
  emergencyContactPhone: string
  waiverSignature: string
  needsHotel: string
  wantsUpdates: boolean
  createdAt: string
}

const today = () => new Date().toISOString().slice(0, 10)

function downloadCSV(players: PlayerRegistration[], tournamentName: string) {
  const headers = [
    'Player Name', 'Player Email', 'US Lacrosse #', 'Gender', 'Date of Birth', 'Grade',
    'Team / Club', 'Jersey #',
    'Parent Name', 'Parent Email', 'Parent Phone',
    'Parent 2 Name', 'Parent 2 Email', 'Parent 2 Phone',
    'Emergency Contact', 'Emergency Phone',
    'Waiver Signature', 'Needs Hotel', 'Wants Updates', 'Submitted'
  ]
  const rows = players.map(p => [
    p.playerName, p.playerEmail, p.usLacrosseNumber, p.gender, p.dob, p.grade,
    p.teamClubName, p.jerseyNumber,
    p.parentName, p.parentEmail, p.parentPhone,
    p.parent2Name, p.parent2Email, p.parent2Phone,
    p.emergencyContactName, p.emergencyContactPhone,
    p.waiverSignature, p.needsHotel, p.wantsUpdates ? 'Yes' : 'No',
    new Date(p.createdAt).toLocaleDateString()
  ])
  const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(v => esc(String(v))).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `player-registrations-${tournamentName.replace(/\s+/g, '-').toLowerCase()}-${today()}.csv`
  a.click()
}

export default function PlayerRegistrationsPage() {
  const { id: tournamentId } = useParams()
  const [players, setPlayers] = useState<PlayerRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [search, setSearch] = useState('')
  const [filterGender, setFilterGender] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterHotel, setFilterHotel] = useState('')
  const [filterTeam, setFilterTeam] = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [teamDivisionMap, setTeamDivisionMap] = useState<Record<string, string>>({})

  const load = () => {
    Promise.all([
      fetch(`/api/player-registrations?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}`).then(r => r.json()),
      fetch(`/api/registrations?tournamentId=${tournamentId}`).then(r => r.json()),
    ]).then(([regs, t, teamRegs]) => {
      setPlayers(regs)
      setTournamentName(t.name || '')
      if (t.logoUrl) setTournamentLogo(t.logoUrl)
      // Build team name → division map
      const map: Record<string, string> = {}
      teamRegs.forEach((r: { teams: { teamName: string; clubName: string; division: string }[] }) => {
        r.teams.forEach(team => {
          const name = team.teamName || team.clubName
          if (name && team.division) map[name] = team.division
        })
      })
      setTeamDivisionMap(map)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [tournamentId])

  const getDivision = (p: PlayerRegistration) => teamDivisionMap[p.teamClubName] || ''

  const filtered = players.filter(p => {
    if (search && ![p.playerName, p.teamClubName, p.parentName, p.parentEmail, p.grade, p.gender]
      .some(v => v.toLowerCase().includes(search.toLowerCase()))) return false
    if (filterGender && p.gender !== filterGender) return false
    if (filterGrade && p.grade !== filterGrade) return false
    if (filterHotel && p.needsHotel !== filterHotel) return false
    if (filterTeam && p.teamClubName !== filterTeam) return false
    if (filterDivision && getDivision(p) !== filterDivision) return false
    return true
  })

  const allGrades = Array.from(new Set(players.map(p => p.grade).filter(Boolean))).sort((a, b) => {
    const order = ['K','1','2','3','4','5','6','7','8','9','10','11','12']
    return order.indexOf(a) - order.indexOf(b)
  })
  const allTeams = Array.from(new Set(players.map(p => p.teamClubName).filter(Boolean))).sort()
  const allDivisions = Array.from(new Set(players.map(p => getDivision(p)).filter(Boolean))).sort()
  const hasFilters = search || filterGender || filterGrade || filterHotel || filterTeam || filterDivision

  // Stats
  const byGender = players.reduce((acc, p) => { acc[p.gender] = (acc[p.gender] || 0) + 1; return acc }, {} as Record<string, number>)
  const hotelYes = players.filter(p => p.needsHotel === 'Yes').length
  const hotelMaybe = players.filter(p => p.needsHotel === 'Maybe').length

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete registration for "${name}"? This cannot be undone.`)) return
    try {
      await fetch(`/api/player-registrations/${id}`, { method: 'DELETE' })
      toast.success('Deleted.')
      setExpanded(null)
      load()
    } catch { toast.error('Failed to delete.') }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster />
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {tournamentLogo && (
              <img src={tournamentLogo} alt="logo" className="h-14 w-14 object-contain rounded-xl border border-gray-200 bg-gray-50 flex-shrink-0" />
            )}
            <div>
              <Link href={`/tournaments/${tournamentId}/dashboard`} className="text-sm text-blue-600 hover:underline mb-1 block">← Back to Dashboard</Link>
              <h1 className="text-2xl font-bold text-gray-800">
                {tournamentName ? `${tournamentName} — Player Registrations` : 'Player Registrations'}
              </h1>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Total', value: players.length, color: 'text-blue-600' },
              { label: 'Male', value: byGender['Male'] || 0, color: 'text-sky-600' },
              { label: 'Female', value: byGender['Female'] || 0, color: 'text-pink-600' },
              { label: 'Hotel Yes', value: hotelYes, color: 'text-green-600' },
              { label: 'Hotel Maybe', value: hotelMaybe, color: 'text-orange-500' },
            ].map(s => (
              <div key={s.label} className="bg-white border rounded-xl px-3 py-2 text-center min-w-[64px]">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action bar */}
        <div className="mb-4 flex gap-2 flex-wrap items-center">
          <button
            onClick={() => downloadCSV(filtered, tournamentName)}
            disabled={!filtered.length}
            className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
          >
            ⬇ CSV {hasFilters ? `(${filtered.length})` : ''}
          </button>
          <Link href={`/tournaments/${tournamentId}/player-register`} target="_blank"
            className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            🔗 Public Form
          </Link>
        </div>

        {/* Filters */}
        {!loading && players.length > 0 && (
          <div className="mb-4 flex gap-2 flex-wrap items-center">
            <input type="search" placeholder="Search name, club…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Divisions</option>
              {allDivisions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Teams</option>
              {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Genders</option>
              <option>Female</option>
              <option>Male</option>
            </select>
            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Grades</option>
              {allGrades.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <select value={filterHotel} onChange={e => setFilterHotel(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Hotel</option>
              <option value="Yes">Hotel Yes</option>
              <option value="Maybe">Hotel Maybe</option>
              <option value="No">Hotel No</option>
            </select>
            {hasFilters && (
              <>
                <button onClick={() => { setSearch(''); setFilterGender(''); setFilterGrade(''); setFilterHotel(''); setFilterTeam(''); setFilterDivision('') }}
                  className="text-sm text-gray-500 hover:text-gray-700 underline">Clear</button>
                <span className="text-sm text-gray-500">{filtered.length} of {players.length}</span>
              </>
            )}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : players.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-4xl mb-3">🏃</div>
            <p className="font-medium text-gray-600">No player registrations yet</p>
            <p className="text-sm mt-1">Share the <Link href={`/tournaments/${tournamentId}/player-register`} target="_blank" className="text-blue-600 hover:underline">public form link</Link> to get started</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No results for "{search}"</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p, i) => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Row */}
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="flex-1 text-left min-w-0">
                    <div className="font-semibold text-gray-800">{p.playerName}</div>
                    <div className="text-sm text-gray-500">
                      {p.teamClubName}{getDivision(p) && ` · ${getDivision(p)}`} · Grade {p.grade} · {p.gender}
                      {p.jerseyNumber && ` · #${p.jerseyNumber}`}
                    </div>
                  </button>
                  <div className="hidden sm:flex items-center gap-3 text-sm text-gray-500 flex-shrink-0">
                    <span>{p.parentName}</span>
                    <span>{p.parentEmail}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.needsHotel === 'Yes' ? 'bg-green-100 text-green-700' :
                      p.needsHotel === 'Maybe' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>🏨 {p.needsHotel || 'No'}</span>
                    <button onClick={() => handleDelete(p.id, p.playerName)}
                      className="text-xs text-red-500 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg">Del</button>
                    <span className="text-gray-400 text-sm">{expanded === p.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === p.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 font-semibold">Player</p>
                        <div className="space-y-1">
                          <div><span className="text-gray-500">Email: </span>{p.playerEmail || '—'}</div>
                          <div><span className="text-gray-500">US Lacrosse #: </span>{p.usLacrosseNumber}</div>
                          <div><span className="text-gray-500">DOB: </span>{p.dob || '—'}</div>
                          <div><span className="text-gray-500">Grade: </span>{p.grade}</div>
                          <div><span className="text-gray-500">Gender: </span>{p.gender}</div>
                          <div><span className="text-gray-500">Club: </span>{p.teamClubName}</div>
                          <div><span className="text-gray-500">Jersey #: </span>{p.jerseyNumber || '—'}</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 font-semibold">Parent / Guardian</p>
                        <div className="space-y-1">
                          <div><span className="text-gray-500">Name: </span>{p.parentName}</div>
                          <div><span className="text-gray-500">Email: </span>{p.parentEmail}</div>
                          <div><span className="text-gray-500">Phone: </span>{p.parentPhone}</div>
                          {p.parent2Name && <>
                            <div className="pt-1 text-xs text-gray-400 font-medium">Parent 2</div>
                            <div><span className="text-gray-500">Name: </span>{p.parent2Name}</div>
                            {p.parent2Email && <div><span className="text-gray-500">Email: </span>{p.parent2Email}</div>}
                            {p.parent2Phone && <div><span className="text-gray-500">Phone: </span>{p.parent2Phone}</div>}
                          </>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 font-semibold">Emergency &amp; Other</p>
                        <div className="space-y-1">
                          <div><span className="text-gray-500">Emergency Contact: </span>{p.emergencyContactName}</div>
                          <div><span className="text-gray-500">Emergency Phone: </span>{p.emergencyContactPhone}</div>
                          <div className="pt-1"><span className="text-gray-500">Hotel: </span>{p.needsHotel || 'No'}</div>
                          <div><span className="text-gray-500">Wants Updates: </span>{p.wantsUpdates ? 'Yes' : 'No'}</div>
                          <div><span className="text-gray-500">Submitted: </span>{new Date(p.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    {/* Waiver signature */}
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Waiver Signature</p>
                      <p className="text-sm italic text-gray-700">"{p.waiverSignature}"</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
