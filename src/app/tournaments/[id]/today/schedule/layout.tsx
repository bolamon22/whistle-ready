import type { Metadata } from 'next'

// The Game day screen's copy of the schedule. The same content is indexed at
// /tournaments/<id>/public, so this one stays out of search results.
export const metadata: Metadata = { title: 'Schedule', robots: { index: false, follow: true } }

export default function GameDayScheduleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
