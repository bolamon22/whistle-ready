'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Pool { id: string; name: string; teamNames: string[] }

export default function AssignPoolsPage() {
  const { id, division } = useParams<{ id: string; division: string }>()
  const router = useRouter()
  const divName = decodeURIComponent(division)

  const [pools, setPools] = useState<Pool[]>([])
  const [unassigned, setUnassigned] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${id}/divisions/${division}/teams`)
      .then(r => r.json())
      .then(data => {
        const allTeams: string[] = (data.teams ?? []).map((t: { teamName: string }) => t.teamName)
        const fetchedPools: Pool[] = (data.pools ?? []).map((p: { id: string; name: string; teamNames: string[] }) => ({
          id: p.id, name: p.name, teamNames: Array.isArray(p.teamNames) ? p.teamNames : [],
        }))
        const assignedTeams = new Set(fetchedPools.flatMap(p => p.teamNames))
        setUnassigned(allTeams.filter(t => !assignedTeams.has(t)).sort())
        setPools(fetchedPools)
        setLoading(false)
      })
  }, [id, division])

  function moveTeam(team: string, fromKey: string, toKey: string) {
    if (fromKey === toKey) return

    setPools(prev => {
      let next = prev.map(p => ({ ...p, teamNames: [...p.teamNames] }))

      // Remove from source
      if (fromKey !== 'unassigned') {
        next = next.map(p => p.name === fromKey ? { ...p, teamNames: p.teamNames.filter(t => t !== team) } : p)
      }
      // Add to destination
      if (toKey !== 'unassigned') {
        next = next.map(p => p.name === toKey ? { ...p, teamNames: [...p.teamNames, team] } : p)
      }
      return next
    })

    if (fromKey === 'unassigned') {
      setUnassigned(u => u.filter(t => t !== team))
    }
    if (toKey === 'unassigned') {
      setUnassigned(u => [...u, team].sort())
    }
  }

  function randomAssign() {
    const all = [...unassigned, ...pools.flatMap(p => p.teamNames)].sort(() => Math.random() - 0.5)
    const newPools = pools.map(p => ({ ...p, teamNames: [] as string[] }))
    all.forEach((team, i) => newPools[i % newPools.length].teamNames.push(team))
    setPools(newPools)
    setUnassigned([])
    toast.success('Teams randomly assigned')
  }

  async function saveAndGoBack() {
    setSaving(true)
    try {
      await Promise.all(pools.map(p =>
        fetch(`/api/tournaments/${id}/divisions/${division}/pools`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId: p.id, teamNames: p.teamNames }),
        })
      ))
      toast.success('Saved')
      router.push(`/tournaments/${id}/divisions`)
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Loading…</p>
    </div>
  )

  const cols = [
    { key: 'unassigned', label: 'No Pool', teams: unassigned },
    ...pools.map(p => ({ key: p.name, label: p.name, teams: p.teamNames })),
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <button onClick={saveAndGoBack} disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          ← {saving ? 'Saving…' : 'Save & Go Back'}
        </button>
        <button onClick={randomAssign} disabled={pools.length === 0}
          className="text-sm font-semibold border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 tracking-wide uppercase">
          Randomly Assign Teams to Pools
        </button>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        <h1 className="text-lg font-bold text-slate-800">Assign Teams to Pools</h1>
        <p className="text-sm text-slate-500 mt-0.5">{divName}</p>
        <p className="text-sm text-slate-400 mt-3 mb-6">Drag and drop teams to pools below or randomly assign them to pools</p>

        {pools.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-amber-700">No pools set up yet.</p>
            <p className="text-xs text-amber-600 mt-1">Go back and create pools in the Pools tab first.</p>
          </div>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${Math.min(cols.length, 4)}, minmax(180px, 1fr))` }}>
            {cols.map(col => (
              <div key={col.key}>
                <p className="text-sm font-semibold text-slate-600 mb-2">
                  {col.label}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">({col.teams.length})</span>
                </p>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(col.key) }}
                  onDragEnter={e => { e.preventDefault(); setDragOver(col.key) }}
                  onDragLeave={e => {
                    // Only clear if leaving the container itself, not a child
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX, y = e.clientY
                    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                      setDragOver(null)
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOver(null)
                    setDragging(null)
                    const raw = e.dataTransfer.getData('text/plain')
                    if (!raw) return
                    try {
                      const { team, sourceKey } = JSON.parse(raw)
                      if (sourceKey !== col.key) moveTeam(team, sourceKey, col.key)
                    } catch { /* bad data */ }
                  }}
                  className={`min-h-52 rounded-xl border-2 p-2 space-y-2 transition-all ${
                    dragOver === col.key
                      ? 'border-sky-400 bg-sky-50 scale-[1.01]'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  {col.teams.length === 0 ? (
                    <div className={`flex items-center justify-center h-32 text-xs text-center leading-relaxed px-3 pointer-events-none ${dragOver === col.key ? 'text-sky-500' : 'text-slate-400'}`}>
                      {dragOver === col.key ? 'Drop here' : 'Add teams by dragging\nand dropping here'}
                    </div>
                  ) : (
                    col.teams.map(team => (
                      <div
                        key={team}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({ team, sourceKey: col.key }))
                          e.dataTransfer.effectAllowed = 'move'
                          setDragging(team)
                        }}
                        onDragEnd={() => { setDragging(null); setDragOver(null) }}
                        className={`flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-sm transition-all select-none ${dragging === team ? 'opacity-40' : ''}`}
                      >
                        <span className="text-slate-300 text-[10px] leading-none flex-shrink-0 pointer-events-none">⣿⣿</span>
                        <span className="text-sm font-medium text-slate-700 truncate pointer-events-none">{team}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {unassigned.length > 0 && pools.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <p className="text-sm font-medium text-amber-700">
              {unassigned.length} team{unassigned.length !== 1 ? 's' : ''} not yet assigned to a pool
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
