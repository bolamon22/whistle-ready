'use client'
import { useEffect } from 'react'

// On a phone the fact strip scrolls sideways, and the cell for the current
// page (SCHEDULE is last) would start off-screen. Center it once on load.
// Sets scrollLeft on the strip only -- scrollIntoView would also be free to
// move the page vertically, and this runs as the page is still settling.
export default function FactStripScroller({ stripId }: { stripId: string }) {
  useEffect(() => {
    const strip = document.getElementById(stripId)
    const cell = strip?.querySelector('[data-active="true"]') as HTMLElement | null
    if (!strip || !cell || strip.scrollWidth <= strip.clientWidth) return
    strip.scrollLeft = cell.offsetLeft - (strip.clientWidth - cell.clientWidth) / 2
  }, [stripId])
  return null
}
