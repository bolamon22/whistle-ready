'use client'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Tab = { id: string; label: string; href?: string }

// Tabbed event-page content. Tabs whose `href` is set navigate (Rules / its own
// page); the rest swap the panel in place. Fact-bar cards and the Event info
// dropdown drive this via the URL hash (#sectionId) — a hash change activates
// the matching panel even when it isn't shown as a tab (e.g. Locations, Hotels).
export default function EventTabs({ tabs, panels, defaultId }: {
  tabs: Tab[]
  panels: Record<string, ReactNode>
  defaultId: string
}) {
  const [active, setActive] = useState(defaultId)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const apply = (scroll: boolean) => {
      const h = decodeURIComponent((window.location.hash || '').replace('#', ''))
      if (h && panels[h]) {
        setActive(h)
        if (scroll && rootRef.current) rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    apply(false)
    const onHash = () => apply(true)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (id: string) => {
    setActive(id)
    try { history.replaceState(null, '', '#' + id) } catch {}
  }

  return (
    <div ref={rootRef} className="max-w-4xl mx-auto px-6 py-10 scroll-mt-24">
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto mb-7">
        {tabs.map((t) => {
          const on = !t.href && t.id === active
          const cls = `whitespace-nowrap px-4 py-3 text-sm border-b-2 -mb-px transition-colors ${on ? 'border-teal-500 text-teal-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`
          return t.href
            ? <a key={t.id} href={t.href} className={cls}>{t.label}</a>
            : <button key={t.id} type="button" onClick={() => pick(t.id)} className={cls}>{t.label}</button>
        })}
      </div>
      <div>{panels[active] ?? panels[defaultId] ?? null}</div>
    </div>
  )
}
