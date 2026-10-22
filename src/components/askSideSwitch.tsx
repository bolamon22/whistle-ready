'use client'

import toast from 'react-hot-toast'

// Ask before taking a ref off a game that switched girls/boys (Bo, Oct 22 2026: "The only
// time we should remove the ref if it goes from a girl's game to a boy's game, or vice
// versa", and "ask first"). PATCH /api/games/[id] returns sideSwitch: the refs on a game
// whose division went from one side to the other, whose own side (Staff: Boys / Girls) is
// not the game's new side. Refs set to Both are never asked. Nothing is removed unless he
// clicks Remove; that sends the ref the usual "you're off" alert.

export type SideSwitch = { assignmentId: string; name: string; role: string; num: string; from: string; to: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const first = (n: string) => n.split(' ')[0] || n

export function askSideSwitch(list: SideSwitch[] | undefined, onDone?: () => void) {
  if (!list?.length) return
  const remove = async () => {
    const ok = await Promise.all(list.map(s => fetch(`/api/assignments/${s.assignmentId}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)))
    if (ok.every(Boolean)) toast.success(list.length === 1 ? `${list[0].name} is off #${list[0].num}` : `${list.length} refs removed`)
    else toast.error('A ref could not be removed. Check the Assigner.')
    onDone?.()
  }
  toast(t => (
    <span className="text-sm text-slate-700">
      <span className="block font-semibold text-slate-900">Remove the ref{list.length === 1 ? '' : 's'}?</span>
      {list.map(s => (
        <span key={s.assignmentId} className="mt-0.5 block">#{s.num} is now a {cap(s.to)} game (was {cap(s.from)}). {s.name} ({s.role.replace('ref', 'R')}) is a {cap(s.from)} ref.</span>
      ))}
      <span className="mt-2 flex gap-2">
        <button type="button" onClick={() => { toast.dismiss(t.id); remove() }} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
          Remove {list.length === 1 ? first(list[0].name) : 'them'}
        </button>
        <button type="button" onClick={() => toast.dismiss(t.id)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Keep {list.length === 1 ? first(list[0].name) : 'them'}
        </button>
      </span>
    </span>
  ), { duration: 30000, id: `side-${list.map(s => s.assignmentId).join('-')}` })
}
