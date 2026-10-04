'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import TournamentNav from '../TournamentNav'
import TaskBoard from '@/components/tasks/TaskBoard'
import SetupChecklist from '@/components/SetupChecklist'
import { announceTasksChanged } from '@/lib/taskTemplate'

// A tournament's Tasks tab: its task list, and under it the shared setup
// checklist -- the same list staff check off on their phones from
// Setup -> Checklist, so it is shown here, not copied.

export default function TournamentTasksPage() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const reported = useRef(false)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } })
      .catch(() => {})
  }, [id])

  // The task list's row and the nav badges follow the checklist as it's checked off.
  function onProgress(p: { done: number; total: number }) {
    window.dispatchEvent(new CustomEvent('setup-checklist-progress', { detail: { tournamentId: id, ...p } }))
    // The first report is the list loading; every one after it is a change.
    if (reported.current) announceTasksChanged()
    reported.current = true
  }

  // "Setup checklist" links land on #setup. Scroll once the list above has
  // loaded, or it would push the checklist down after the jump.
  function onLoaded() {
    if (window.location.hash === '#setup') requestAnimationFrame(() => document.getElementById('setup')?.scrollIntoView())
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 pb-24 sm:pb-6">
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />
        <TaskBoard tournamentId={id} onLoaded={onLoaded} />
        <section id="setup" className="scroll-mt-24 mt-8">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ClipboardCheck size={20} className="text-teal-600" /> Setup checklist</h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-3">
            Due the day before. Shared with staff: anyone working the event can check items off on their phone and add their own.
          </p>
          <SetupChecklist tournamentId={id} onProgress={onProgress} />
        </section>
      </div>
    </div>
  )
}
