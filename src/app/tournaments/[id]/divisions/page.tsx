'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import ShortTeamsBanner from '@/components/ShortTeamsBanner'
import { findShortTeams, describeFinding, type BalanceGame } from '@/lib/gameBalance'
import { poolKey } from '@/lib/poolNames'
import BracketBuilder from './BracketBuilder'
import GalleryPicker from '@/components/GalleryPicker'
import { PublicVisibilityCard } from '../PublicVisibility'
import { ArrowRight, Check, X, AlertTriangle, Pencil, Sparkles, Zap, ArrowLeftRight, GripVertical, Trash2, Calendar, Plus } from 'lucide-react'

const PALETTE = [
  '#3b82f6', '#10b981', '#a855f7', '#f97316', '#ec4899',
  '#14b8a6', '#ef4444', '#f59e0b', '#6366f1', '#06b6d4',
]

interface Division { name: string; teamCount: number; poolCount: number; unassignedTeams: number; gameCount: number; bracketGameCount?: number }
interface Pool { id: string; name: string; teamNames: string[] }
interface PoolGame {
  id: string; gameNumber: string; pool: string | null
  team1: string; team2: string; date: string; startTime: string; location: string
}

interface Team {
  id: string; teamName: string; clubName: string; division: string
  coachName: string; coachPhone: string; coachEmail: string; logoUrl: string
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
  const [groupByPool, setGroupByPool] = useState(false)
  const [poolDragging, setPoolDragging] = useState<string | null>(null)
  const [poolDragOver, setPoolDragOver] = useState<string | null>(null)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDiv, setLoadingDiv] = useState(false)
  const [divColors, setDivColors] = useState<Record<string, string>>({})
  const [poolGames, setPoolGames] = useState<PoolGame[]>([])
  const [teamFilter, setTeamFilter] = useState('')
  // Manual add. Open for one pool at a time; the pool is implied by which card's
  // button you pressed, so there is no pool picker to get wrong.
  const [addGamePool, setAddGamePool] = useState('')
  const [addHome, setAddHome] = useState('')
  const [addAway, setAddAway] = useState('')
  const [addingGame, setAddingGame] = useState(false)
  const [editGame, setEditGame] = useState<{ id: string; home: string; away: string } | null>(null)
  const [deleteGameId, setDeleteGameId] = useState('')
  const [savingRow, setSavingRow] = useState(false)

  // Every division's games, for the page-level uneven-pool warning.
  //
  // The rest of this page works one division at a time -- selectDiv fetches that
  // division's pool games -- so a tournament-wide view needs a read of its own.
  //
  // Re-read whenever poolGames changes. That is the signal that a schedule was
  // generated, cleared, or a different division was opened, and it catches every
  // one of those paths without six separate call sites having to remember. The
  // cost is one small request per division click.
  const [allGames, setAllGames] = useState<BalanceGame[]>([])
  // Which divisions have a short pool, and what to say about each. Keyed by
  // division so the rail can answer per row without walking the findings again,
  // and a division with two uneven pools collects both lines in one tooltip.
  // Every team in this division's pool games, with how many it plays. Counted from
  // the games rather than from the pool roster, so the number is what is actually
  // scheduled -- which is the thing being verified.
  const teamGameCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of poolGames) {
      for (const name of [g.team1, g.team2]) {
        const t = String(name || '').trim()
        if (t) m.set(t, (m.get(t) || 0) + 1)
      }
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [poolGames])

  // Regenerating games can redraw the pairings, and a team picked before that is
  // not guaranteed to still appear. Reading the filter through the live list means
  // a stale name falls back to "all teams" instead of dimming every row with no
  // way to tell why.
  const activeTeam = teamFilter && teamGameCounts.some(([n]) => n === teamFilter) ? teamFilter : ''

  /** Clicking a team name filters to it; clicking the same one again clears. A
   *  different name switches rather than clears, which is what you want when the
   *  row you are reading is the one you want to look at next. */
  /** The teams eligible for a game in this pool. Matched on poolKey because the
   *  scheduler writes "Pool A" onto a game while staff may have named the pool "A"
   *  -- see lib/poolNames. Falls back to the whole division for an unpooled group. */
  const poolTeamsFor = (poolName: string) => {
    const p = pools.find(x => poolKey(x.name) === poolKey(poolName))
    const names = p?.teamNames?.length ? p.teamNames : teams.map(t => t.teamName)
    return [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  }

  async function saveGameEdit() {
    const e = editGame
    if (!e || !e.home || !e.away || e.home === e.away || savingRow) return
    setSavingRow(true)
    const res = await fetch(`/api/games/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team1: e.home, team2: e.away }),
    })
    setSavingRow(false)
    if (!res.ok) { toast.error('Could not change the matchup'); return }
    // Patched in place rather than refetched: the row is already on screen and a
    // reload would lose the scroll position in a long pool.
    setPoolGames(gs => gs.map(g => (g.id === e.id ? { ...g, team1: e.home, team2: e.away } : g)))
    setEditGame(null)
    toast.success('Matchup changed')
  }

  async function removeGame(gameId: string) {
    if (savingRow) return
    setSavingRow(true)
    const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
    setSavingRow(false)
    if (!res.ok) { toast.error('Could not delete the game'); return }
    setPoolGames(gs => gs.filter(g => g.id !== gameId))
    setDeleteGameId('')
    toast.success('Game deleted')
  }

  async function addGame(poolName: string) {
    if (!activeDiv || !addHome || !addAway || addHome === addAway || addingGame) return
    setAddingGame(true)
    // Continue this division's P-numbering from its highest, rather than from the
    // count: a deleted game would make a count collide with a number already used.
    const next = poolGames.reduce((max, g) => {
      const n = parseInt(String(g.gameNumber || '').replace(/^\D+/, ''), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0) + 1
    const base = `/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`
    const res = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add', gameNumber: `P${next}`, team1: addHome, team2: addAway,
        pool: poolName, date: '', startTime: '', location: '', refCount: 2,
      }),
    })
    setAddingGame(false)
    if (!res.ok) { toast.error('Could not add the game'); return }
    // Re-read rather than push the new row in: this also refreshes the uneven-pool
    // check, which is usually the reason a game is being added by hand.
    const gameData = await fetch(base).then(r => r.json()).catch(() => null)
    if (Array.isArray(gameData)) setPoolGames(gameData)
    setAddGamePool(''); setAddHome(''); setAddAway('')
    toast.success(`Added ${addHome} vs ${addAway}`)
  }

  const toggleTeamFilter = (name: string) => {
    const t = String(name || '').trim()
    if (!t) return
    setTeamFilter(prev => (prev === t ? '' : t))
  }

  const unevenByDivision = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const f of findShortTeams(allGames)) {
      const lines = m.get(f.division) ?? []
      lines.push(describeFinding(f))
      m.set(f.division, lines)
    }
    return m
  }, [allGames])
  useEffect(() => {
    fetch(`/api/tournaments/${id}/games`)
      .then(r => r.json())
      .then(g => setAllGames(Array.isArray(g) ? g : []))
      .catch(() => { /* the warning just stays hidden rather than breaking the page */ })
  }, [id, poolGames])
  const [bracketGames, setBracketGames] = useState<PoolGame[]>([])

  // Pool games state
  const [generating, setGenerating] = useState(false)
  const [gamesPerTeam, setGamesPerTeam] = useState('2')
  const [renumbering, setRenumbering] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [divGamesPerTeam, setDivGamesPerTeam] = useState<Record<string, string>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [includeBrackets, setIncludeBrackets] = useState(true)
  const [guarantee, setGuarantee] = useState('4')
  const [smartTable, setSmartTable] = useState<Record<number, { games?: number; pools?: number; bracket?: string; advance?: number; consolation?: number }>>({})
  const [showSmartEditor, setShowSmartEditor] = useState(false)
  const [smartMax, setSmartMax] = useState(16)
  const [saveGlobal, setSaveGlobal] = useState(false)
  useEffect(() => {
    try { const raw = localStorage.getItem('smartDefaults:' + id); if (raw) { setSmartTable(JSON.parse(raw)); return } } catch {}
    fetch('/api/smart-defaults-default').then(r => r.ok ? r.json() : null).then(d => { if (d && d.table && Object.keys(d.table).length) { setSmartTable(d.table); if (d.guarantee) setGuarantee(String(d.guarantee)) } }).catch(() => {})
  }, [id])

  // Scheduled games warning state
  const [generateConfirm, setGenerateConfirm] = useState<{div: string; scheduledCount: number; all: boolean} | null>(null)

  // Add / Edit team state
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamForm, setTeamForm] = useState({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '', logoUrl: '' })
  const [teamLogoUploading, setTeamLogoUploading] = useState(false)
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
  const [renamingPool, setRenamingPool] = useState<{ id: string; value: string } | null>(null)
  const [savingRename, setSavingRename] = useState(false)
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/division-colors`).then(r => r.json()),
    ]).then(([t, d, colors]) => {
      setDivColors(colors)
      setTournament(t)
      setDivisions(d.map((div: Division) => ({ unassignedTeams: 0, gameCount: 0, bracketGameCount: 0, ...div })))
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

  // Keep the sidebar's "N unassigned" badge in step with the board. It was only
  // computed at page load, so it kept warning after every team had a pool.
  useEffect(() => {
    if (!activeDiv || loadingDiv) return
    const unassigned = teams.filter(t => !t.pool).length
    setDivisions(d => d.map(x => x.name === activeDiv && x.unassignedTeams !== unassigned ? { ...x, unassignedTeams: unassigned } : x))
  }, [teams, activeDiv, loadingDiv])

  async function loadPoolGames(div: string) {
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`)
    const data = await res.json()
    setPoolGames(Array.isArray(data) ? data : [])
  }

  async function loadBracketGames(div: string) {
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games?scope=bracket`)
    const data = await res.json()
    setBracketGames(Array.isArray(data)
      ? [...data].sort((a, b) => (parseInt(a.gameNumber.slice(1)) || 0) - (parseInt(b.gameNumber.slice(1)) || 0))
      : [])
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
    setTeamForm({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '', logoUrl: '' })
    setShowAddTeam(false)
    setSavingTeam(false)
    toast.success(`${data.teamName} added as placeholder`)
  }

  const compressImage = (file: File, maxDim = 512): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim }
            else { width = Math.round((width * maxDim) / height); height = maxDim }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) { reject(new Error('Canvas not supported')); return }
          ctx.drawImage(img, 0, 0, width, height)
          let url = canvas.toDataURL('image/png')
          if (url.length > 200000) url = canvas.toDataURL('image/jpeg', 0.85)
          resolve(url)
        }
        img.onerror = () => reject(new Error('Could not read image'))
        img.src = reader.result as string
      }
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsDataURL(file)
    })

  async function pickTeamLogo(file: File) {
    setTeamLogoUploading(true)
    try { const url = await compressImage(file); setTeamForm(fm => ({ ...fm, logoUrl: url })) }
    catch { toast.error('Logo upload failed') }
    finally { setTeamLogoUploading(false) }
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
      logoUrl: teamForm.logoUrl,
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

  async function deleteTeam(team: Team) {
    if (!activeDiv) return
    // Say what it costs BEFORE the click, not after. A pool game is a pairing,
    // so deleting this team's games takes one off each opponent as well -- the
    // thing an organizer discovers on game day if nobody tells them now.
    const theirs = [...poolGames, ...bracketGames].filter(g => g.team1 === team.teamName || g.team2 === team.teamName)
    const gameLine = theirs.length
      ? `\n\nThis also deletes ${theirs.length} scheduled game${theirs.length === 1 ? '' : 's'}. Each opponent loses that game too, so rebuild the pool games afterwards.`
      : ''
    if (!confirm(`Delete "${team.teamName}" from ${activeDiv}? This also removes it from registrations.${gameLine}`)) return
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to delete team'); return }
    const data: any = await res.json().catch(() => ({}))
    setTeams(t => t.filter(x => x.id !== team.id))
    setPools(ps => ps.map(p => ({ ...p, teamNames: p.teamNames.filter(n => n !== team.teamName) })))
    setDivisions(d => d.map(x => x.name === activeDiv ? { ...x, teamCount: Math.max(0, x.teamCount - 1) } : x))
    // Mirror what the server did: its games are gone, its bracket slots blanked.
    setPoolGames(gs => gs.filter(g => g.team1 !== team.teamName && g.team2 !== team.teamName))
    setBracketGames(gs => gs.map(g => ({
      ...g,
      team1: g.team1 === team.teamName ? '' : g.team1,
      team2: g.team2 === team.teamName ? '' : g.team2,
    })))
    const gone = Number(data?.removed?.games) || 0
    toast.success(gone
      ? `${team.teamName} deleted — ${gone} game${gone === 1 ? '' : 's'} removed from the schedule`
      : `${team.teamName} deleted`)
  }

  const selectDiv = useCallback((div: string) => {
    setActiveDiv(div)
    setLoadingDiv(true)
    setTeamFilter('')   // a name from the previous division would filter this one to nothing
    setSwapA(null); setSwapB(null)
    Promise.all([
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/teams`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`).then(r => r.json()),
    ]).then(([teamData, gameData]) => {
      setTeams(teamData.teams ?? [])
      setPools(teamData.pools ?? [])
      setPoolGames(Array.isArray(gameData) ? gameData : [])
      loadBracketGames(div)
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

  // Rename a pool in place. Bo, Sep 30 2026: "Sometimes we want to call them
  // north, south." The route moves the games; this moves what is on screen,
  // including teams[].pool, which holds the pool NAME rather than its id.
  async function renamePool() {
    const edit = renamingPool
    if (!edit || !activeDiv || savingRename) return
    const name = edit.value.replace(/\s+/g, ' ').trim()
    const old = pools.find(p => p.id === edit.id)?.name ?? ''
    if (!name || name === old) { setRenamingPool(null); return }
    setSavingRename(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId: edit.id, name }),
    })
    const data = await res.json().catch(() => ({} as { name?: string; games?: number; error?: string }))
    setSavingRename(false)
    if (!res.ok) { toast.error(data.error ?? 'Could not rename the pool'); return }
    const saved = data.name ?? name
    setPools(p => p.map(x => (x.id === edit.id ? { ...x, name: saved } : x)))
    setTeams(t => t.map(x => (x.pool === old ? { ...x, pool: saved } : x)))
    setRenamingPool(null)
    toast.success(data.games
      ? `Renamed to ${saved} \u00b7 ${data.games} game${data.games === 1 ? '' : 's'} updated`
      : `Renamed to ${saved}`)
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

  async function autoAssignPools() {
    if (!activeDiv || pools.length === 0) return
    setAutoAssigning(true)
    const all = [...teams.map(t => t.teamName)].sort(() => Math.random() - 0.5)
    const newPools = pools.map(p => ({ ...p, teamNames: [] as string[] }))
    all.forEach((name, i) => newPools[i % newPools.length].teamNames.push(name))
    await Promise.all(newPools.map(p =>
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: p.id, teamNames: p.teamNames }),
      })
    ))
    setPools(newPools)
    setTeams(ts => ts.map(t => {
      const np = newPools.find(p => p.teamNames.includes(t.teamName))
      return { ...t, pool: np ? np.name : null }
    }))
    setAutoAssigning(false)
    toast.success('Teams auto-assigned to pools')
  }

  async function swapTeams() {
    if (!swapA || !swapB || !activeDiv) return
    const teamA = teams.find(t => t.teamName === swapA)
    const teamB = teams.find(t => t.teamName === swapB)
    if (!teamA || !teamB) return
    setSwapping(true)
    // Both moves must come from one snapshot of pools. Two separate
    // assignTeamToPool calls each PATCH every pool from the same stale state,
    // so whichever lands last undoes half the swap.
    const a = swapA, b = swapB
    const poolA = teamA.pool ?? null, poolB = teamB.pool ?? null
    const newPools = pools.map(p => {
      const names = p.teamNames.filter(n => n !== a && n !== b)
      if (poolB && p.name === poolB) names.push(a)
      if (poolA && p.name === poolA) names.push(b)
      return { ...p, teamNames: names }
    })
    const changed = newPools.filter((p, i) => p.teamNames.join('\u0000') !== pools[i].teamNames.join('\u0000'))
    await Promise.all(changed.map(p =>
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: p.id, teamNames: p.teamNames }),
      })
    ))
    setPools(newPools)
    setTeams(ts => ts.map(t => t.teamName === a ? { ...t, pool: poolB } : t.teamName === b ? { ...t, pool: poolA } : t))
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
      body: JSON.stringify({ action: 'generate', refCount: 2, gamesPerTeam: Number(divGamesPerTeam[div] ?? '2'), clearExisting: true }),
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

  // Recommended championship size + consolation games per team count (Bo verifies/overrides).
  function defaultBracketPlan(n: number, poolGames: number, g: number): { advance: number; consolation: number } {
    const owes = g - poolGames
    if (owes >= 2) return { advance: n, consolation: 0 }  // everyone in; loser-fed fills the guarantee
    let adv: number
    if (n <= 4) adv = n
    else if (n <= 7) adv = 4
    else if (n === 8) adv = 8
    else if (n <= 13) adv = 6
    else if (n === 16) adv = 16
    else adv = 8
    return { advance: adv, consolation: Math.max(0, Math.floor((n - adv) / 2)) }
  }

  function saveSmartTable() {
    const g = Number(guarantee) || 4
    const maxN = Math.max(smartMax, ...divisions.map(d => d.teamCount), 2)
    const filled: typeof smartTable = { ...smartTable }
    for (let n = 2; n <= maxN; n++) {
      const row = filled[n] || {}
      const games = row.games ?? smartPoolGames(n, g)
      const def = defaultBracketPlan(n, games, g)
      filled[n] = { games, pools: row.pools ?? 1, bracket: row.bracket ?? 'single', advance: row.advance ?? def.advance, consolation: row.consolation ?? def.consolation }
    }
    setSmartTable(filled)
    try { localStorage.setItem('smartDefaults:' + id, JSON.stringify(filled)) } catch {}
    if (saveGlobal) {
      fetch('/api/smart-defaults-default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: filled, guarantee: g }) }).then(r => { if (r.ok) toast.success('Saved as global default for new tournaments') }).catch(() => {})
    }
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

  // Generate a division's bracket structure (placeholder seeds) from its Smart Defaults plan.
  // Returns true if created. Skips when no bracket is planned or one already exists.
  /**
   * Returns WHY, not just whether. Four different outcomes used to come back as a
   * bare false, so "no brackets" and "every division already had one" read the same
   * on screen -- which is how eleven of fourteen divisions ended up with no bracket
   * and nothing said about it.
   */
  async function generateBracketForDivision(divName: string, teamCount: number): Promise<'created' | 'rebuilt' | 'exists' | 'stale' | 'too-small' | 'failed'> {
    const tc = teamCount
    if (tc < 2) return 'too-small'
    const sd = smartTable[tc] || {}
    // THE BUG. The format had no fallback, while advance and consolation below both
    // fall back to defaultBracketPlan. smartTable is keyed by exact team count and
    // lives in THIS browser's localStorage, so until someone opens the Smart
    // Defaults editor and saves it, there is no row for any team count -- and every
    // division was skipped, silently. Single elimination is the right default for a
    // pool-play tournament; the editor still overrides it per team count.
    const planFmt = sd.bracket || 'single'
    const api = `/api/tournaments/${id}/divisions/${encodeURIComponent(divName)}/bracket`
    const raw = await fetch(api).then(r => r.ok ? r.json() : null).catch(() => null)
    const flights: { id?: string; teamCount?: number; format?: string; seeds?: Record<string, string> }[] =
      Array.isArray(raw) ? raw : (raw && raw.id ? [raw] : [])
    const g = Number(guarantee) || 4
    const poolG = Number(divGamesPerTeam[divName] ?? sd.games ?? smartPoolGames(tc, g)) || 2
    const owes2 = (g - poolG) >= 2 || planFmt === '2gg'
    const def = defaultBracketPlan(tc, poolG, g)
    const fmt = planFmt === 'double' ? 'double' : planFmt === '2gg' ? '2gg' : 'single'
    const advance = owes2 ? tc : (sd.advance ?? def.advance)
    const consolationCount = owes2 ? 0 : (sd.consolation ?? def.consolation)
    const wantCount = Math.max(2, advance)

    // A bracket is sized when it is built, and teams keep registering after that.
    // Skipping every division that already had one is how a division that had two
    // teams in March keeps a two-seed, one-game bracket after it fills to eight.
    // So compare what is there against the plan, and only leave it alone when it
    // still fits.
    let rebuilt = false
    if (flights.length) {
      const b = flights[0]
      const bg = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(divName)}/pool-games?scope=bracket`)
        .then(r => r.ok ? r.json() : []).catch(() => [])
      const bGames: { startTime?: string; date?: string; location?: string }[] = Array.isArray(bg) ? bg : []
      // Two ways an existing bracket is wrong: it was sized for a division that has
      // since grown, or its schedulable B-games were wiped out from under it and the
      // Bracket row is all that's left (which is what the old clearExisting did).
      const sized = flights.length === 1 && b.teamCount === wantCount && b.format === fmt
      if (sized && bGames.length > 0) return 'exists'
      // Rebuilding wipes the division's brackets. Hand-entered seeds, a deliberate
      // flight split, and B-games the Scheduler has already given times to are work
      // that isn't ours to throw away -- call it stale and let Bo decide.
      if (flights.length > 1) return 'stale'
      if (Object.keys(b.seeds || {}).length > 0) return 'stale'
      if (bGames.some(x => x.startTime || x.date || x.location)) return 'stale'
      const del = await fetch(api, { method: 'DELETE' })
      if (!del.ok) return 'failed'
      rebuilt = true
    }
    const bRes = await fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: fmt, teamCount: wantCount, consolationCount, loserConsolation: owes2, seeds: {} }),
    })
    if (!bRes.ok) return 'failed'
    return rebuilt ? 'rebuilt' : 'created'
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
    let bracketsCreated = 0
    let autoPooled = 0
    let bracketsKept = 0
    let bracketsFailed = 0
    let bracketsRebuilt = 0
    const staleDivs: string[] = []

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

      // Generate the bracket structure from this division's Smart Defaults plan
      if (includeBrackets) {
        const r = await generateBracketForDivision(div.name, div.teamCount)
        if (r === 'created') bracketsCreated++
        else if (r === 'rebuilt') bracketsRebuilt++
        else if (r === 'exists') bracketsKept++
        else if (r === 'stale') staleDivs.push(div.name)
        else if (r === 'failed') bracketsFailed++
      }
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
      loadBracketGames(activeDiv)
    }

    setGeneratingAll(false)
    const poolMsg = autoPooled > 0 ? ` (auto-created pools for ${autoPooled} divisions)` : ''
    const bits = [
      bracketsCreated ? `${bracketsCreated} bracket${bracketsCreated !== 1 ? 's' : ''} created` : '',
      bracketsRebuilt ? `${bracketsRebuilt} resized` : '',
      bracketsKept ? `${bracketsKept} already fit` : '',
    ].filter(Boolean)
    toast.success(`${totalGames} pool games generated${poolMsg}${bits.length ? `, ${bits.join(', ')}` : ''}`)
    // A bracket that no longer fits its division but holds seeds, a flight split or
    // scheduled times is not something to silently overwrite -- or to silently leave
    // wrong. Name the divisions so Bo can reset the ones he wants.
    if (staleDivs.length) toast(`${staleDivs.length} bracket${staleDivs.length !== 1 ? 's no' : ' no'} longer fit${staleDivs.length !== 1 ? '' : 's'} the division: ${staleDivs.join(', ')} — open the Bracket tab and Reset to rebuild`, { duration: 9000, icon: '\u26A0\uFE0F' })
    // Said separately and in red: a bracket that failed to build is not a detail to
    // tuck into a success message.
    if (bracketsFailed) toast.error(`${bracketsFailed} bracket${bracketsFailed !== 1 ? 's' : ''} could not be built — open the Bracket tab for those divisions`)
  }

  async function renumberGames() {
    if (!activeDiv) return
    setRenumbering(true)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renumber' }),
    })
    await Promise.all([loadPoolGames(activeDiv), loadBracketGames(activeDiv)])
    setRenumbering(false)
    toast.success('Games renumbered')
  }

  async function clearGames() {
    if (!activeDiv) return
    setShowClearConfirm(false)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, { method: 'DELETE' })
    setPoolGames([])
    setBracketGames([])
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
          {/* BELOW THE APP NAV, NOT OVER IT. NavBar is `sticky top-0 z-40`; this rail
              was also z-40, and being later in the DOM it won the tie and painted
              across the bar as soon as you scrolled (Bo, Sep 29 2026). z-30 keeps it
              above the page and under the chrome. The offset is measured, not
              guessed: the bar renders 53px tall on whistleready.app, so top-20 (80px)
              leaves the same ~24px of air the old top-6 gave from the viewport. It is
              a few pixels tight while the amber "previewing as" banner is up, which
              makes the chrome taller. Tournament pages on a club's own domain hide
              the bar entirely (see the layout), and nothing here depends on that. */}
          <div className="w-80 flex-shrink-0 sticky top-20 self-start z-30">
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
                              {/* Beside the NAME, not down with the count pills: the
                                  point is to be findable while scanning the rail, which
                                  is the one view that shows every division at once.
                                  Wrapped in a span because a title on the svg itself is
                                  not a tooltip. */}
                              {unevenByDivision.has(div.name) && (
                                <span className="flex-shrink-0 inline-flex" title={`Uneven pool — ${unevenByDivision.get(div.name)!.join('  ')}`}>
                                  <AlertTriangle size={13} className="text-amber-500" />
                                </span>
                              )}
                            </div>
                            <div className="pl-5 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">{div.teamCount} team{div.teamCount !== 1 ? 's' : ''} · {div.poolCount} pool{div.poolCount !== 1 ? 's' : ''}</span>
                              {div.gameCount > 0 && (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full" title="Pool games">{div.gameCount} pool</span>
                              )}
                              {(div.bracketGameCount ?? 0) > 0 && (
                                <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full" title="Bracket games">{div.bracketGameCount} bracket</span>
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
              <label className="flex items-center justify-center gap-2 text-[11px] text-slate-600 mb-2 cursor-pointer">
                <input type="checkbox" checked={includeBrackets} onChange={e => setIncludeBrackets(e.target.checked)} className="accent-teal-600" />
                Include brackets
              </label>
              <button
                onClick={generateAllDivisions}
                disabled={generatingAll}
                className="w-full flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors"
              >
        {generatingAll ? 'Generating...' : <><Zap size={13} /> Generate all divisions</>}
              </button>
              <p className="text-[10px] text-slate-400 text-center leading-tight">{includeBrackets ? 'Pools, pool games & brackets' : 'Pool games only'} · auto-creates Pool A if needed{includeBrackets ? ' · resizes brackets that no longer fit' : ''}</p>
            </div>
            <Link href={`/tournaments/${id}/scheduler`} className="mt-3 flex items-center justify-between gap-2 bg-white border border-slate-200 hover:border-teal-300 rounded-xl px-4 py-3 transition-colors group">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Calendar size={15} className="text-teal-600" /> Game Scheduler</span>
                <span className="block text-[11px] text-slate-400 mt-0.5 pl-6">Drag &amp; drop games onto fields</span>
              </span>
              <ArrowRight size={15} className="text-slate-300 group-hover:text-teal-500 flex-shrink-0" />
            </Link>
            <PublicVisibilityCard tournamentId={id as string} />
            {showSmartEditor && (() => {
              const maxN = Math.max(smartMax, ...divisions.map(d => d.teamCount), 2)
              const counts: number[] = []; for (let n = 2; n <= maxN; n++) counts.push(n)
              const g = Number(guarantee) || 4
              const BRACKETS = [{ v: '', l: 'None' }, { v: 'single', l: 'Single elim' }, { v: 'single-con', l: 'Single elim + 3rd' }, { v: 'double', l: 'Double elim' }, { v: '2gg', l: 'Both-ways consolation' }]
              const setField = (n: number, k: 'games' | 'pools' | 'bracket' | 'advance' | 'consolation', val: number | string | undefined) => setSmartTable(prev => ({ ...prev, [n]: { ...prev[n], [k]: val } }))
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSmartEditor(false)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles size={15} className="text-teal-500" /> Smart defaults</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Your preferred setup for a division by how many teams it has. Smart defaults applies games/team; pools, bracket, bracket size (Adv) and consolation are saved as your plan.</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 flex-wrap"><span>Show team counts up to</span><input type="number" min="2" value={smartMax} onChange={e => setSmartMax(Math.max(2, Number(e.target.value) || 2))} className="w-16 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" /><span>teams</span><span className="text-slate-300">·</span><span>Game guarantee</span><input type="number" min="1" max="20" value={guarantee} onChange={e => setGuarantee(e.target.value)} className="w-16 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" /><span>games/team</span></div>
                    </div>
                    <div className="px-5 py-2 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wide">
                          <th className="text-left font-semibold py-1">Teams</th>
                          <th className="font-semibold py-1">Games/team</th>
                          <th className="font-semibold py-1">Pools</th>
                          <th className="text-left font-semibold py-1 pl-3">Bracket</th>
                          <th className="font-semibold py-1">Adv</th>
                          <th className="font-semibold py-1">Consol.</th>
                        </tr></thead>
                        <tbody>
                          {counts.map(n => {
                            const row = smartTable[n] || {}
                            const games = row.games ?? smartPoolGames(n, g)
                            const pools = row.pools ?? 1
                            const def = defaultBracketPlan(n, games, g)
                            const bracket = row.bracket ?? 'single'
                            const advance = row.advance ?? def.advance
                            const consolation = row.consolation ?? def.consolation
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
                                <td className="py-1 text-center">
                                  <input type="number" min="2" max={n} value={advance}
                                    onChange={e => setField(n, 'advance', e.target.value === '' ? undefined : Math.max(2, Math.min(Number(e.target.value) || 2, n)))}
                                    className="w-12 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                                </td>
                                <td className="py-1 text-center">
                                  <input type="number" min="0" value={consolation}
                                    onChange={e => setField(n, 'consolation', e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0))}
                                    className="w-12 border border-slate-200 rounded text-center py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button onClick={() => setSmartTable(prev => { const t = { ...prev }; counts.forEach(n => { t[n] = { ...t[n], games: smartPoolGames(n, g) } }); return t })} className="text-xs text-slate-500 hover:text-slate-700">Reset games from guarantee ({g})</button>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" title="Save this plan as the default for new tournaments">
                          <input type="checkbox" checked={saveGlobal} onChange={e => setSaveGlobal(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-400" />
                          Save as global default
                        </label>
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
                  {(['teams', 'pool-games', 'bracket'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${activeTab === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                      {tab === 'teams' ? `Teams & Pools (${teams.length})` : tab === 'pool-games' ? `Games (${poolGames.length + bracketGames.length})` : `Bracket`}
                    </button>
                  ))}
                </div>

                {/* -- TEAMS TAB -- */}
                {activeTab === 'teams' && (
                  <div className="space-y-4">
                    {/* ── Pools bar (manage pools inline) ── */}
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-1">Pools</span>
                      {pools.map(pool => (
                        <span key={pool.id} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-200 rounded-full pl-2.5 pr-1 py-1">
                          {renamingPool?.id === pool.id ? (
                            <input autoFocus value={renamingPool.value}
                              onChange={e => setRenamingPool({ id: pool.id, value: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') renamePool(); if (e.key === 'Escape') setRenamingPool(null) }}
                              onBlur={renamePool}
                              className="w-24 bg-white border border-teal-300 rounded px-1.5 py-0.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                          ) : (
                            <button onClick={() => setRenamingPool({ id: pool.id, value: pool.name })}
                              title="Rename pool"
                              className="font-medium text-slate-700 hover:text-teal-700 transition-colors">{pool.name}</button>
                          )}
                          <span className="text-slate-400">· {teams.filter(t => t.pool === pool.name).length}</span>
                          <button onClick={() => deletePool(pool.id)} title="Delete pool"
                            className="text-slate-300 hover:text-red-500 rounded-full p-0.5 transition-colors"><X size={11} /></button>
                        </span>
                      ))}
                      <div className="inline-flex items-center gap-1">
                        <input className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          placeholder="Add pool…" value={newPoolName} onChange={e => setNewPoolName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addPool()} />
                        <button onClick={addPool} disabled={!newPoolName.trim() || addingPool}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-40 px-1.5 py-1">
                          {addingPool ? '…' : '+ Add'}
                        </button>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {teams.filter(t => !t.pool).length > 0 && (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{teams.filter(t => !t.pool).length} unassigned</span>
                        )}
                        {pools.length > 0 && (groupByPool ? (
                          <button onClick={() => setGroupByPool(false)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg border bg-white border-slate-200 text-slate-500 hover:text-slate-700 transition-colors">
                            List view
                          </button>
                        ) : (
                          <button onClick={() => setGroupByPool(true)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-2.5 py-1 rounded-lg transition-colors">
                            <Sparkles size={12} /> Assign Pools
                          </button>
                        ))}
                      </div>
                    </div>

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
                          onClick={() => { setTeamForm({ teamName: '', clubName: '', coachName: '', coachEmail: '', coachPhone: '', logoUrl: '' }); setShowAddTeam(true) }}
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
                    ) : groupByPool ? (
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                          <p className="text-xs text-slate-400">Drag teams between pools to reassign, or auto-assign to spread them evenly.</p>
                          <button onClick={autoAssignPools} disabled={autoAssigning}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                            <Sparkles size={13} /> {autoAssigning ? 'Assigning…' : 'Auto-assign teams'}
                          </button>
                        </div>
                        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                          {[...pools.map(p => ({ key: p.name, id: p.id, label: p.name, list: teams.filter(t => t.pool === p.name) })),
                            ...(teams.some(t => !t.pool) ? [{ key: '__unassigned', id: '', label: 'No Pool', list: teams.filter(t => !t.pool) }] : [])
                          ].map(col => (
                            <div key={col.key}>
                              <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                                {col.id && renamingPool?.id === col.id ? (
                                  <input autoFocus value={renamingPool.value}
                                    onChange={e => setRenamingPool({ id: col.id, value: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') renamePool(); if (e.key === 'Escape') setRenamingPool(null) }}
                                    onBlur={renamePool}
                                    className="w-32 border border-teal-300 rounded px-1.5 py-0.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400" />
                                ) : col.id ? (
                                  <button onClick={() => setRenamingPool({ id: col.id, value: col.label })}
                                    title="Rename pool"
                                    className="group inline-flex items-center gap-1 hover:text-teal-700 transition-colors">
                                    {col.label}
                                    <Pencil size={11} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ) : col.label}
                                <span className="text-xs font-normal text-slate-400">({col.list.length})</span>
                              </p>
                              <div
                                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPoolDragOver(col.key) }}
                                onDragLeave={e => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) setPoolDragOver(null) }}
                                onDrop={e => { e.preventDefault(); setPoolDragOver(null); const team = poolDragging; setPoolDragging(null); if (team) { const tgt = col.key === '__unassigned' ? null : col.label; const cur = teams.find(t => t.teamName === team)?.pool ?? null; if (cur !== tgt) assignTeamToPool(team, tgt) } }}
                                className={`min-h-52 rounded-xl border-2 p-2 space-y-2 transition-all ${poolDragOver === col.key ? 'border-teal-400 bg-teal-50 scale-[1.01]' : 'border-slate-200 bg-slate-50/60'}`}>
                                {col.list.length === 0 ? (
                                  <div className={`flex items-center justify-center h-32 text-xs text-center px-3 pointer-events-none ${poolDragOver === col.key ? 'text-teal-500' : 'text-slate-400'}`}>{poolDragOver === col.key ? 'Drop here' : 'Drag teams here'}</div>
                                ) : (
                                  col.list.map(team => (
                                    <div key={team.id} draggable
                                      onDragStart={() => setPoolDragging(team.teamName)}
                                      onDragEnd={() => { setPoolDragging(null); setPoolDragOver(null) }}
                                      title={team.clubName && team.clubName !== team.teamName ? `${team.teamName} — ${team.clubName}` : team.teamName}
                                      className={`flex items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-sm transition-all select-none ${poolDragging === team.teamName || assigningTeam === team.teamName ? 'opacity-40' : ''}`}>
                                      <GripVertical size={14} className="text-slate-300 flex-shrink-0 pointer-events-none mt-0.5" />
                                      <div className="min-w-0 flex-1 pointer-events-none">
                                        <p className="text-sm font-medium text-slate-800 leading-snug break-words">{team.teamName}</p>
                                        {team.clubName && team.clubName.trim().toLowerCase() !== team.teamName.trim().toLowerCase() && (
                                          <p className="text-xs text-slate-400 leading-snug break-words mt-0.5">{team.clubName}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-xs text-slate-400">Switch to <strong className="text-slate-500">List view</strong> to edit team details.</p>
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
                                    {(team as any).logoUrl
                                      ? <img src={(team as any).logoUrl} alt="" className="h-6 w-6 rounded object-contain border border-slate-200 bg-white flex-shrink-0" />
                                      : <span className="h-6 w-6 rounded bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{(team.teamName || '?').charAt(0).toUpperCase()}</span>}
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
                                      onClick={() => { setEditingTeam(team); setTeamForm({ teamName: team.teamName, clubName: team.clubName, coachName: team.coachName, coachEmail: team.coachEmail, coachPhone: team.coachPhone, logoUrl: (team as any).logoUrl || '' }) }}
                                      className={`inline-flex items-center gap-1 text-[11px] border rounded px-1.5 py-0.5 transition-colors whitespace-nowrap ${team.status === 'placeholder' ? 'text-amber-600 hover:text-amber-800 border-amber-200 hover:border-amber-400' : 'text-slate-400 hover:text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                                      <Pencil size={11} /> Edit
                                    </button>
                                    <button
                                      onClick={() => { setMovingTeam(team); setMoveTarget('') }}
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-teal-600 border border-slate-200 hover:border-teal-300 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                                      Move <ArrowRight size={11} />
                                    </button>
                                    <button
                                      onClick={() => deleteTeam(team)}
                                      title="Delete team"
                                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-300 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap">
                                      <Trash2 size={11} /> Delete
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
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Team Logo</label>
                          <div className="flex items-center gap-3">
                            {teamForm.logoUrl
                              ? <img src={teamForm.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain border border-slate-200 bg-white" />
                              : <span className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-sm font-semibold flex items-center justify-center">{(teamForm.teamName || '?').charAt(0).toUpperCase()}</span>}
                            <label className={`cursor-pointer border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 ${teamLogoUploading ? 'opacity-50' : ''}`}>
                              {teamLogoUploading ? 'Uploading…' : teamForm.logoUrl ? 'Change logo' : 'Upload logo'}
                              <input type="file" accept="image/*" className="hidden" disabled={teamLogoUploading}
                                onChange={e => { const fl = e.target.files?.[0]; if (fl) pickTeamLogo(fl) }} />
                            </label>
                            <GalleryPicker accept="image" label="From library" triggerClassName="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5" onPick={(url) => setTeamForm(f => ({ ...f, logoUrl: url }))} />
                            {teamForm.logoUrl && <button type="button" onClick={() => setTeamForm(f => ({ ...f, logoUrl: '' }))} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">PNG or JPG recommended.</p>
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
                              let bracketsCreated = 0
                              const staleHere: string[] = []
                              for (const d of divisions) {
                                if (d.teamCount === 0) continue
                                const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(d.name)}/pool-games`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'generate', refCount: 2, gamesPerTeam: Number(divGamesPerTeam[d.name] ?? 3), clearExisting: true }),
                                })
                                const data = await res.json()
                                if (res.ok) totalGames += data.generated ?? 0
                                if (includeBrackets) {
                                  const br = await generateBracketForDivision(d.name, d.teamCount)
                                  if (br === 'created' || br === 'rebuilt') bracketsCreated++
                                  else if (br === 'stale') staleHere.push(d.name)
                                }
                              }
                              if (activeDiv) {
                                const [teamData, gameData] = await Promise.all([
                                  fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/teams`).then(r => r.json()),
                                  fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`).then(r => r.json()),
                                ])
                                setTeams(teamData.teams ?? [])
                                setPools(teamData.pools ?? [])
                                setPoolGames(Array.isArray(gameData) ? gameData : [])
                                loadBracketGames(activeDiv)
                              }
                              setGeneratingAll(false)
                              toast.success(`${totalGames} games generated${bracketsCreated ? `, ${bracketsCreated} bracket${bracketsCreated !== 1 ? 's' : ''} built` : ''} · moved to parking lot`)
                              if (staleHere.length) toast(`Bracket no longer fits the division in: ${staleHere.join(', ')} — open the Bracket tab and Reset to rebuild`, { duration: 9000, icon: '\u26A0\uFE0F' })
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

                {/* -- POOL GAMES TAB -- */}
                {activeTab === 'pool-games' && (
                  <div className="space-y-4">
                    {/* Sits above the controls, because "Generate games" is the
                        fix. PoolGame rows are already scoped to activeDiv and
                        carry no division of their own, so it is stamped on. */}
                    <ShortTeamsBanner
                      games={poolGames.map(g => ({ division: activeDiv || '', pool: g.pool, team1: g.team1, team2: g.team2 }))}
                      guarantee={Number(divGamesPerTeam[activeDiv || ''] ?? 0) || 0}
                      onFix={generateGames}
                      fixLabel="Regenerate this division's games"
                    />
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
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
                            {/* Counts live in the option labels, so the list answers
                                "how many does everyone play" before you pick anything. */}
                            <div className="ml-auto">
                              <label className="block text-xs text-slate-500 mb-1">Filter by team</label>
                              <select className="input text-sm" value={activeTeam} onChange={e => setTeamFilter(e.target.value)}>
                                <option value="">All teams ({teamGameCounts.length})</option>
                                {teamGameCounts.map(([name, n]) => (
                                  <option key={name} value={name}>{name} — {n} game{n !== 1 ? 's' : ''}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                      {pools.length === 0 && (
                        <p className="mt-3 text-xs text-amber-600">No pools yet -- create pools and assign teams first.</p>
                      )}
                    </div>
                    {poolGames.length === 0 && bracketGames.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                        No games yet. Generate pool games above, or build a bracket on the Bracket tab.
                      </div>
                    ) : (
                      <>
                      {poolGames.length > 0 && (() => {
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
                              {/* "2 of 8" rather than "2", so a filtered pool never reads
                                  as a pool that lost six games. */}
                              <span className="text-xs text-slate-400">
                                {activeTeam
                                  ? `${games.filter(g => g.team1?.trim() === activeTeam || g.team2?.trim() === activeTeam).length} of ${games.length} games`
                                  : `${games.length} game${games.length !== 1 ? 's' : ''}`}
                              </span>
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
                                  <th className="px-3 py-2 w-px"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {games.map((g, i) => {
                                  const editing = editGame?.id === g.id
                                  const opts = poolTeamsFor(poolName)
                                  return (
                                  <tr key={g.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}${activeTeam && g.team1?.trim() !== activeTeam && g.team2?.trim() !== activeTeam ? ' opacity-50' : ''}`}>
                                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{g.gameNumber}</td>
                                    {editing ? (
                                      <>
                                        <td className="px-3 py-1.5">
                                          <select className="input text-sm" value={editGame!.home}
                                            onChange={e => setEditGame(v => v && ({ ...v, home: e.target.value }))}>
                                            {[editGame!.home, ...opts.filter(t => t !== editGame!.home)].map(t => <option key={t} value={t}>{t}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-3 py-1.5">
                                          <select className="input text-sm" value={editGame!.away}
                                            onChange={e => setEditGame(v => v && ({ ...v, away: e.target.value }))}>
                                            {[editGame!.away, ...opts.filter(t => t !== editGame!.away)].map(t => <option key={t} value={t}>{t}</option>)}
                                          </select>
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-3 py-2.5 font-medium text-slate-800">
                                          <button type="button" onClick={() => toggleTeamFilter(g.team1)}
                                            title={activeTeam === g.team1?.trim() ? 'Show all teams again' : `Show only ${g.team1}'s games`}
                                            className={`text-left rounded hover:underline underline-offset-2 hover:text-teal-700 transition-colors ${activeTeam === g.team1?.trim() ? 'text-teal-700 underline' : ''}`}>
                                            {g.team1}
                                          </button>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-600">
                                          <button type="button" onClick={() => toggleTeamFilter(g.team2)}
                                            title={activeTeam === g.team2?.trim() ? 'Show all teams again' : `Show only ${g.team2}'s games`}
                                            className={`text-left rounded hover:underline underline-offset-2 hover:text-teal-700 transition-colors ${activeTeam === g.team2?.trim() ? 'text-teal-700 underline font-medium' : ''}`}>
                                            {g.team2}
                                          </button>
                                        </td>
                                      </>
                                    )}
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.date || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.startTime || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.location || '--'}</td>
                                    {/* Always visible rather than revealed on hover: this
                                        runs on an iPad, where there is no hover to reveal
                                        anything. Low contrast until you reach for them. */}
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                      {editing ? (
                                        <span className="inline-flex items-center gap-2">
                                          <button onClick={saveGameEdit} disabled={savingRow || editGame!.home === editGame!.away}
                                            className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-40">
                                            {savingRow ? 'Saving…' : 'Save'}
                                          </button>
                                          <button onClick={() => setEditGame(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                        </span>
                                      ) : deleteGameId === g.id ? (
                                        <span className="inline-flex items-center gap-2">
                                          <span className="text-xs text-red-600">Delete?</span>
                                          <button onClick={() => removeGame(g.id)} disabled={savingRow}
                                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40">Yes</button>
                                          <button onClick={() => setDeleteGameId('')} className="text-xs text-slate-400 hover:text-slate-600">No</button>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5">
                                          <button onClick={() => { setDeleteGameId(''); setEditGame({ id: g.id, home: g.team1, away: g.team2 }) }}
                                            title="Change this matchup"
                                            className="text-slate-300 hover:text-teal-700 transition-colors p-0.5"><Pencil size={13} /></button>
                                          <button onClick={() => { setEditGame(null); setDeleteGameId(g.id) }}
                                            title="Delete this game"
                                            className="text-slate-300 hover:text-red-500 transition-colors p-0.5"><Trash2 size={13} /></button>
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                            {/* Footer rather than a toolbar button: the pool is implied
                                by which card you are under, so there is no pool picker
                                to pick wrongly. Counts ride in the option labels, since
                                a game added by hand is usually one being added TO a team
                                that is short. */}
                            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">
                              {addGamePool === poolName ? (() => {
                                const opts = poolTeamsFor(poolName)
                                const counts = new Map(teamGameCounts)
                                const label = (t: string) => `${t} — ${counts.get(t) ?? 0} game${(counts.get(t) ?? 0) !== 1 ? 's' : ''}`
                                const dupe = addHome && addAway && poolGames.some(g =>
                                  (g.team1?.trim() === addHome && g.team2?.trim() === addAway) ||
                                  (g.team1?.trim() === addAway && g.team2?.trim() === addHome))
                                return (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select className="input text-sm" value={addHome} onChange={e => setAddHome(e.target.value)}>
                                      <option value="">Home team…</option>
                                      {opts.map(t => <option key={t} value={t}>{label(t)}</option>)}
                                    </select>
                                    <span className="text-xs text-slate-400">vs</span>
                                    <select className="input text-sm" value={addAway} onChange={e => setAddAway(e.target.value)}>
                                      <option value="">Away team…</option>
                                      {opts.filter(t => t !== addHome).map(t => <option key={t} value={t}>{label(t)}</option>)}
                                    </select>
                                    <button onClick={() => addGame(poolName)} disabled={!addHome || !addAway || addingGame}
                                      className="btn-primary btn-sm disabled:opacity-50">
                                      {addingGame ? 'Adding…' : 'Add game'}
                                    </button>
                                    <button onClick={() => { setAddGamePool(''); setAddHome(''); setAddAway('') }}
                                      className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                    {/* A rematch is allowed -- some formats want one -- but
                                        it is almost always a slip, so it gets said out loud. */}
                                    {dupe && <span className="text-xs text-amber-600">These two already play each other in this division.</span>}
                                  </div>
                                )
                              })() : (
                                <button onClick={() => { setAddGamePool(poolName); setAddHome(''); setAddAway('') }}
                                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1">
                                  <Plus size={13} /> Add a game to {poolName}
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      })()}
                      {bracketGames.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-700">Bracket Games</h3>
                            <span className="text-xs text-slate-400">{bracketGames.length} game{bracketGames.length !== 1 ? 's' : ''}</span>
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
                              {bracketGames.map((g, i) => (
                                <tr key={g.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                  <td className="px-5 py-2.5 font-mono text-xs text-teal-600">{g.gameNumber}</td>
                                  <td className="px-3 py-2.5 font-medium text-slate-800">{g.team1}</td>
                                  <td className="px-3 py-2.5 text-slate-600">{g.team2}</td>
                                  <td className="px-3 py-2.5 text-xs text-slate-400">{g.date || '--'}</td>
                                  <td className="px-3 py-2.5 text-xs text-slate-400">{g.startTime || '--'}</td>
                                  <td className="px-3 py-2.5 text-xs text-slate-400">{g.location || '--'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="px-5 py-2 text-[11px] text-slate-400 border-t border-slate-100">Set dates, times and fields on the Scheduler (these games appear in the parking lot as B#).</p>
                        </div>
                      )}
                      </>
                    )}
                  </div>
                )}
              {activeTab === 'bracket' && activeDiv && (
                (() => {
                  const tc = divisions.find(d => d.name === activeDiv)?.teamCount ?? teams.length
                  const poolG = parseInt(divGamesPerTeam[activeDiv] ?? gamesPerTeam ?? '2') || 2
                  const guar = parseInt(guarantee) || 4
                  const owes2 = (guar - poolG) >= 2 || smartTable[tc]?.bracket === '2gg'
                  const planB = smartTable[tc]?.bracket || ''
                  const fmt = planB === 'double' ? 'double' : planB === '2gg' ? '2gg' : (planB === 'single' || planB === 'single-con') ? 'single' : undefined
                  const sd = smartTable[tc] || {}
                  const def = defaultBracketPlan(tc, poolG, guar)
                  const cnt = owes2 ? String(tc) : String(sd.advance ?? def.advance)
                  const cons = owes2 ? undefined : String(sd.consolation ?? def.consolation)
                  return <BracketBuilder key={activeDiv} tournamentId={id} division={activeDiv} planFormat={fmt as 'single' | 'double' | '2gg' | undefined} planCount={cnt} planConsolation={cons} planLoserConsolation={owes2} />
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
