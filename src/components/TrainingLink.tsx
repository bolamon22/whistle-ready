import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import { trainingVideo, minutesLabel } from '@/lib/training'

/** "Watch how (1 min)": opens the staff training page straight to one video. */
export default function TrainingLink({ id, className = '', label = 'Watch how', dark = false }: { id: string; className?: string; label?: string; dark?: boolean }) {
  const v = trainingVideo(id)
  if (!v) return null
  return (
    <Link href={`/dashboard/staff/training?v=${encodeURIComponent(id)}`}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold hover:underline ${dark ? 'text-emerald-400 hover:text-emerald-300' : 'text-teal-700 hover:text-teal-800'} ${className}`}>
      <PlayCircle size={14} /> {label} ({minutesLabel(v.secs)} video)
    </Link>
  )
}
