'use client'
// Edit controls on an organization's own public site, for its signed-in directors only.
//
// Bo, Oct 17 2026: the Website editor was hard to find from the website. Signed in as
// a director (or admin) of this organization, the site shows an "Edit site" button, and
// hovering any home-page section outlines it with an "Edit <section>" chip that opens
// the editor on that section. Visitors, and directors of other organizations, see none
// of it: it renders nothing until the session and the org's slug both check out.
//
// Works on the org's own domain too: middleware passes /login, /api and /dashboard
// through there, so signing in on sunshineeventsgroup.com gives this a session.
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil } from 'lucide-react'
import { sectionLabel } from '@/lib/siteLayout'

type Hover = { key: string; top: number; right: number }

export default function SiteEditBar({ slug }: { slug: string }) {
  const { data: session, status } = useSession()
  const role = (session?.user as any)?.role
  const [mine, setMine] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const chip = useRef<HTMLAnchorElement | null>(null)
  const hoverEl = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || (role !== 'director' && role !== 'admin')) return
    let off = false
    fetch('/api/org').then(r => (r.ok ? r.json() : null)).then(o => { if (!off && o?.slug === slug) setMine(true) }).catch(() => {})
    return () => { off = true }
  }, [status, role, slug])

  useEffect(() => {
    if (!mine) return
    const place = (el: HTMLElement | null) => {
      hoverEl.current = el
      if (!el) { setHover(null); return }
      const r = el.getBoundingClientRect()
      setHover({ key: el.dataset.siteSec || '', top: Math.max(r.top + 12, 12), right: Math.max(window.innerWidth - r.right + 12, 12) })
    }
    const onMove = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || (chip.current && chip.current.contains(t))) return
      const el = t.closest('[data-site-sec]') as HTMLElement | null
      if (el !== hoverEl.current) place(el)
    }
    const onScroll = () => place(hoverEl.current)
    document.addEventListener('mousemove', onMove)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { document.removeEventListener('mousemove', onMove); window.removeEventListener('scroll', onScroll) }
  }, [mine])

  if (!mine) return null
  return (
    <>
      <style>{`@media (hover:hover){[data-site-sec]:hover{outline:2px solid rgba(20,184,166,.75);outline-offset:-2px}}`}</style>
      {hover && hover.key && (
        <a ref={chip} href={`/dashboard/org/site?sec=${encodeURIComponent(hover.key)}`}
          style={{ top: hover.top, right: hover.right }}
          className="fixed z-[60] inline-flex items-center gap-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg px-3 py-2 shadow-lg hover:bg-slate-800">
          <Pencil size={13} /> Edit {sectionLabel(hover.key).toLowerCase()}
        </a>
      )}
      <a href="/dashboard/org/site"
        className="fixed z-[60] bottom-5 left-5 inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-bold rounded-full px-5 py-3 shadow-xl hover:bg-slate-800">
        <Pencil size={15} /> Edit site
      </a>
    </>
  )
}
