'use client'

// The "waivers not on a registered team" panel.
//
// Lives in its own file rather than inside the 1000-line waivers page because it is the
// one piece of that page with real interaction logic worth rendering on its own.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import type { Unmatched } from '@/lib/waiverMatch'

/** Just enough of a waiver to tell one player from another while deciding. */
export type PlayerLite = { id: string; name: string; grade: string; dob: string; parent: string; jersey: string }

/** "Grade 11 · b. 2008 · Dana Johnson" — whatever we actually have, in decision order. */
function playerMeta(pl: PlayerLite): string {
  const year = /^\d{4}/.exec(pl.dob)?.[0] || ''
  return [pl.grade ? `Grade ${pl.grade}` : '', year ? `b. ${year}` : '', pl.jersey ? `#${pl.jersey}` : '', pl.parent]
    .filter(Boolean).join('  \u00b7  ')
}

/**
 * One unmatched tag, and what to do about it.
 *
 * TWO WAYS TO RESOLVE IT, because the tag is sometimes a typo and sometimes a genuine
 * fork. When every player with this tag belongs in the same place — a misspelling, a
 * division holding exactly one team — one pick moves all of them and that is the whole
 * job. When the tag is a division holding TWO teams, the group is the wrong unit: the
 * players really are split, nothing on the waiver says which is which, and moving all 7
 * to one team is just a wrong roster arrived at quickly (Bo, Sep 18 2026).
 *
 * So the group control stays for the first case and "Assign individually" opens the
 * second: the actual names, with grade and birth year beside them, which is what tells a
 * high-school team from a 2030 team. Nothing is preselected on a fork — a blank dropdown
 * is the honest state when the data does not say.
 */
function UnmatchedRow({ r, onApply, applying, loadPlayers, onAssign }: {
  r: Unmatched
  onApply: (tag: string, to: string) => void
  applying: string
  loadPlayers: (tag: string) => Promise<PlayerLite[]>
  onAssign: (picks: { id: string; to: string }[]) => Promise<number>
}) {
  const [pick, setPick] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [players, setPlayers] = useState<PlayerLite[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [each, setEach] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const val = pick ?? r.match.value
  const busy = applying === r.tag

  async function toggle() {
    const next = !expanded
    setExpanded(next)
    if (!next || players || loading) return
    setLoading(true)
    try {
      const list = await loadPlayers(r.tag)
      setPlayers(list)
      // Seed only from a suggestion we are actually sure of, so the individual view is
      // useful for "these are all X except one" without ever guessing on a coin flip.
      if (r.match.sure && r.match.value) {
        setEach(Object.fromEntries(list.map(pl => [pl.id, r.match.value])))
      }
    } catch { toast.error('Could not load those players') } finally { setLoading(false) }
  }

  const assigned = players ? players.filter(pl => each[pl.id]) : []
  async function applyEach() {
    if (!assigned.length) return
    setSaving(true)
    try {
      const moved = await onAssign(assigned.map(pl => ({ id: pl.id, to: each[pl.id] })))
      const left = players!.filter(pl => !each[pl.id])
      setPlayers(left.length ? left : null)
      setEach({})
      if (!left.length) setExpanded(false)
      if (moved < assigned.length) toast.error(`Moved ${moved} of ${assigned.length} \u2014 try the rest again`)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-sm text-slate-800 break-words">{r.tag}</span>
        <span className="text-xs text-slate-500">{r.count} player{r.count === 1 ? '' : 's'}</span>
        {r.match.sure && <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Ready</span>}
      </div>
      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{r.match.why}</p>

      {r.match.options.length > 0 && (
        <>
          <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
            <select value={val} onChange={e => setPick(e.target.value)} disabled={expanded}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">&mdash; move all {r.count} to &mdash;</option>
              {r.match.options.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <button onClick={() => onApply(r.tag, val)} disabled={!val || busy || expanded}
              className="sm:w-36 text-sm font-semibold rounded-lg px-4 py-2 inline-flex items-center justify-center gap-1.5 bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <><RefreshCw size={14} className="animate-spin" /> Moving&hellip;</> : <>Move all {r.count}</>}
            </button>
          </div>

          <button type="button" onClick={toggle}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {expanded ? 'Back to moving them together' : `Assign these ${r.count} individually`}
          </button>

          {expanded && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
              {loading && <div className="px-3 py-4 text-xs text-slate-500 flex items-center gap-2"><RefreshCw size={13} className="animate-spin" /> Loading the players&hellip;</div>}
              {!loading && players && players.length === 0 && <div className="px-3 py-4 text-xs text-slate-500">Nothing left under this name.</div>}
              {!loading && players && players.map(pl => (
                <div key={pl.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 border-b border-slate-100 last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{pl.name}</div>
                    {playerMeta(pl) && <div className="text-[11px] text-slate-500 truncate">{playerMeta(pl)}</div>}
                  </div>
                  <select value={each[pl.id] || ''} onChange={e => setEach(m => ({ ...m, [pl.id]: e.target.value }))}
                    className="sm:w-72 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                    <option value="">&mdash; leave for now &mdash;</option>
                    {r.match.options.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
              ))}
              {!loading && players && players.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-slate-50">
                  <span className="text-[11px] text-slate-500">
                    {assigned.length ? `${assigned.length} of ${players.length} assigned` : 'Pick a team for anyone you can place \u2014 the rest stay here.'}
                  </span>
                  <button onClick={applyEach} disabled={!assigned.length || saving}
                    className="text-xs font-semibold rounded-lg px-3.5 py-2 inline-flex items-center justify-center gap-1.5 bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {saving ? <><RefreshCw size={13} className="animate-spin" /> Moving&hellip;</> : <>{assigned.length ? `Move ${assigned.length}` : 'Move'}</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function UnmatchedPanel({ rows, onApply, applying, loadPlayers, onAssign }: {
  rows: Unmatched[]
  onApply: (tag: string, to: string) => void
  applying: string
  loadPlayers: (tag: string) => Promise<PlayerLite[]>
  onAssign: (picks: { id: string; to: string }[]) => Promise<number>
}) {
  const [open, setOpen] = useState(true)
  if (!rows.length) return null
  const players = rows.reduce((n, r) => n + r.count, 0)
  const ready = rows.filter(r => r.match.sure).length
  return (
    <div className="border border-amber-300 bg-amber-50 rounded-xl mb-4 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-amber-900">
            {players} waiver{players === 1 ? '' : 's'} not on a registered team
          </div>
          <div className="text-xs text-amber-800 mt-0.5">
            {rows.length} team name{rows.length === 1 ? '' : 's'} to sort out{ready ? ` \u00b7 ${ready} ready to apply` : ''}. These players are missing from roster counts and check-in.
          </div>
        </div>
        {open ? <ChevronDown size={18} className="text-amber-600 flex-shrink-0" /> : <ChevronRight size={18} className="text-amber-600 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2.5">
          {rows.map(r => (
            <UnmatchedRow key={r.tag} r={r} onApply={onApply} applying={applying} loadPlayers={loadPlayers} onAssign={onAssign} />
          ))}
        </div>
      )}
    </div>
  )
}
