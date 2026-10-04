'use client'

import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import { ClipboardCheck, ChevronLeft } from 'lucide-react'
import SetupChecklist from '@/components/SetupChecklist'

export default function ChecklistPage() {
  const { id } = useParams()
  const { status } = useSession()

  if (status === 'loading') return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto">
      <Toaster position="top-right" />
      <Link href={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Dashboard</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><ClipboardCheck size={22} className="text-teal-600" /> Tournament setup checklist</h1>
      <p className="text-sm text-slate-500 mb-5">A shared setup list for the whole event. Anyone on staff can check items off and add their own.</p>

      <div className="mb-6"><SetupChecklist tournamentId={String(id)} /></div>

      <p className="text-[11px] text-slate-400">Changes save automatically and are shared with everyone on staff.</p>
    </div>
  )
}
