'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import BracketBuilder from './BracketBuilder'
import { ArrowRight, Check, X, AlertTriangle, Pencil, Sparkles, Zap, ArrowLeftRight } from 'lucide-react'

const PALETTE = [
  '#3b82f6', '#10b981', '#a855f7', '#f97316', '#ec4899',
  '#14b8a6', '#ef4444', '#f59e0b', '#6366f1', '#06b6d4',
]

interface Division { name: string; teamCount: number; poolCount: number; unassignedTeams: number; gameCount: number }
interface Pool { id: string; name: string; teamNames: string[] }
interface PoolGame {
  id: string; gameNumber: string; pool: string | null
  team1: string; team2: string; date: string; startTime: string; location: string
}

interface Team {
  id: string; teamName: string; clubName: string; division: string
  coachName: string; coachPhone: string; coachEmail: string
  pool: string | null; paid: number; owed: number; paymentStatus: 'paid' | 'partial' | 'unpaid'
  status: 'confirmed' | 'placeholder'
}

function payBadge(status: Team['paymentStatus']) {
  if (status === 'paid')    return <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Paid</span>
  if (status === 'partial') return <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Partial</span>
  return <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Unpaid</span>
}

export default function DivisionsPage() {
  const { id } = useParams<{ id: string }>()
  const [tournament, setTournament] = useState<{ name: string; logoUrl: string } | null>(null)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [activeDiv, setActiveDiv] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'teams' | 'pools' | 'pool-games' | 'bracket'>('teams')
  const [teams, setTeams] = useState<Team[]>([])
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDiv, setLoadingDiv] = useState(false)
  const [divColors, setDivColors] = useState<Record<string, string>>({})
  const [poolGames, setPoolGames] = useState<PoolGame[]>([])

  // Pool games state
  const [generating, setGenerating] = useState(false)
  const [genDate, setGenDate] = useState('')
  const [genRefCount, setGenRefCount] = useState('2')
  const [gamesPerTeam, setGamesPerTeam] = useState('2')
  const [renumbering, setRenumbering] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [divGamesPerTeam, setDivGamesPerTeam] = useState<Record<string, string>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [guarantee, setGuarantee] = useState('4')
  const [smartTable, setSmartTable] = useState<Record<number, { games?: number; pools?: number; bracket?: string }>>({})
  const [showSmartEditor, setShowSmartEditor] = useState(false)
  const [smartMax, setSmartMax] = useState(16)
  useEffect(() => { try { const raw = localStorage.getItem('smartDefaults:' + id); if (raw) setSmartTable(JSON.parse(raw)) } catch {} }, [id])

  // Scheduled games warning state
  const [generateConfirm, setGenerateConfirm] = useState<{div: string; scheduledCount: number; all: boolean} | null>(null)

  // Add / Edit team state
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamForm, setTeamForm] = useState({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '' })
  const [savingTeam, setSavingTeam] = useState(false)

  // Division management state
  const [renamingDiv, setRenamingDiv] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingDivInput, setAddingDivInput] = useState(false)
  const [newDivName, setNewDivName] = useState('')
  const [movingTeam, setMovingTeam] = useState<Team | null>(null)
  const [moveTarget, setMoveTarget] = useState('')

  // Swap teams state
  const [swapA, setSwapA] = useState<string | null>(null)
  const [swapB, setSwapB] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)

  // Pool management
  const [newPoolName, setNewPoolName] = useState('')
  const [addingPool, setAddingPool] = useState(false)
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/division-colors`).then(r => r.json()),
    ]).then(([t, d, colors]) => {
      setDivColors(colors)
      setTournament(t)
      setDivisions(d.map((div: Division) => ({ unassignedTeams: 0, gameCount: 0, ...div })))
      // Smart defaults based on guarantee
      const g = 4  // default guarantee
      const defaults: Record<string, string> = {}
      d.forEach((div: Division) => {
        const n = div.teamCount
        if (n <= 1) { defaults[div.name] = '1'; return }
        if (n - 1 <= g) { defaults[div.name] = String(n - 1); return }
        defaults[div.name] = n % 2 === 0 ? String(Math.min(n - 1, g - 1)) : String(Math.min(n - 1, g - 2))
      })
      setDivGamesPerTeam(defaults)
      if (d.length > 0) selectDiv(d[0].name)
      setLoading(false)
    })
  }, [id])

  async function loadPoolGames(div: string) {
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`)
    const data = await res.json()
    setPoolGames(Array.isArray(data) ? data : [])
  }

  async function addTeam() {
    if (!activeDiv || !teamForm.teamName.trim()) return
    setSavingTeam(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamForm),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to add team'); setSavingTeam(false); return }
    setTeams(t => [...t, data].sort((a, b) => a.teamName.localeCompare(b.teamName)))
    setDivisions(d => d.map(x => x.name === activeDiv ? { ...x, teamCount: x.teamCount + 1 } : x))
    setTeamForm({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '' })
    setShowAddTeam(false)
    setSavingTeam(false)
    toast.success(`${data.teamName} added as placeholder`)
  }

  async function updateTeam(confirm = false) {
    if (!editingTeam) return
    setSavingTeam(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv!)}/teams`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: editingTeam.id, ...teamForm, confirm }),
    })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to update team'); setSavingTeam(false); return }
    setTeams(t => t.map(x => x.id === editingTeam.id ? {
      ...x,
      teamName: teamForm.teamName || x.teamName,
      clubName: teamForm.clubName,
      coachName: teamForm.coachName,
      coachEmail: teamForm.coachEmail,
      coachPhone: teamForm.coachPhone,
      status: confirm ? 'confirmed' : x.status,
    } : x))
    setEditingTeam(null)
    setSavingTeam(false)
    toast.success(confirm ? 'Team confirmed' : 'Team updated')
  }

  async function createDivision() {
    if (!newDivName.trim()) return
    const res = await fetch(`/api/tournaments/${id}/divisions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDivName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to create division'); return }
    setDivisions(d => [...d, { name: newDivName.trim(), teamCount: 0, poolCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)))
    setNewDivName('')
    setAddingDivInput(false)
    toast.success(`Division "${newDivName.trim()}" created`)
  }

  async function renameDiv(oldName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === oldName) { setRenamingDiv(null); return }
    const res = await fetch(`/api/tournaments/${id}/divisions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to rename'); return }
    setDivisions(d => d.map(x => x.name === oldName ? { ...x, name: newName } : x).sort((a, b) => a.name.localeCompare(b.name)))
    setDivColors(prev => {
      const next = { ...prev }
      if (prev[oldName]) { next[newName] = prev[oldName]; delete next[oldName] }
      return next
    })
    setDivGamesPerTeam(prev => {
      const next = { ...prev }
      if (prev[oldName]) { next[newName] = prev[oldName]; delete next[oldName] }
      return next
    })
    if (activeDiv === oldName) setActiveDiv(newName)
    setRenamingDiv(null)
    toast.success(`Renamed to "${newName}"`)
  }

  async function deleteDiv(name: string) {
    const div = divisions.find(d => d.name === name)
    if (div && div.teamCount > 0) {
      toast.error(`Move or remove all ${div.teamCount} team(s) before deleting`)
      return
    }
    if (!confirm(`Delete division "${name}"? This will also remove its pools.`)) return
    const res = await fetch(`/api/tournaments/${id}/divisions`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to delete'); return }
    setDivisions(d => d.filter(x => x.name !== name))
    if (activeDiv === name) setActiveDiv(divisions.find(x => x.name !== name)?.name ?? null)
    toast.success(`Division "${name}" deleted`)
  }

  async function moveTeam(team: Team, newDivision: string) {
    if (!activeDiv || !newDivision.trim()) return
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id, newDivision }),
    })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? 'Failed to move team'); return }
    setTeams(t => t.filter(x => x.id !== team.id))
    setDivisions(d => d.map(x => {
      if (x.name === activeDiv) return { ...x, teamCount: x.teamCount - 1 }
      if (x.name === newDivision) return { ...x, teamCount: x.teamCount + 1 }
      return x
    }))
    setMovingTeam(null)
    toast.success(`${team.teamName} moved to ${newDivision}`)
  }

  const selectDiv = useCallback((div: string) => {
    setActiveDiv(div)
    setLoadingDiv(true)
    setSwapA(null); setSwapB(null)
    Promise.all([
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/teams`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`).then(r => r.json()),
    ]).then(([teamData, gameData]) => {
      setTeams(teamData.teams ?? [])
      setPools(teamData.pools ?? [])
      setPoolGames(Array.isArray(gameData) ? gameData : [])
      setLoadingDiv(false)
    })
  }, [id])

  async function addPool() {
    if (!newPoolName.trim() || !activeDiv) return
    setAddingPool(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPoolName.trim() }),
    })
    const pool = await res.json()
    if (!res.ok) {
      toast.error(pool.error ?? 'Failed to create pool')
      setAddingPool(false)
      return
    }
    setPools(p => [...p, pool])
    setDivisions(d => d.map(div => div.name === activeDiv ? { ...div, poolCount: div.poolCount + 1 } : div))
    setNewPoolName('')
    setAddingPool(false)
    toast.success(`${pool.name} created`)
  }

  async function deletePool(poolId: string) {
    if (!activeDiv || !confirm('Delete this pool? Team assignments will be cleared.')) return
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId }),
    })
    setPools(p => p.filter(x => x.id !== poolId))
    setDivisions(d => d.map(div => div.name === activeDiv ? { ...div, poolCount: div.poolCount - 1 } : div))
    setTeams(t => t.map(x => ({ ...x, pool: x.pool === pools.find(p => p.id === poolId)?.name ? null : x.pool })))
    toast.success('Pool deleted')
  }

  async function assignTeamToPool(teamName: string, poolName: string | null) {
    if (!activeDiv) return
    setAssigningTeam(teamName)
    const newPools = pools.map(p => {
      const names = p.teamNames.filter(n => n !== teamName)
      if (poolName && p.name === poolName) names.push(teamName)
      return { ...p, teamNames: names }
    })
    await Promise.all(newPools.map(p =>
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: p.id, teamNames: p.teamNames }),
      })
    ))
    setPools(newPools)
    setTeams(t => t.map(x => x.teamName === teamName ? { ...x, pool: poolName } : x))
    setAssigningTeam(null)
  }

  async function swapTeams() {
    if (!swapA || !swapB || !activeDiv) return
    const teamA = teams.find(t => t.teamName === swapA)
    const teamB = teams.find(t => t.teamName === swapB)
    if (!teamA || !teamB) return
    setSwapping(true)
    await Promise.all([
      assignTeamToPool(swapA, teamB.pool),
      assignTeamToPool(swapB, teamA.pool),
    ])
    setSwapA(null); setSwapB(null)
    setSwapping(false)
    toast.success('Teams swapped')
  }

  async function checkAndGenerate(div: string, isAll = false) {
    // Count scheduled games for this division
    const existing = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`).then(r => r.json())
    const scheduled = Array.isArray(existing) ? existing.filter((g: {startTime: string}) => g.startTime) : []
    if (scheduled.length > 0) {
      setGenerateConfirm({ div, scheduledCount: scheduled.length, all: isAll })
      return false
    }
    return true
  }

  async function doGenerateGames(div: string) {
    setGenerating(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', date: genDate, refCount: Number(genRefCount), gamesPerTeam: Number(divGamesPerTeam[div] ?? '2'), clearExisting: true }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to generate games'); setGenerating(false); return }
    if (div === activeDiv) await loadPoolGames(div)
    setGenerating(false)
    const gpt = divGamesPerTeam[div] ?? '2'
    toast.success(`${data.generated} games created for ${div} → ${gpt} games/team · now in parking lot`)
  }

  async function generateGames() {
    if (!activeDiv) return
    const ok = await checkAndGenerate(activeDiv, false)
    if (ok) await doGenerateGames(activeDiv)
  }

  function smartPoolGames(teamCount: number, g: number): number {
    if (teamCount <= 1) return 1
    if (teamCount - 1 <= g) return teamCount - 1  // small enough for full round-robin
    if (teamCount % 2 === 0) return Math.min(teamCount - 1, g - 1)  // even: 1 bracket round
    return Math.min(teamCount - 1, g - 2)  // odd: 2 bracket rounds
  }

  function saveSmartTable() {
    try { localStorage.setItem('smartDefaults:' + id, JSON.stringify(smartTable)) } catch {}
    toast.success('Smart defaults saved')
    setShowSmartEditor(false)
  }

  function applySmartDefaults() {
    const g = Number(guarantee) || 4
    const updated: Record<string, string> = {}
    divisions.forEach(div => {
      const v = smartTable[div.teamCount]?.games ?? smartPoolGames(div.teamCount, g)
      updated[div.name] = String(Math.max(1, Math.min(v, Math.max(1, div.teamCount - 1))))
    })
    setDivGamesPerTeam(updated)
    toast.success('Smart defaults applied')
  }

  async function generateAllDivisions() {
    if (divisions.length === 0) { toast.error('No divisions found'); return }

    // Check total scheduled games across all divisions
    let totalScheduled = 0
    for (const div of divisions) {
      if (div.teamCount === 0) continue
      const existing = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/pool-games`).then(r => r.json()).catch(() => [])
      totalScheduled += Array.isArray(existing) ? existing.filter((g: {startTime: string}) => g.startTime).length : 0
    }
    if (totalScheduled > 0) {
      setGenerateConfirm({ div: 'ALL', scheduledCount: totalScheduled, all: true })
      return
    }

    setGeneratingAll(true)
    let totalGames = 0
    let autoPooled = 0

    // Clean up stale games for 0-team divisions
    for (const div of divisions) {
      if (div.teamCount === 0 && div.gameCount > 0) {
        await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/pool-games`, { method: 'DELETE' })
        setDivisions(d => d.map(x => x.name === div.name ? { ...x, gameCount: 0 } : x))
      }
    }

    for (const div of divisions) {
      if (div.teamCount === 0) continue

      // Auto-create the planned number of pools and split teams across them, if no pools exist
      let poolCount = div.poolCount
      if (poolCount === 0) {
        const tRes = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/teams`)
        const tData = await tRes.json()
        const teamNames: string[] = (tData.teams ?? []).map((t: { teamName: string }) => t.teamName)
        if (teamNames.length === 0) continue
        const wantPools = Math.max(1, Math.min(smartTable[div.teamCount]?.pools ?? 1, teamNames.length))
        const buckets: string[][] = Array.from({ length: wantPools }, () => [])
        teamNames.forEach((t, i) => buckets[i % wantPools].push(t))
        for (let p = 0; p < wantPools; p++) {
          const pRes = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/pools`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Pool ' + String.fromCharCode(65 + p) }),
          })
          const pool = await pRes.json()
          if (!pRes.ok) continue
          await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/pools`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poolId: pool.id, teamNames: buckets[p] }),
          })
        }
        poolCount = wantPools
        autoPooled++
        setDivisions(d => d.map(x => x.name === div.name ? { ...x, poolCount: wantPools } : x))
      }

      // Generate games
      const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div.name)}/pool-games`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', refCount: 2, gamesPerTeam: Number(divGamesPerTeam[div.name] ?? 3), clearExisting: true }),
      })
      const data = await res.json()
      if (res.ok) totalGames += data.generated ?? 0
    }

    // reload current division data
    if (activeDiv) {
      const [teamData, gameData] = await Promise.all([
        fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`).then(r => r.json()),
        fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`).then(r => r.json()),
      ])
      setTeams(teamData.teams ?? [])
      setPools(teamData.pools ?? [])
      setPoolGames(Array.isArray(gameData) ? gameData : [])
    }

    setGeneratingAll(false)
    const poolMsg = autoPooled > 0 ? ` (auto-created pools for ${autoPooled} divisions)` : ''
    toast.success(`${totalGames} pool games generated${poolMsg}`)
  }

  async function renumberGames() {
    if (!activeDiv) return
    setRenumbering(true)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renumber' }),
    })
    await loadPoolGames(activeDiv)
    setRenumbering(false)
    toast.success('Games renumbered')
  }

  async function clearGames() {
    if (!activeDiv) return
    setShowClearConfirm(false)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, { method: 'DELETE' })
    setPoolGames([])
    toast.success('Pool games cleared')
  }

  async function saveDivColor(division: string, color: string) {
    setDivColors(prev => ({ ...prev, [division]: color }))
    await fetch(`/api/tournaments/${id}/division-colors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division, color }),
    })
  }

if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Loading divisions...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <TournamentNav id={id} name={tournament?.name ?? ''} logoUrl={tournament?.logoUrl} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <div className="flex gap-6">

          {/* -- Sidebar -------------------------------------------- */}
          <div className="w-80 flex-shrink-0 sticky top-6 self-start">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-800 px-4 py-3">
                <p className="text-xs font-bold text-white uppercase tracking-wider">Divisions</p>
              </div>
              {divisions.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  No divisions yet.
                  <Link href={`/tournaments/${id}/builder`} className="block mt-1 text-teal-500 hover:underline">Set up in Builder <ArrowRight size={12} className="inline -mt-0.5" /></Link>
                </div>
              ) : (
                <div>
                  {divisions.map(div => (
                    <div key={div.name}
                      className={`w-full border-b border-slate-100 last:border-b-0 transition-colors group ${activeDiv === div.name ? 'bg-teal-50 border-l-2 border-l-sky-500' : div.teamCount === 0 ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-slate-50'}`}>
                      {renamingDiv === div.name ? (
                        <div className="flex items-center gap-1 px-2 py-2" onClick={e => e.stopPropagation()}>
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm ml-2"
                            style={{ backgroundColor: divColors[div.name] || PALETTE[divisions.indexOf(div) % PALETTE.length] }} />
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') renameDiv(div.name); if (e.key === 'Escape') setRenamingDiv(null) }}
                            className="flex-1 min-w-0 text-xs border border-teal-400 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                          <button onClick={() => renameDiv(div.name)} className="text-teal-600 hover:text-teal-800 text-xs font-bold px-1"><Check size={14} /></button>
                          <button onClick={() => setRenamingDiv(null)} className="text-slate-400 hover:text-slate-600 text-xs px-1"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center pr-1">
                          <button onClick={() => selectDiv(div.name)} className="flex-1 text-left px-4 py-2.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                                style={{ backgroundColor: divColors[div.name] || PALETTE[divisions.indexOf(div) % PALETTE.length] }}
                              />
                              <p className={`text-sm font-semibold truncate ${activeDiv === div.name ? 'text-teal-700' : 'text-slate-700'}`}>{div.name}</p>
                            </div>
                            <div className="pl-5 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">{div.teamCount} team{div.teamCount !== 1 ? 's' : ''} · {div.poolCount} pool{div.poolCount !== 1 ? 's' : ''}</span>
                              {div.gameCount > 0 && (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{div.gameCount} games</span>
                              )}
                              {div.unassignedTeams > 0 && div.poolCount > 0 && (
                                <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full" title={`${div.unassignedTeams} team${div.unassignedTeams !== 1 ? 's' : ''} not assigned to a pool`}>
                                  <AlertTriangle size={11} className="inline -mt-0.5" /> {div.unassignedTeams} unassigned
                                </span>
                              )}
                              {div.unassignedTeams > 0 && div.poolCount === 0 && div.teamCount > 0 && (
                                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full" title="No pools created yet">
                                  No pools yet
                                </span>
                              )}
                            </div>
                          </button>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => { setRenamingDiv(div.name); setRenameValue(div.name) }}
                              className="p-1 text-slate-400 hover:text-teal-600 rounded" title="Rename">
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => deleteDiv(div.name)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded" title="Delete">
                              <X size={13} />
                            </button>
                          </div>
                          <div className="flex flex-col items-center flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                            <span className="text-[9px] text-slate-400 leading-none mb-0.5">gms</span>
                            <input
                              type="number" min="1" max="10"
                              value={divGamesPerTeam[div.name] ?? '3'}
                              onChange={e => setDivGamesPerTeam(prev => ({ ...prev, [div.name]: e.target.value }))}
                              className="w-10 border border-slate-200 rounded text-center text-xs py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Add division */}
                  {addingDivInput ? (
                    <div className="flex items-center gap-1 px-2 py-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={newDivName}
                        onChange={e => setNewDivName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createDivision(); if (e.key === 'Escape') { setAddingDivInput(false); setNewDivName('') } }}
                        placeholder="Division name..."
                        className="flex-1 min-w-0 text-xs border border-teal-400 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                      <button onClick={createDivision} className="text-teal-600 hover:text-teal-800 text-xs font-bold px-1"><Check size={14} /></button>
                      <button onClick={() => { setAddingDivInput(false); setNewDivName('') }} className="text-slate-400 text-xs px-1"><X size={14} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingDivInput(true)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-teal-600 hover:bg-slate-50 border-t border-slate-100 transition-colors">
                      + Add Division
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Totals summary */}
            {divisions.some(d => d.gameCount > 0) && (
              <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between bg-slate-50">
                <span className="text-xs text-slate-500">Total games</span>
                <span className="text-sm font-bold text-slate-700">
                  {divisions.reduce((s, d) => s + d.gameCount, 0)}
                </span>
              </div>
            )}
            {/* Bulk generator panel */}
            <div className="border-t border-slate-200 px-4 py-4 space-y-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bulk Generate</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Game guarantee</span>
                <input
                  type="number" min="1" max="12"
                  value={guarantee}
                  onChange={e => setGuarantee(e.target.value)}
                  className="w-12 border border-slate-200 rounded text-center text-xs py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={applySmartDefaults}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium py-1.5 px-3 rounded-lg transition-colors"
                >
                  <Sparkles size={13} /> Smart defaults
                </button>
                <button onClick={() => setShowSmartEditor(true)} title="Edit smart defaults" className="px-2 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition-colors">
                  <Pencil size={13} />
                </button>
              </div>
              <button
                onClick={generateAllDivisions}
                disabled={generatingAll}
                className="w-full flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
              >
        {generatingAll ? 'Generating...' : <><Zap size={13} /> Generate all divisions</>}
              </button>
              <p className="text-[10px] text-slate-400 text-center leading-tight">Auto-creates Pool A if needed</p>
            </div>
            {showSmartEditor && (() => {
              const maxN = Math.max(smartMax, ...divisions.map(d => d.teamCount), 2)
              const counts: number[] = []; for (let n = 2; n <= maxN; n++) counts.push(n)
              const g = Number(guarantee) || 4
              const BRACKETS = [{ v: '', l: 'None' }, { v: 'single', l: 'Single elim' }, { v: 'single-con', l: 'Single elim + 3rd' }, { v: 'double', l: 'Double elim' }, { v: '2gg', l: '2-game guarantee' }]
              const setField = (n: number, k: 'games' | 'pools' | 'bracket', val: number | string) => setSmartTable(prev => ({ ...prev, [n]: { ...prev[n], [k]: val } }))
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSmartEditor(false)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles size={15} className="text-teal-500" /> Smart defaults</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Your preferred setup for a division by how many teams it has. Smart defaults applies games/team; pools and bracket are saved as your plan.</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><span>Show team counts up to</span><input type="number" min="2" value={smartMax} onChange={e => setSmartMax(Math.max(2, Number(e.target.value) || 2))} className="w-16 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" /><span>teams</span></div>
                    </div>
                    <div className="px-5 py-2 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wide">
                          <th className="text-left font-semibold py-1">Teams</th>
                          <th className="font-semibold py-1">Games/team</th>
                          <th className="font-semibold py-1">Pools</th>
                          <th className="text-left font-semibold py-1 pl-3">Bracket</th>
                        </tr></thead>
                        <tbody>
                          {counts.map(n => {
                            const row = smartTable[n] || {}
                            const games = row.games ?? smartPoolGames(n, g)
                            const pools = row.pools ?? 1
                            const bracket = row.bracket ?? ''
                            return (
                              <tr key={n} className="border-t border-slate-50">
                                <td className="py-1 text-slate-600 font-medium">{n} teams</td>
                                <td className="py-1 text-center">
                                  <input type="number" min="1" max={Math.max(1, n - 1)} value={games}
                                    onChange={e => setField(n, 'games', Math.max(1, Math.min(Number(e.target.value) || 1, Math.max(1, n - 1))))}
                                    className="w-12 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                                </td>
                                <td className="py-1 text-center">
                                  <input type="number" min="1" max={n} value={pools}
                                    onChange={e => setField(n, 'pools', Math.max(1, Math.min(Number(e.target.value) || 1, n)))}
                                    className="w-12 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                                </td>
                                <td className="py-1 pl-3">
                                  <select value={bracket} onChange={e => setField(n, 'bracket', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400">
                                    {BRACKETS.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button onClick={() => setSmartTable(prev => { const t = { ...prev }; counts.forEach(n => { t[n] = { ...t[n], games: smartPoolGames(n, g) } }); return t })} className="text-xs text-slate-500 hover:text-slate-700">Reset games from guarantee ({g})</button>
                      <div className="flex gap-2">
                        <button onClick={() => setShowSmartEditor(false)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5">Close</button>
                        <button onClick={saveSmartTable} className="text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded-lg transition-colors">Save</button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* -- Main content --------------------------------------- */}
          <div className="flex-1 min-w-0">
            {!activeDiv ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                Select a division to get started
              </div>
            ) : loadingDiv ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 animate-pulse">Loading...</div>
            ) : (
              <>
                {/* Sub-tabs */}
                <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
                  {(['teams', 'pools', 'pool-games', 'bracket'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${activeTab === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                      {tab === 'teams' ? `Teams (${teams.length})` : tab === 'pools' ? `Pools (${pools.length})` : tab === 'pool-games' ? `Pool Games (${poolGames.length})` : `Bracket`}
                    </button>
                  ))}
                </div>

                {/* -- TEAMS TAB -- */}
                {activeTab === 'teams' && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div>
                          <h2 className="font-bold text-slate-800">Teams ({teams.length})</h2>
                          <p className="text-xs text-slate-400 mt-0.5">{activeDiv}</p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-1">
                          <label className="relative cursor-pointer" title="Division color">
                            <span
                              className="block w-6 h-6 rounded-full border-2 border-white shadow ring-1 ring-slate-200 cursor-pointer"
                              style={{ backgroundColor: divColors[activeDiv] || PALETTE[divisions.findIndex(d => d.name === activeDiv) % PALETTE.length] }}
                            />
                            <input
                              type="color"
                              value={divColors[activeDiv] || PALETTE[divisions.findIndex(d => d.name === activeDiv) % PALETTE.length]}
                              onChange={e => saveDivColor(activeDiv, e.target.value)}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              title="Change division color"
                            />
                          </label>
                          <span className="text-[11px] text-slate-400 font-mono">{divColors[activeDiv] || PALETTE[divisions.findIndex(d => d.name === activeDiv) % PALETTE.length]}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setTeamForm({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '' }); setShowAddTeam(true) }}
                          className="text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          + Add Team
                        </button>
                        {swapA && swapB ? (
                          <button onClick={swapTeams} disabled={swapping}
                            className="btn-primary btn-sm disabled:opacity-50">
                            {swapping ? 'Swapping...' : <span className="inline-flex items-center gap-1.5"><ArrowLeftRight size={12} /> Swap {swapA} ↔ {swapB}</span>}
                          </button>
                        ) : swapA ? (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                            Now select the second team to swap with <strong>{swapA}</strong>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Click a team row to start a swap</span>
                        )}
                        {(swapA || swapB) && (
                          <button onClick={() => { setSwapA(null); setSwapB(null) }}
                            className="text-xs text-slate-400 hover:text-slate-600">x Cancel</button>
                        )}
                      </div>
                    </div>

                    {teams.length === 0 ? (
                      <div className="px-5 py-12 text-center text-slate-400 text-sm">
                        No teams registered in this division yet.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Team</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Club</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pool</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Coach</th>
                            <th className="px-3 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {teams.map((team, i) => {
                            const isSwapA = swapA === team.teamName
                            const isSwapB = swapB === team.teamName
                            return (
                              <tr key={team.id}
                                onClick={() => {
                                  if (isSwapA) { setSwapA(null); return }
                                  if (isSwapB) { setSwapB(null); return }
                                  if (!swapA) setSwapA(team.teamName)
                                  else setSwapB(team.teamName)
                                }}
                                className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${isSwapA || isSwapB ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50'}`}>
                                <td className="px-5 py-3 font-semibold text-slate-800">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {(isSwapA || isSwapB) && <ArrowLeftRight size={12} className="text-amber-500" />}
                                    {team.teamName}
                                    {team.status === 'placeholder' && (
                                      <span className="text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">Unconfirmed</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-slate-500 text-xs">{team.clubName}</td>
                                <td className="px-3 py-3">
                                  {pools.length > 0 ? (
                                    <select
                                      value={team.pool ?? ''}
                                      onChange={e => { e.stopPropagation(); assignTeamToPool(team.teamName, e.target.value || null) }}
                                      onClick={e => e.stopPropagation()}
                                      disabled={assigningTeam === team.teamName}
                                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-50">
                                      <option value="">-- No pool --</option>
                                      {pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                  ) : (
                                    <span className="text-xs text-slate-400">--</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">{payBadge(team.paymentStatus)}</td>
                                <td className="px-3 py-3 text-xs text-slate-500">
                                  <div>{team.coachName}</div>
                                  {team.coachPhone && <div className="text-slate-400">{team.coachPhone}</div>}
                                </td>
                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => { setEditingTeam(team); setTeamForm({ teamName: team.teamName, clubName: team.clubName, coachName: team.coachName, coachEmail: team.coachEmail, coachPhone: team.coachPhone }) }}
                                      className={`inline-flex items-center gap-1 text-[11px] border rounded px-1.5 py-0.5 transition-colors whitespace-nowrap ${team.status === 'placeholder' ? 'text-amber-600 hover:text-amber-800 border-amber-200 hover:border-amber-400' : 'text-slate-400 hover:text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                                      <Pencil size={11} /> Edit
                                    </button>
                                    <button
                                      onClick={() => { setMovingTeam(team); setMoveTarget('') }}
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-teal-600 border border-slate-200 hover:border-teal-300 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                                      Move <ArrowRight size={11} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Add Team modal ── */}
                {showAddTeam && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddTeam(false)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 w-96" onClick={e => e.stopPropagation()}>
                      <h3 className="font-bold text-slate-800 mb-1">Add Team</h3>
                      <p className="text-xs text-slate-500 mb-4">Only team name is required — all other details can be filled in later.</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Team Name <span className="text-red-500">*</span></label>
                          <input autoFocus value={teamForm.teamName} onChange={e => setTeamForm(f => ({ ...f, teamName: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addTeam()}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" autoComplete="organization" placeholder="e.g. Dynasty Elite 2026" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Club Name</label>
                          <input value={teamForm.clubName} onChange={e => setTeamForm(f => ({ ...f, clubName: e.target.value }))}
                            autoComplete="organization" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Optional" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Coach Name</label>
                            <input value={teamForm.coachName} onChange={e => setTeamForm(f => ({ ...f, coachName: e.target.value }))}
                              autoComplete="name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Optional" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Coach Phone</label>
                            <input value={teamForm.coachPhone} onChange={e => setTeamForm(f => ({ ...f, coachPhone: e.target.value }))}
                              autoComplete="tel" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Optional" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Coach Email</label>
                          <input value={teamForm.coachEmail} onChange={e => setTeamForm(f => ({ ...f, coachEmail: e.target.value }))}
                            autoComplete="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Optional" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-5">
                        <button onClick={() => setShowAddTeam(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
                        <button onClick={addTeam} disabled={!teamForm.teamName.trim() || savingTeam}
                          className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
                          {savingTeam ? 'Adding...' : 'Add Team'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Edit Team modal ── */}
                {editingTeam && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingTeam(null)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 w-96" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-800">Edit Team</h3>
                        {editingTeam?.status === 'placeholder' && (
                          <span className="text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">Unconfirmed</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mb-4">{editingTeam?.status === 'placeholder' ? 'Fill in the details and confirm when ready.' : 'Update team details.'}</p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Team Name <span className="text-red-500">*</span></label>
                          <input autoFocus value={teamForm.teamName} onChange={e => setTeamForm(f => ({ ...f, teamName: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Club Name</label>
                          <input value={teamForm.clubName} onChange={e => setTeamForm(f => ({ ...f, clubName: e.target.value }))}
                            autoComplete="organization" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Coach Name</label>
                            <input value={teamForm.coachName} onChange={e => setTeamForm(f => ({ ...f, coachName: e.target.value }))}
                              autoComplete="name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Coach Phone</label>
                            <input value={teamForm.coachPhone} onChange={e => setTeamForm(f => ({ ...f, coachPhone: e.target.value }))}
                              autoComplete="tel" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Coach Email</label>
                          <input value={teamForm.coachEmail} onChange={e => setTeamForm(f => ({ ...f, coachEmail: e.target.value }))}
                            autoComplete="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-5">
                        <button onClick={() => setEditingTeam(null)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
                        <div className="flex gap-2">
                          <button onClick={() => updateTeam(false)} disabled={savingTeam}
                            className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
                            {savingTeam ? 'Saving...' : 'Save'}
                          </button>
                          {editingTeam?.status === 'placeholder' && (
                            <button onClick={() => updateTeam(true)} disabled={savingTeam}
                              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
                              <Check size={14} /> Confirm team
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Generate confirm modal ── */}
                {generateConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setGenerateConfirm(null)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 w-96" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={22} className="text-amber-500" />
                        <h3 className="font-bold text-slate-800">Scheduled Games Will Be Replaced</h3>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">
                        <strong>{generateConfirm.scheduledCount} game{generateConfirm.scheduledCount !== 1 ? 's' : ''}</strong> {generateConfirm.scheduledCount !== 1 ? 'are' : 'is'} currently scheduled
                        {generateConfirm.div === 'ALL' ? ' across divisions' : ` in ${generateConfirm.div}`}.
                      </p>
                      <p className="text-sm text-slate-500 mb-5">
                        Regenerating will remove them from the scheduler grid. New games will appear in the parking lot.
                      </p>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setGenerateConfirm(null)}
                          className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
                        <button
                          onClick={async () => {
                            const { div, all } = generateConfirm
                            setGenerateConfirm(null)
                            if (all) {
                              setGeneratingAll(true)
                              // re-run all without the check
                              let totalGames = 0
                              for (const d of divisions) {
                                if (d.teamCount === 0) continue
                                const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(d.name)}/pool-games`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'generate', refCount: 2, gamesPerTeam: Number(divGamesPerTeam[d.name] ?? 3), clearExisting: true }),
                                })
                                const data = await res.json()
                                if (res.ok) totalGames += data.generated ?? 0
                              }
                              if (activeDiv) {
                                const [teamData, gameData] = await Promise.all([
                                  fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`).then(r => r.json()),
                                  fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`).then(r => r.json()),
                                ])
                                setTeams(teamData.teams ?? [])
                                setPools(teamData.pools ?? [])
                                setPoolGames(Array.isArray(gameData) ? gameData : [])
                              }
                              setGeneratingAll(false)
                              toast.success(`${totalGames} games generated · moved to parking lot`)
                            } else {
                              await doGenerateGames(div)
                            }
                          }}
                          className="text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors">
                          Yes, Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Move Team modal ── */}
                {movingTeam && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMovingTeam(null)}>
                    <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
                      <h3 className="font-bold text-slate-800 mb-1">Move Team</h3>
                      <p className="text-sm text-slate-500 mb-4">
                        Moving <strong>{movingTeam.teamName}</strong> from <strong>{activeDiv}</strong>
                      </p>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Destination Division</label>
                      <select
                        value={moveTarget}
                        onChange={e => setMoveTarget(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-4">
                        <option value="">— Select division —</option>
                        {divisions.filter(d => d.name !== activeDiv).map(d => (
                          <option key={d.name} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setMovingTeam(null)}
                          className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
                        <button
                          onClick={() => moveTarget && moveTeam(movingTeam, moveTarget)}
                          disabled={!moveTarget}
                          className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
                          Move Team
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* -- POOLS TAB -- */}
                {activeTab === 'pools' && (
                  <div className="space-y-4">
                    {/* Assign teams button */}
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-slate-400">{teams.filter(t => !t.pool).length > 0 ? `${teams.filter(t => !t.pool).length} teams unassigned` : 'All teams assigned'}</p>
                      <Link href={`/tournaments/${id}/divisions/${encodeURIComponent(activeDiv!)}/assign-pools`}
                        className="btn-primary btn-sm">
                        <span className="inline-flex items-center gap-1.5">Assign teams to pools <ArrowRight size={12} /></span>
                      </Link>
                      <Link href={`/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/bracket`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors mt-1">
                        Bracket
                      </Link>
                    </div>

                    {/* Add pool */}
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-3">
                      <input className="input flex-1 text-sm" placeholder="Pool name (e.g. Pool A, Pool 1)"
                        value={newPoolName} onChange={e => setNewPoolName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addPool()} />
                      <button onClick={addPool} disabled={!newPoolName.trim() || addingPool}
                        className="btn-primary btn-sm disabled:opacity-50">
                        {addingPool ? 'Adding...' : '+ Add Pool'}
                      </button>
                    </div>

                    {pools.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                        No pools yet. Add a pool above to get started.
                      </div>
                    ) : (
                      pools.map(pool => {
                        const poolTeams = teams.filter(t => t.pool === pool.name)
                        const unassigned = teams.filter(t => !t.pool)
                        return (
                          <div key={pool.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                              <h3 className="font-semibold text-slate-700">{pool.name}</h3>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{poolTeams.length} teams</span>
                                <button onClick={() => deletePool(pool.id)}
                                  className="text-xs text-red-400 hover:text-red-600">Delete</button>
                              </div>
                            </div>
                            {poolTeams.length === 0 ? (
                              <p className="px-5 py-4 text-sm text-slate-400">No teams assigned yet. Use the Teams tab to assign.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <tbody>
                                  {poolTeams.map((team, i) => (
                                    <tr key={team.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                      <td className="px-5 py-2.5 font-medium text-slate-800">{team.teamName}</td>
                                      <td className="px-3 py-2.5 text-xs text-slate-400">{team.clubName}</td>
                                      <td className="px-3 py-2.5">{payBadge(team.paymentStatus)}</td>
                                      <td className="px-3 py-2.5 text-right">
                                        <button onClick={() => assignTeamToPool(team.teamName, null)}
                                          className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {/* Quick-add unassigned teams */}
                            {unassigned.length > 0 && (
                              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-xs text-slate-400 mb-2">Add team to this pool:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {unassigned.map(t => (
                                    <button key={t.id} onClick={() => assignTeamToPool(t.teamName, pool.name)}
                                      className="text-xs bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 text-slate-600 hover:text-teal-700 px-2.5 py-1 rounded-lg transition-colors">
                                      + {t.teamName}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}

                    {/* Unassigned summary */}
                    {pools.length > 0 && teams.filter(t => !t.pool).length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                        <p className="text-sm font-medium text-amber-700">
                          {teams.filter(t => !t.pool).length} team{teams.filter(t => !t.pool).length !== 1 ? 's' : ''} not assigned to a pool
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {teams.filter(t => !t.pool).map(t => t.teamName).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* -- POOL GAMES TAB -- */}
                {activeTab === 'pool-games' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Date (optional)</label>
                          <input type="date" className="input text-sm" value={genDate} onChange={e => setGenDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Refs per game</label>
                          <select className="input text-sm" value={genRefCount} onChange={e => setGenRefCount(e.target.value)}>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Games per team</label>
                          <input type="number" min="1" max="10" className="input text-sm w-20" value={activeDiv ? (divGamesPerTeam[activeDiv] ?? '2') : '2'} onChange={e => activeDiv && setDivGamesPerTeam(prev => ({ ...prev, [activeDiv]: e.target.value }))} />
                        </div>
                        <button onClick={generateGames} disabled={generating || pools.length === 0}
                          className="btn-primary btn-sm disabled:opacity-50">
                          {generating ? 'Generating...' : <span className="inline-flex items-center gap-1.5"><Zap size={13} /> Generate games</span>}
                        </button>
                        {poolGames.length > 0 && (
                          <>
                            <button onClick={renumberGames} disabled={renumbering}
                              className="btn-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              {renumbering ? 'Renumbering...' : '# Renumber'}
                            </button>
                            {showClearConfirm ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-600">Delete all games?</span>
                                <button onClick={clearGames} className="text-xs text-red-600 font-semibold hover:underline">Yes, clear</button>
                                <button onClick={() => setShowClearConfirm(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setShowClearConfirm(true)} className="text-xs text-red-400 hover:text-red-600">Clear all</button>
                            )}
                          </>
                        )}
                      </div>
                      {pools.length === 0 && (
                        <p className="mt-3 text-xs text-amber-600">No pools yet -- create pools and assign teams first.</p>
                      )}
                    </div>
                    {poolGames.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                        No pool games yet. Add pools with teams, then click Generate Games.
                      </div>
                    ) : (
                      (() => {
                        const byPool = poolGames.reduce((acc: Record<string, PoolGame[]>, g) => {
                          const key = g.pool ?? 'Unassigned'
                          if (!acc[key]) acc[key] = []
                          acc[key].push(g)
                          return acc
                        }, {} as Record<string, PoolGame[]>)
                        return Object.entries(byPool).map(([poolName, games]) => (
                          <div key={poolName} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                              <h3 className="font-semibold text-slate-700">{poolName}</h3>
                              <span className="text-xs text-slate-400">{games.length} game{games.length !== 1 ? 's' : ''}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                  <th className="text-left px-5 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Home</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Away</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {games.map((g, i) => (
                                  <tr key={g.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{g.gameNumber}</td>
                                    <td className="px-3 py-2.5 font-medium text-slate-800">{g.team1}</td>
                                    <td className="px-3 py-2.5 text-slate-600">{g.team2}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.date || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.startTime || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.location || '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))
                      })()
                    )}
                  </div>
                )}
              {activeTab === 'bracket' && activeDiv && (
                (() => {
                  const tc = divisions.find(d => d.name === activeDiv)?.teamCount ?? teams.length
                  const planB = smartTable[tc]?.bracket || ''
                  const fmt = planB === 'double' ? 'double' : planB === '2gg' ? '2gg' : (planB === 'single' || planB === 'single-con') ? 'single' : undefined
                  const sizes = fmt === 'double' ? [4, 8] : [4, 8, 16]
                  const cnt = fmt ? String(sizes.filter(z => z <= tc).pop() ?? sizes[0]) : undefined
                  return <BracketBuilder key={activeDiv} tournamentId={id} division={activeDiv} planFormat={fmt as 'single' | 'double' | '2gg' | undefined} planCount={cnt} planConsolation={planB === 'single-con' ? '1' : undefined} />
                })()
              )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
