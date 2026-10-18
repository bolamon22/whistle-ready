'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronUp, ChevronDown, Plus, Trash2, ExternalLink, ImagePlus, Star, Search, Library, Globe, Monitor, Tablet, Smartphone, Send, LayoutTemplate, FileText, CalendarDays, Eye, EyeOff, Facebook, Instagram } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import GalleryPicker from '@/components/GalleryPicker'
import AiGenerateButton from '@/components/AiGenerateButton'
import { seriesOf, ONE_OFF } from '@/lib/eventSeries'
import SponsorsEditor from '@/components/site/SponsorsEditor'
import OrgHomeView, { type HomeTourn } from '@/components/site/OrgHomeView'
import { SITE_SECTIONS, siteLayout, type SiteLayout, type SiteSectionKey } from '@/lib/siteLayout'
import { sponsorList } from '@/lib/sponsors'
import { mdToHtml } from '@/app/o/[slug]/_md'

type Sponsor = { name: string; logoUrl: string; url: string; role?: string; tier?: string; blurb?: string; eventIds?: string[]; series?: string[] }
type PitchStat = { value: string; label: string }
type Pitch = { show: boolean; headline: string; sub: string; benefits: string[]; stats: PitchStat[]; ctaLabel: string; wallCtaLabel: string; wallCtaLine: string }
type Page = { title: string; slug: string; body: string; group: string; heroImage?: string; placement?: 'nav' | 'footer' }
type Photo = { id?: string; url: string; caption: string; credit?: string; tournamentId?: string }
type Insta = { username: string; token: string }
type Content = {
  logo: string
  hero: { headline: string; subtext: string; imageUrl: string }
  foundedYear?: string
  priorEvents?: string
  historyNote?: string
  priorTeams?: string
  about: { heading: string; body: string }
  sponsors: Sponsor[]
  sponsorPitch: Pitch
  contact: { email: string; phone: string; hours: string; address: string }
  socials: { facebook: string; instagram: string; website: string }
  pages: Page[]
  gallery: Photo[]
  galleryCovers: Record<string, string>
  instagram: Insta
  layout?: unknown
}
const EMPTY: Content = {
  logo: '',
  hero: { headline: '', subtext: '', imageUrl: '' },
  foundedYear: '',
  priorEvents: '',
  historyNote: '',
  priorTeams: '',
  about: { heading: '', body: '' },
  sponsors: [],
  sponsorPitch: { show: false, headline: '', sub: '', benefits: [], stats: [], ctaLabel: '', wallCtaLabel: '', wallCtaLine: '' },
  contact: { email: '', phone: '', hours: '', address: '' },
  socials: { facebook: '', instagram: '', website: '' },
  pages: [],
  gallery: [],
  galleryCovers: {},
  instagram: { username: '', token: '' },
}

const slugify = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// Downscale/compress large images in the browser before upload. Phone photos are
// often several MB; base64-encoded they exceed the server request-size limit and the
// upload fails. Small files (e.g. logos) pass through untouched to preserve quality.
async function compressImage(file: File, maxDim = 1400, quality = 0.82): Promise<Blob> {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file
  if (file.size < 400 * 1024) return file
  try {
    const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file) })
    const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl })
    let width = img.width, height = img.height
    if (Math.max(width, height) > maxDim) { const sc = maxDim / Math.max(width, height); width = Math.round(width * sc); height = Math.round(height * sc) }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d'); if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch { return file }
}

async function uploadImage(file: File): Promise<string | null> {
  try {
    const blob = await compressImage(file)
    const fd = new FormData(); fd.append('file', blob, 'upload.jpg')
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!r.ok) return null
    const d = await r.json().catch(() => ({})); return d.url || null
  } catch { return null }
}

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

const EV_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Oct 24-25, 2026" from a tournament's start and end.
 *
 * Takes unknown rather than string on purpose. These dates arrive from /api/tournaments
 * as whatever the row holds, and a helper that assumed a string is exactly how the Staff
 * Pool's merge panel took the whole page down. Anything unparseable returns '' and the
 * row simply shows no date.
 */
function eventDates(start: unknown, end: unknown): string {
  const re = /^(\d{4})-(\d{2})-(\d{2})/
  const a = re.exec(String(start ?? '').trim())
  if (!a) return ''
  const b = re.exec(String(end ?? '').trim()) || a
  const am = EV_MON[Number(a[2]) - 1], bm = EV_MON[Number(b[2]) - 1]
  if (!am || !bm) return ''
  if (a[1] === b[1] && a[2] === b[2]) {
    return a[3] === b[3] ? `${am} ${Number(a[3])}, ${a[1]}` : `${am} ${Number(a[3])}\u2013${Number(b[3])}, ${a[1]}`
  }
  return `${am} ${Number(a[3])} \u2013 ${bm} ${Number(b[3])}, ${b[1]}`
}
/** Just the city, so a long venue address doesn't push the row's buttons off screen. */
const eventCity = (loc: unknown) => String(loc ?? '').split(/[,\/]/)[0].trim()

/** One tournament in the event-pages panel. Module level, not nested in the render:
 *  declared inside it, React reads a new component type on every keystroke in the search
 *  box and remounts all fifty-two rows. */
function EventRow({ t, next }: { t: any; next?: boolean }) {
  const when = eventDates(t.startDate, t.endDate), where = eventCity(t.location)
  return (
    <div className={`flex items-center gap-2 flex-wrap border rounded-lg p-3 ${next ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200'}`}>
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium text-slate-700 truncate">
          {t.name}
          {next && <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-white border border-teal-200 rounded-full px-2 py-0.5">Next up</span>}
        </div>
        {(when || where) && (
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {when}{when && where ? ' \u00b7 ' : ''}{where}
          </div>
        )}
      </div>
      <a href={`/tournaments/${t.id}/event`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ExternalLink size={12} /> View</a>
      <Link href={`/tournaments/${t.id}/builder?section=pagebuilder`} className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-100">Edit page</Link>
    </div>
  )
}

/** The live preview runs in an iframe so Tablet and Phone get the site's real
 *  breakpoints: Tailwind's sm:/md: follow the viewport, and a narrow div inside a wide
 *  window would still lay out like a desktop. React renders into the frame through a
 *  portal, so clicks and state are the editor's own. */
function FramePreview({ width, frameRef, children }: { width: string; frameRef: React.MutableRefObject<HTMLIFrameElement | null>; children: React.ReactNode }) {
  const [body, setBody] = useState<HTMLElement | null>(null)
  const onLoad = () => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    doc.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(n => doc.head.appendChild(n.cloneNode(true)))
    doc.documentElement.className = document.documentElement.className
    doc.body.className = document.body.className
    doc.body.style.margin = '0'
    doc.body.style.background = '#f8fafc'
    setBody(doc.body)
  }
  return (
    <>
      <iframe ref={frameRef} title="Site preview" onLoad={onLoad}
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        className="h-full bg-white border border-slate-200 rounded-xl shadow-sm transition-[width] duration-300 mx-auto block"
        style={{ width, maxWidth: '100%' }} />
      {body && createPortal(children, body)}
    </>
  )
}

/** A clickable part of the preview that isn't a home-page section (menu bar, footer,
 *  an info page): same outline and label as the sections in OrgHomeView. */
function Pick({ k, label, sel, onPick, children }: { k: string; label: string; sel: string; onPick: (k: string) => void; children: React.ReactNode }) {
  const on = sel === k
  return (
    <div onClickCapture={e => { e.preventDefault(); e.stopPropagation(); onPick(k) }} className="group/slot relative cursor-pointer">
      {children}
      <div className={`pointer-events-none absolute inset-0 z-30 border-2 transition-colors ${on ? 'border-teal-500' : 'border-transparent group-hover/slot:border-teal-300'}`} />
      <span className={`pointer-events-none absolute top-2 left-2 z-30 bg-teal-600 text-white text-[11px] font-bold rounded-md px-2 py-0.5 ${on ? 'inline-block' : 'hidden group-hover/slot:inline-block'}`}>{label}</span>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" onClick={onChange} className="flex items-center gap-2.5 text-sm text-slate-700" aria-pressed={on}>
      <span className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-teal-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

function OrgSiteEditorInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const sp = useSearchParams()
  const qOrg = sp.get('org') || ''
  const qSlug = sp.get('slug') || ''
  const qName = sp.get('name') || ''
  const apiQ = qOrg ? `?org=${encodeURIComponent(qOrg)}` : ''
  const [org, setOrg] = useState<{ name: string; slug: string } | null>(null)
  const [c, setC] = useState<Content>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openPages, setOpenPages] = useState<Record<number, boolean>>({})
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ events: true })
  const [tournaments, setTournaments] = useState<any[]>([])
  // Event-pages panel: four events you actually promote, forty-eight you don't.
  const [evTab, setEvTab] = useState<'upcoming' | 'past'>('upcoming')
  const [evQ, setEvQ] = useState('')
  const [evGroup, setEvGroup] = useState<'year' | 'event'>('year')
  const [evOpenGroups, setEvOpenGroups] = useState<Record<string, boolean>>({})
  const [galSel, setGalSel] = useState<Set<string>>(new Set())
  const [bulkCaption, setBulkCaption] = useState('')
  const [bulkCredit, setBulkCredit] = useState('')
  const [bulkTourn, setBulkTourn] = useState('')
  const [galFilterT, setGalFilterT] = useState('all')
  const [galSearch, setGalSearch] = useState('')
  // Live-preview editor (Bo, Oct 17 2026): the page itself in the middle, the part you
  // clicked on the right, what's on the site on the left. `sel` is a home-page section
  // key, 'header', 'footer' or 'page:<index>'. ?sec= comes from the Edit chips on the site.
  const [sel, setSel] = useState<string>(() => sp.get('sec') || 'hero')
  const [tab, setTab] = useState<'sections' | 'pages' | 'events'>('sections')
  const [device, setDevice] = useState<'desk' | 'tab' | 'phone'>('desk')
  const [focus, setFocus] = useState('')
  const [savedJson, setSavedJson] = useState('')
  const [hist, setHist] = useState<{ totalEvents: number; totalGames: number; champs: number } | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const scrollNext = useRef(!!sp.get('sec'))
  const loadedOnce = useRef(false)

  // Picking from the list scrolls the preview to that part; clicking it in the preview
  // doesn't, because you're already looking at it.
  useEffect(() => {
    if (loading || !scrollNext.current) return
    scrollNext.current = false
    const t = setTimeout(() => {
      const win = frameRef.current?.contentWindow, doc = frameRef.current?.contentDocument
      if (!win || !doc) return
      if (sel === 'header' || sel.startsWith('page:')) win.scrollTo({ top: 0, behavior: 'smooth' })
      else if (sel === 'footer') win.scrollTo({ top: doc.body.scrollHeight, behavior: 'smooth' })
      else doc.getElementById(`site-sec-${sel}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => clearTimeout(t)
  }, [sel, loading])

  // Unpublished changes are lost on leaving; say so first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (savedJson && JSON.stringify(c) !== savedJson) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [c, savedJson])

  // By-the-numbers figures for the preview, recounted when the earlier-years fields change.
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => {
      fetch(`/api/org-site/history${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foundedYear: c.foundedYear, priorEvents: c.priorEvents, priorTeams: c.priorTeams }) })
        .then(r => (r.ok ? r.json() : null)).then(h => setHist(h && typeof h.totalGames === 'number' ? h : null)).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [loading, c.foundedYear, c.priorEvents, c.priorTeams])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    // Load once. next-auth hands back a new session object whenever the window regains
    // focus, which re-ran this and replaced unpublished edits with the saved copy: move a
    // section, glance at the live site in another tab, come back, and the move was gone
    // (Bo, Oct 18 2026: "it doesn't seem to be keeping it when I publish").
    if (loadedOnce.current) return
    loadedOnce.current = true
    ;(async () => {
      try {
        if (qOrg) { setOrg({ name: qName, slug: qSlug }) }
        else { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) setOrg({ name: o.name, slug: o.slug }) }
        const d: any = await fetch(`/api/org-site${apiQ}`).then(r => r.ok ? r.json() : {})
        fetch(`/api/tournaments${qOrg ? `?viewOrgId=${encodeURIComponent(qOrg)}` : ''}`).then(r => r.ok ? r.json() : []).then(ts => setTournaments(Array.isArray(ts) ? ts : [])).catch(() => {})
        const loaded: Content = { ...EMPTY, ...d, logo: d.logo || '', hero: { ...EMPTY.hero, ...(d.hero || {}) }, about: { ...EMPTY.about, ...(d.about || {}) }, contact: { ...EMPTY.contact, ...(d.contact || {}) }, socials: { ...EMPTY.socials, ...(d.socials || {}) }, sponsors: Array.isArray(d.sponsors) ? d.sponsors : [], sponsorPitch: { ...EMPTY.sponsorPitch, ...(d.sponsorPitch || {}), benefits: Array.isArray(d.sponsorPitch?.benefits) ? d.sponsorPitch.benefits : [], stats: Array.isArray(d.sponsorPitch?.stats) ? d.sponsorPitch.stats : [] }, pages: Array.isArray(d.pages) ? d.pages : [], gallery: Array.isArray(d.gallery) ? d.gallery.map((g: any) => ({ caption: '', credit: '', tournamentId: '', ...g, id: g.id || uid() })) : [], galleryCovers: (d.galleryCovers && typeof d.galleryCovers === 'object') ? d.galleryCovers : {}, instagram: { ...EMPTY.instagram, ...(d.instagram || {}) } }
        setC(loaded); setSavedJson(JSON.stringify(loaded))
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  // Rehost any inline (data:) image URL to a short /api/img URL so the saved JSON
  // stays small enough to commit (large galleries would otherwise exceed limits).
  async function rehost(url?: string): Promise<string | undefined> {
    if (!url || !url.startsWith('data:')) return url
    try {
      const blob = await (await fetch(url)).blob()
      const u = await uploadImage(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }))
      return u || url
    } catch { return url }
  }

  async function save() {
    setSaving(true)
    try {
      let payload: Content = c
      if (c.gallery.some(g => typeof g.url === 'string' && g.url.startsWith('data:'))) {
        const gallery: Photo[] = []
        for (const g of c.gallery) gallery.push({ ...g, url: (await rehost(g.url)) || g.url })
        payload = { ...c, gallery }
        setC(payload)
      }
      const res = await fetch(`/api/org-site${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) { setSavedJson(JSON.stringify(payload)); toast.success('Published. Your site is up to date.') }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  const movePage = (i: number, dir: -1 | 1) => setC(v => { const a = [...v.pages]; const j = i + dir; if (j < 0 || j >= a.length) return v; [a[i], a[j]] = [a[j], a[i]]; return { ...v, pages: a } })

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>

  const logoImg = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, logo: u })); else toast.error('Upload failed') }
  const heroImg = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, hero: { ...v.hero, imageUrl: u } })); else toast.error('Upload failed') }
  // The cap is per folder, not per gallery: each tournament holds up to 100 photos, and the
  // untagged pile gets its own 100 so a fresh upload batch always has somewhere to land.
  const GALLERY_MAX = 100
  const galCount = (tid: string) => c.gallery.filter(g => (g.tournamentId || '') === tid).length
  const galName = (tid: string) => tid ? (tournaments.find((t: any) => String(t.id) === tid)?.name || 'that tournament') : 'No tournament'

  const galleryAdd = async (files?: FileList | null) => {
    if (!files || !files.length) return
    // Uploading while a tournament is filtered drops the photos straight into it — that's
    // the upload → select all → apply tournament dance the folders were being built with.
    const target = (galFilterT === 'all' || galFilterT === '__other') ? '' : galFilterT
    const room = GALLERY_MAX - galCount(target)
    if (room <= 0) { toast.error(`${galName(target)} is full — ${GALLERY_MAX} photos max per tournament.`); return }
    let list = Array.from(files)
    if (list.length > room) { toast.error(`Only ${room} more photo${room === 1 ? '' : 's'} fit in ${galName(target)} (${GALLERY_MAX} max).`); list = list.slice(0, room) }
    for (const f of list) { const u = await uploadImage(f); if (u) setC(v => ({ ...v, gallery: [...v.gallery, { id: uid(), url: u, caption: '', credit: '', tournamentId: target }] })); else toast.error('Upload failed') }
    if (target) toast.success(`Added to ${galName(target)}.`)
  }

  /** Would moving `moving` photos into `tid` overflow that folder? Returns an error message, or ''. */
  const galMoveError = (tid: string, moving: number) => {
    if (moving <= 0) return ''   // re-tagging photos already in this folder changes nothing
    const room = Math.max(0, GALLERY_MAX - galCount(tid))
    return moving > room
      ? `${galName(tid)} holds ${GALLERY_MAX} photos — room for ${room} more, not ${moving}.`
      : ''
  }
  const galPatch = (id: string, patch: Partial<Photo>) => {
    if (patch.tournamentId !== undefined) {
      const cur = c.gallery.find(g => g.id === id)
      const to = patch.tournamentId || ''
      if (cur && (cur.tournamentId || '') !== to) { const err = galMoveError(to, 1); if (err) { toast.error(err); return } }
    }
    setC(v => ({ ...v, gallery: v.gallery.map(g => g.id === id ? { ...g, ...patch } : g) }))
  }
  const galToggle = (id: string) => setGalSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const galApply = (patch: Partial<Photo>) => {
    if (patch.tournamentId !== undefined) {
      const to = patch.tournamentId || ''
      const moving = c.gallery.filter(g => g.id && galSel.has(g.id) && (g.tournamentId || '') !== to).length
      const err = galMoveError(to, moving); if (err) { toast.error(err); return }
      if (moving > 0) toast.success(`${moving} photo${moving === 1 ? '' : 's'} moved to ${galName(to)}.`)
    }
    setC(v => ({ ...v, gallery: v.gallery.map(g => (g.id && galSel.has(g.id)) ? { ...g, ...patch } : g) }))
  }
  const galSetCover = (g: Photo) => { if (!g.tournamentId || !g.id) return; const tid = g.tournamentId; const pid = g.id; setC(v => ({ ...v, galleryCovers: { ...v.galleryCovers, [tid]: (v.galleryCovers[tid] === pid ? '' : pid) } })) }
  const galKnownIds = new Set(tournaments.map((t: any) => String(t.id)))
  const galView = c.gallery.filter(g => {
    if (galFilterT === '__other') { const tid = g.tournamentId || ''; if (tid && galKnownIds.has(tid)) return false }
    else if (galFilterT !== 'all') { if ((g.tournamentId || '') !== galFilterT) return false }
    const q = galSearch.trim().toLowerCase()
    if (q && !`${g.caption || ''} ${g.credit || ''}`.toLowerCase().includes(q)) return false
    return true
  })

  const pageHeroImg = async (i: number, f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, heroImage: u } : x) })); else toast.error('Upload failed') }

  const eventsPanel = (() => {
        const evToday = new Date().toISOString().slice(0, 10)
        const isAhead = (t: any) => String(t.endDate || t.startDate || '') >= evToday
        const q = evQ.trim().toLowerCase()
        const hit = (t: any) => !q || `${t.name || ''} ${t.location || ''} ${t.startDate || ''}`.toLowerCase().includes(q)
        const byStart = (dir: number) => (a: any, b: any) => dir * String(a.startDate || '').localeCompare(String(b.startDate || ''))
        const upAll = tournaments.filter(isAhead)
        const up = upAll.filter(hit).sort(byStart(1))
        const past = tournaments.filter((t: any) => !isAhead(t)).filter(hit).sort(byStart(-1))
        // Grouped by season or by event. `past` is already newest-first, and first
        // appearance sets each group's position, so seasons come out newest-first and
        // events come out with the most recently run series at the top. The one-off
        // heading is a catch-all rather than a series, so it sorts last wherever its
        // newest member happens to fall.
        const groupOf = (t: any) => evGroup === 'event'
          ? seriesOf(t.name)
          : (String(t.startDate || '').slice(0, 4) || 'Undated')
        const groups: [string, any[]][] = []
        const bucket = new Map<string, any[]>()
        for (const t of past) {
          const k = groupOf(t)
          let arr = bucket.get(k)
          if (!arr) { arr = []; bucket.set(k, arr); groups.push([k, arr]) }
          arr.push(t)
        }
        if (evGroup === 'event') {
          const i = groups.findIndex(g => g[0] === ONE_OFF)
          if (i > -1) groups.push(groups.splice(i, 1)[0])
        }
        const nextId = up.length && !q ? String(up[0].id) : ''

        return (
          <div>
            {tournaments.length === 0 ? <p className="text-sm text-slate-400">No tournaments yet.</p> : (
              <>
                <div className="flex gap-0.5 border-b border-slate-200 mb-3">
                  {([['upcoming', 'Upcoming', up.length], ['past', 'Past', past.length]] as const).map(([key, label, n]) => (
                    <button key={key} type="button" onClick={() => setEvTab(key)} aria-pressed={evTab === key}
                      className={`text-sm font-semibold px-3 py-2 -mb-px border-b-2 transition-colors ${evTab === key ? 'text-teal-700 border-teal-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                      {label} <span className="text-xs font-semibold opacity-60 tabular-nums">{n}</span>
                    </button>
                  ))}
                </div>

                {tournaments.length > 8 && (
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input value={evQ} onChange={e => setEvQ(e.target.value)} placeholder="Search events&hellip;" aria-label="Search events"
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                )}

                {evTab === 'upcoming' && (
                  up.length === 0
                    ? <p className="text-sm text-slate-400 py-2">{q ? 'No upcoming events match that search.' : 'Nothing coming up. Past events are on the other tab.'}</p>
                    : <div className="space-y-2">{up.map((t: any) => <EventRow key={t.id} t={t} next={String(t.id) === nextId} />)}</div>
                )}

                {evTab === 'past' && (
                  <>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xs text-slate-400">Group by</span>
                      {([['year', 'Year'], ['event', 'Event']] as const).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setEvGroup(key)} aria-pressed={evGroup === key}
                          className={`text-xs font-semibold rounded-full px-2.5 py-1 border transition-colors ${evGroup === key ? 'bg-teal-50 text-teal-700 border-teal-200' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {groups.length === 0
                      ? <p className="text-sm text-slate-400 py-2">No past events match that search.</p>
                      : <div className="space-y-1.5">
                          {groups.map(([label, list], i) => {
                            // Newest group open to start; a search opens everything it matched.
                            const open = evOpenGroups[label] ?? (!!q || i === 0)
                            return (
                              <div key={label} className="border border-slate-200 rounded-lg overflow-hidden">
                                <button type="button" onClick={() => setEvOpenGroups(o => ({ ...o, [label]: !open }))} aria-expanded={open}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                                  <span className="text-sm font-semibold text-slate-600">{label}</span>
                                  <span className="ml-auto text-xs text-slate-400 tabular-nums">{list.length}</span>
                                </button>
                                {open && <div className="px-2.5 pb-2.5 space-y-2">{list.map((t: any) => <EventRow key={t.id} t={t} />)}</div>}
                              </div>
                            )
                          })}
                        </div>}
                  </>
                )}
              </>
            )}
          </div>
        )
      })()

  const lay = siteLayout((c as any).layout)
  const setLay = (l: SiteLayout) => setC(v => ({ ...v, layout: l }))
  const moveSec = (k: SiteSectionKey, d: -1 | 1) => {
    const o = [...lay.order]; const i = o.indexOf(k); const j = i + d
    if (i < 0 || j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j], o[i]]; setLay({ ...lay, order: o })
  }
  const toggleSec = (k: SiteSectionKey) => setLay({ ...lay, hidden: lay.hidden.includes(k) ? lay.hidden.filter(x => x !== k) : [...lay.hidden, k] })
  const dirty = !!savedJson && JSON.stringify(c) !== savedJson

  // Preview data, shaped the way /o/[slug] shapes it.
  const today = new Date().toISOString().slice(0, 10)
  const upcoming: HomeTourn[] = tournaments
    .filter((t: any) => String(t.endDate || t.startDate || '') >= today)
    .sort((a: any, b: any) => String(a.startDate || '').localeCompare(String(b.startDate || '')))
    .map((t: any) => ({ id: String(t.id), name: String(t.name || ''), tagline: t.tagline || '', startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || ''), logoUrl: String(t.logoUrl || ''), teamRegEnabled: Number(t.teamRegEnabled) || 0, badge: null }))
  const hasPast = tournaments.some((t: any) => String(t.endDate || t.startDate || '') < today)
  const registerHref = upcoming[0] ? `/tournaments/${upcoming[0].id}/register` : undefined
  const base = org ? `/o/${org.slug}` : ''
  const navPages = c.pages.filter(p => p.title && p.placement !== 'footer')
  const footPages = c.pages.filter(p => p.title && p.placement === 'footer')

  const pi = sel.startsWith('page:') ? Number(sel.slice(5)) : -1
  const selPage = pi >= 0 ? c.pages[pi] : undefined
  const movable = SITE_SECTIONS.find(s => s.key === sel)
  const selTitle = selPage ? (selPage.title || 'Untitled page') : sel === 'header' ? 'Menu & logo' : sel === 'footer' ? 'Contact & footer' : (movable?.label || '')
  const selNote = selPage ? (selPage.placement === 'footer' ? 'Info page · in the footer' : 'Info page · in the menu') : sel === 'header' ? 'Top of every page' : sel === 'footer' ? 'Bottom of every page' : (movable?.note || '')
  const isHidden = !!movable && lay.hidden.includes(movable.key)
  const frameW = device === 'phone' ? '390px' : device === 'tab' ? '820px' : '100%'
  const pickFromList = (k: string) => { scrollNext.current = true; setSel(k) }

  const addPage = () => {
    const idx = c.pages.length
    setC(v => ({ ...v, pages: [...v.pages, { title: '', slug: '', body: '', group: '', heroImage: '', placement: 'nav' }] }))
    setTab('pages'); pickFromList(`page:${idx}`)
  }

  const rowCls = (on: boolean, off?: boolean) => `group/row w-full flex items-center gap-1.5 h-10 pl-2.5 pr-1 rounded-lg border text-sm text-left transition-colors ${on ? 'bg-teal-50 border-teal-200 text-teal-800 font-semibold' : 'border-transparent hover:bg-slate-50'} ${off && !on ? 'text-slate-400' : on ? '' : 'text-slate-700'}`

  const preview = (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Pick k="header" label="Menu & logo" sel={sel} onPick={setSel}>
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
            <span className="flex items-center gap-2.5 min-w-0">
              {c.logo ? <img src={c.logo} alt="" className="h-9 w-auto max-w-[120px] object-contain" /> : null}
              <span className="font-bold text-slate-900 truncate">{org?.name}</span>
            </span>
            <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
              <span>Tournaments</span>{hasPast && <span>Results</span>}{c.gallery.length > 0 && <span>Gallery</span>}
              {navPages.slice(0, 4).map((p, i) => <span key={i}>{p.title}</span>)}
            </nav>
            {registerHref && <span className="ml-auto bg-teal-500 text-white text-sm font-semibold rounded-full px-4 py-2 whitespace-nowrap">Register a team</span>}
          </div>
        </header>
      </Pick>

      {selPage ? (
        <Pick k={sel} label="Info page" sel={sel} onPick={setSel}>
          <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
            {selPage.heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${selPage.heroImage})` }} aria-hidden />}
            {selPage.heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55" aria-hidden />}
            <div className="relative max-w-3xl mx-auto px-6 py-14">
              <span className="text-sm text-teal-200 inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</span>
              <h1 className={`text-4xl sm:text-5xl font-extrabold tracking-tight mt-3${focus === 'pageTitle' ? ' outline-dashed outline-2 outline-teal-300 outline-offset-4 rounded' : ''}`}>{selPage.title || 'Untitled page'}</h1>
            </div>
          </section>
          <main className="max-w-3xl mx-auto px-6 py-12 w-full bg-slate-50">
            {selPage.body
              ? <article className="text-[15px]" dangerouslySetInnerHTML={{ __html: mdToHtml(selPage.body) }} />
              : <p className="text-slate-400">This page has no content yet.</p>}
          </main>
        </Pick>
      ) : (
        <OrgHomeView
          orgName={org?.name || ''} hero={c.hero} about={c.about} foundedYear={c.foundedYear}
          upcoming={upcoming} hasPast={hasPast} hist={hist}
          gallery={c.gallery} spons={sponsorList(c.sponsors)} spitch={c.sponsorPitch}
          ig={c.instagram} igItems={[]} socials={c.socials} base={base} registerHref={registerHref}
          layout={lay} edit={{ selected: sel, focus, onSelect: setSel }} />
      )}

      <div className="flex-1" />
      <Pick k="footer" label="Contact & footer" sel={sel} onPick={setSel}>
        <footer className="bg-[#0b1220] text-slate-300">
          <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-8 justify-between">
            <div className="space-y-1.5 text-sm">
              <div className="font-bold text-white text-base">{org?.name}</div>
              {c.contact.email && <div className={focus === 'email' ? 'outline-dashed outline-2 outline-teal-300 outline-offset-2 rounded' : ''}>{c.contact.email}</div>}
              {c.contact.phone && <div className={focus === 'phone' ? 'outline-dashed outline-2 outline-teal-300 outline-offset-2 rounded' : ''}>{c.contact.phone}</div>}
              {c.contact.address && <div>{c.contact.address}</div>}
              <div className="flex gap-2 pt-2 text-slate-400">
                {c.socials.facebook && <Facebook size={17} />}{c.socials.instagram && <Instagram size={17} />}{c.socials.website && <Globe size={17} />}
              </div>
            </div>
            {footPages.length > 0 && <div className="space-y-2 text-sm text-slate-400">{footPages.map((p, i) => <div key={i}>{p.title}</div>)}</div>}
            <div className="text-sm text-slate-200 sm:text-right">Log in to your account<div className="text-xs text-slate-500 mt-2">Powered by Whistle Ready</div></div>
          </div>
        </footer>
      </Pick>
    </div>
  )

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden lg:h-[calc(100vh-7rem)] lg:min-h-[640px]">
      <Toaster position="top-right" />

      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap px-3 sm:px-4 py-2.5 border-b border-slate-200">
        <Globe size={18} className="text-teal-600" />
        <h1 className="text-base font-bold text-slate-900">Website</h1>
        {org && <span className="text-xs text-slate-400 hidden sm:inline">/o/{org.slug}</span>}
        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg ml-2" role="group" aria-label="Preview size">
          {([['desk', Monitor, 'Desktop'], ['tab', Tablet, 'Tablet'], ['phone', Smartphone, 'Phone']] as const).map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setDevice(k)} title={label} aria-label={label} aria-pressed={device === k}
              className={`h-7 w-8 rounded-md inline-flex items-center justify-center ${device === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><Icon size={15} /></button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {dirty ? 'Changes not published yet' : 'Published'}
        </span>
        <Link href="/dashboard/org/assets" className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><Library size={14} /> <span className="hidden sm:inline">Brand &amp; media</span></Link>
        {org && <Link href={`/o/${org.slug}`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> <span className="hidden sm:inline">View site</span></Link>}
        <button onClick={save} disabled={saving || !dirty} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"><Send size={14} /> {saving ? 'Publishing…' : 'Publish'}</button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left: what's on the site */}
        <aside className="lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-0">
          <div className="grid grid-cols-3 border-b border-slate-100 px-1.5 pt-1.5">
            {([['sections', LayoutTemplate, 'Sections'], ['pages', FileText, 'Pages'], ['events', CalendarDays, 'Events']] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`h-12 flex flex-col items-center justify-center gap-1 text-[11.5px] font-medium border-b-2 ${tab === k ? 'text-teal-700 border-teal-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Icon size={16} />{label}</button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1">
            {tab === 'sections' && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-1 pb-1">Home page</p>
                <button type="button" onClick={() => pickFromList('header')} className={rowCls(sel === 'header')}><span className="flex-1 truncate">Menu &amp; logo</span></button>
                {lay.order.map((k, i) => {
                  const meta = SITE_SECTIONS.find(s => s.key === k)!
                  const off = lay.hidden.includes(k)
                  return (
                    <div key={k} className={rowCls(sel === k, off)}>
                      <button type="button" onClick={() => pickFromList(k)} className="flex-1 min-w-0 h-full text-left truncate">{meta.label}</button>
                      {'auto' in meta && meta.auto && <span className="text-[10px] font-bold text-teal-700 bg-teal-100 rounded-full px-1.5" title="Fills itself from your tournaments">Auto</span>}
                      <span className={`flex items-center ${sel === k ? '' : 'opacity-0 group-hover/row:opacity-100 focus-within:opacity-100'}`}>
                      <button type="button" onClick={() => moveSec(k, -1)} disabled={i === 0} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30" aria-label={`Move ${meta.label} up`}><ChevronUp size={14} /></button>
                      <button type="button" onClick={() => moveSec(k, 1)} disabled={i === lay.order.length - 1} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30" aria-label={`Move ${meta.label} down`}><ChevronDown size={14} /></button>
                      </span>
                      <button type="button" onClick={() => toggleSec(k)} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={off ? `Show ${meta.label}` : `Hide ${meta.label}`} title={off ? 'Hidden. Click to show' : 'Hide on your site'}>{off ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    </div>
                  )
                })}
                <button type="button" onClick={() => pickFromList('footer')} className={rowCls(sel === 'footer')}><span className="flex-1 truncate">Contact &amp; footer</span></button>
                <p className="text-xs text-slate-400 px-1 pt-3 leading-relaxed">Click a section here or on the page to edit it. Arrows move it, the eye hides it.</p>
              </>
            )}
            {tab === 'pages' && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-1 pb-1">Info pages</p>
                {c.pages.length === 0 && <p className="text-sm text-slate-400 px-1">No pages yet.</p>}
                {c.pages.map((p, i) => (
                  <div key={i} className={rowCls(sel === `page:${i}`)}>
                    <button type="button" onClick={() => pickFromList(`page:${i}`)} className="flex-1 min-w-0 h-full text-left truncate">{p.title || 'Untitled page'}</button>
                    {p.placement === 'footer' && <span className="text-[10px] text-slate-400">Footer</span>}
                    <button type="button" onClick={() => { movePage(i, -1); if (sel === `page:${i}` && i > 0) setSel(`page:${i - 1}`) }} disabled={i === 0} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 disabled:opacity-30" aria-label="Move up"><ChevronUp size={14} /></button>
                    <button type="button" onClick={() => { movePage(i, 1); if (sel === `page:${i}` && i < c.pages.length - 1) setSel(`page:${i + 1}`) }} disabled={i === c.pages.length - 1} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-400 hover:bg-slate-200 disabled:opacity-30" aria-label="Move down"><ChevronDown size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={addPage} className="w-full h-10 mt-1 border-2 border-dashed border-slate-300 rounded-lg text-sm font-semibold text-slate-500 hover:border-teal-400 hover:text-teal-700 inline-flex items-center justify-center gap-1.5"><Plus size={15} /> New page</button>
                <p className="text-xs text-slate-400 px-1 pt-3 leading-relaxed">Pages like Directions, Hotels or FAQ. They show in your menu, or footer, in this order.</p>
              </>
            )}
            {tab === 'events' && (
              <div className="px-0.5">
{eventsPanel}
              </div>
            )}
          </div>
        </aside>

        {/* Center: the site, live */}
        <main className="flex-1 min-w-0 bg-slate-100 p-3 sm:p-4 flex flex-col gap-2 h-[70vh] lg:h-auto order-last lg:order-none">
          <div className="flex-1 min-h-0">
            <FramePreview width={frameW} frameRef={frameRef}>{preview}</FramePreview>
          </div>
          <p className="text-xs text-slate-500 text-center">Click any part of the page to edit it. Nothing changes on your live site until you Publish.</p>
        </main>

        {/* Right: the selected part */}
        <aside className="lg:w-[380px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-900 truncate">{selTitle}</h2>
              <p className="text-xs text-slate-500">{isHidden ? 'Hidden on your site' : selNote}</p>
            </div>
            {movable && (
              <button type="button" onClick={() => toggleSec(movable.key)} className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
                {isHidden ? <><Eye size={13} /> Show</> : <><EyeOff size={13} /> Hide</>}
              </button>
            )}
            {selPage && (
              <button type="button" onClick={() => { setC(v => ({ ...v, pages: v.pages.filter((_, j) => j !== pi) })); setSel('hero'); setTab('pages') }} className="text-xs text-slate-400 hover:text-red-600 inline-flex items-center gap-1"><Trash2 size={13} /> Delete</button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {sel === 'header' && (
              <>
        <div className="flex items-center gap-3">
          {c.logo ? <img src={c.logo} alt="" className="h-16 w-16 object-contain rounded-xl border border-slate-200 bg-white" /> : <div className="h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={18} /></div>}
          <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={e => logoImg(e.target.files?.[0])} /></label>
          <GalleryPicker label="From library" onPick={(url) => setC(v => ({ ...v, logo: url }))} />
          {c.logo && <button onClick={() => setC(v => ({ ...v, logo: '' }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
        </div>
        <p className="text-xs text-slate-400 mt-2">Shown in your site header and hero.</p>
                <p className="text-xs text-slate-400 mt-4">The menu lists your tournaments, results, gallery and the pages on the <button type="button" className="text-teal-700 font-semibold" onClick={() => setTab('pages')}>Pages</button> tab by itself.</p>
              </>
            )}
            {sel === 'hero' && (
              <>
        <label className="label">Headline</label>
        <input className="input" value={c.hero.headline} onFocus={() => setFocus('headline')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, hero: { ...v.hero, headline: e.target.value } }))} placeholder={org?.name || 'Your organization'} />
        <label className="label mt-3">Subtext</label>
        <input className="input" value={c.hero.subtext} onFocus={() => setFocus('subtext')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, hero: { ...v.hero, subtext: e.target.value } }))} placeholder="Upcoming events, schedules, standings and registration." />
        <label className="label mt-3">Background image (optional)</label>
        <div className="flex items-center gap-3 mt-1">
          {c.hero.imageUrl ? <img src={c.hero.imageUrl} alt="" className="h-16 w-28 object-cover rounded-lg border border-slate-200" /> : <div className="h-16 w-28 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={18} /></div>}
          <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={e => heroImg(e.target.files?.[0])} /></label>
          <GalleryPicker label="From library" onPick={(url) => setC(v => ({ ...v, hero: { ...v.hero, imageUrl: url } }))} />
          {c.hero.imageUrl && <button onClick={() => setC(v => ({ ...v, hero: { ...v.hero, imageUrl: '' } }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
        </div>
                <p className="text-xs text-slate-400 mt-4">The &ldquo;Next up&rdquo; tag and the Register a team button follow your next tournament by themselves.</p>
              </>
            )}
            {sel === 'events' && (
              <>
                <p className="text-sm text-slate-600 mb-3">Fills itself from your upcoming tournaments: names, dates, places and Register buttons. Add a tournament and it shows up here. To change what an event&rsquo;s own page says, use <b>Edit page</b>.</p>
{eventsPanel}
              </>
            )}
            {sel === 'stats' && (
              <>
                <p className="text-sm text-slate-600 mb-1">Counted from your published results, so these stay current by themselves. The fields below fill in the years before your results went online.</p>
        <label className="label mt-3">Running events since</label>
        <input className="input" inputMode="numeric" maxLength={4} value={c.foundedYear || ''}
          onChange={e => setC(v => ({ ...v, foundedYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
          placeholder="e.g. 1999" />
        <p className="text-xs text-slate-400 mt-2">The year you ran your first event. Shown on the By the Numbers page, which otherwise can only count back to your oldest published results.</p>
        <label className="label mt-4">Events run before your published results begin</label>
        <input className="input" inputMode="numeric" maxLength={4} value={c.priorEvents || ''}
          onChange={e => setC(v => ({ ...v, priorEvents: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
          placeholder="e.g. 18" />
        <p className="text-xs text-slate-400 mt-2">Added to the tournament count only. Games, teams and champions stay counted from your published results, so every other figure on the page can still be checked against a real scoresheet.</p>
        <label className="label mt-4">Roughly how many teams came to those earlier events</label>
        <input className="input" inputMode="numeric" maxLength={6} value={c.priorTeams || ''}
          onChange={e => setC(v => ({ ...v, priorTeams: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) }))}
          placeholder="e.g. 1700" />
        <p className="text-xs text-slate-400 mt-2">An approximation, and shown as one — it appears in a sentence, never in the headline figures, which stay countable against published results.</p>
        <label className="label mt-4">A note in your own words</label>
        <textarea className="input min-h-[90px]" value={c.historyNote || ''}
          onChange={e => setC(v => ({ ...v, historyNote: e.target.value }))}
          placeholder="Something to close the By the Numbers page with — a sentence or two in your voice." />
        <p className="text-xs text-slate-400 mt-2">Shown at the foot of the By the Numbers page, under the figures. End it with a dash and a name (&mdash; Sunshine Events Group) and it renders as an attributed quote. Leave it blank and the page simply ends with the numbers.</p>
              </>
            )}
            {sel === 'about' && (
              <>
        <label className="label">Heading</label>
        <input className="input" value={c.about.heading} onFocus={() => setFocus('aboutHeading')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, about: { ...v.about, heading: e.target.value } }))} placeholder="About us" />
        <label className="label mt-3">Body</label>
        <textarea className="input min-h-[120px]" value={c.about.body} onFocus={() => setFocus('aboutBody')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, about: { ...v.about, body: e.target.value } }))} placeholder="Tell visitors about your organization…" />

                <AiGenerateButton kind="custom" current={c.about.body} onResult={(t) => setC(v => ({ ...v, about: { ...v.about, body: t } }))} />
              </>
            )}
            {sel === 'gallery' && (
              <>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-slate-400">
            {c.gallery.length} photo{c.gallery.length === 1 ? '' : 's'}
            {galFilterT !== 'all' && <> · {galCount(galFilterT === '__other' ? '' : galFilterT)}/{GALLERY_MAX} in {galName(galFilterT === '__other' ? '' : galFilterT)}</>}
          </span>
          <label className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer"><Plus size={14} /> Add photos{galFilterT !== 'all' && galFilterT !== '__other' ? ` to ${galName(galFilterT)}` : ''}<input type="file" accept="image/*" multiple className="hidden" onChange={e => galleryAdd(e.target.files)} /></label>
        </div>
        {c.gallery.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select className="input py-1 text-xs w-48" value={galFilterT} onChange={e => setGalFilterT(e.target.value)}>
              <option value="all">All tournaments</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__other">No tournament</option>
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input py-1 text-xs pl-7 w-48" value={galSearch} onChange={e => setGalSearch(e.target.value)} placeholder="Search caption or credit…" />
            </div>
            {(galFilterT !== 'all' || galSearch.trim()) && <span className="text-xs text-slate-400">Showing {galView.length} of {c.gallery.length}</span>}
          </div>
        )}
        {c.gallery.length === 0 && <p className="text-sm text-slate-400">No photos yet.</p>}
        {galSel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl bg-teal-50 border border-teal-200">
            <span className="text-xs font-semibold text-teal-800">{galSel.size} selected</span>
            <input className="input py-1 text-xs w-40" value={bulkCaption} onChange={e => setBulkCaption(e.target.value)} placeholder="Caption…" />
            <button type="button" onClick={() => galApply({ caption: bulkCaption })} className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white hover:bg-slate-50">Apply caption</button>
            <input className="input py-1 text-xs w-40" value={bulkCredit} onChange={e => setBulkCredit(e.target.value)} placeholder="Photo credit…" />
            <button type="button" onClick={() => galApply({ credit: bulkCredit })} className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white hover:bg-slate-50">Apply credit</button>
            <select className="input py-1 text-xs w-44" value={bulkTourn} onChange={e => setBulkTourn(e.target.value)}>
              <option value="">No tournament</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" onClick={() => galApply({ tournamentId: bulkTourn })} className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white hover:bg-slate-50">Apply tournament</button>
            <button type="button" onClick={() => setGalSel(new Set())} className="text-xs text-slate-500 hover:text-slate-800 ml-auto">Clear</button>
          </div>
        )}
        {c.gallery.length > 0 && (
          <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
            <button type="button" onClick={() => setGalSel(new Set(galView.map(g => g.id!).filter(Boolean)))} className="hover:text-slate-800">Select all</button>
            {galSel.size > 0 && <button type="button" onClick={() => setGalSel(new Set())} className="hover:text-slate-800">Deselect all</button>}
          </div>
        )}
        {c.gallery.length > 0 && galView.length === 0 && <p className="text-sm text-slate-400">No photos match this filter.</p>}
        <div className="grid grid-cols-2 gap-3">
          {galView.map((ph) => { const id = ph.id || ''; const sel = !!id && galSel.has(id); const isCover = !!ph.tournamentId && c.galleryCovers[ph.tournamentId] === id; return (
            <div key={id} className={`border rounded-xl overflow-hidden relative ${sel ? 'border-teal-500 ring-2 ring-teal-200' : 'border-slate-200'}`}>
              <label className="absolute top-1.5 left-1.5 z-10 bg-white/90 rounded p-0.5 cursor-pointer flex"><input type="checkbox" checked={sel} onChange={() => galToggle(id)} /></label>
              {ph.tournamentId && <button type="button" title={isCover ? 'Folder cover' : 'Set as folder cover'} onClick={() => galSetCover(ph)} className={`absolute top-1.5 right-1.5 z-10 rounded p-1 ${isCover ? 'bg-amber-400 text-white' : 'bg-white/90 text-slate-400 hover:text-amber-500'}`}><Star size={13} fill={isCover ? 'currentColor' : 'none'} /></button>}
              <img src={ph.url} alt="" className="w-full h-28 object-cover" />
              <div className="p-2 space-y-1.5">
                <div className="flex items-center gap-1">
                  <input className="input py-1 text-xs flex-1" value={ph.caption} onChange={e => galPatch(id, { caption: e.target.value })} placeholder="Caption (optional)" />
                  <button onClick={() => setC(v => ({ ...v, gallery: v.gallery.filter(x => x.id !== id) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
                <input className="input py-1 text-xs w-full" value={ph.credit || ''} onChange={e => galPatch(id, { credit: e.target.value })} placeholder="Photo credit (optional)" />
                <select className="input py-1 text-xs w-full" value={ph.tournamentId || ''} onChange={e => galPatch(id, { tournamentId: e.target.value })}>
                  <option value="">No tournament</option>
                  {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          )})}
        </div>
              </>
            )}
            {sel === 'sponsors' && (
              <>
        <SponsorsEditor sponsors={c.sponsors} onChange={fn => setC(v => ({ ...v, sponsors: fn(v.sponsors) }))}
          tournaments={tournaments} uploadImage={uploadImage} />

        {/* The button under the partner wall. Shown on the home page always, and on
            event pages when the fuller pitch below is switched off. */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-600 mb-2">The button under the logo wall</p>
          <div className="grid sm:grid-cols-[200px_1fr] gap-2">
            <label className="block text-xs font-semibold text-slate-600">Button
              <input className="input mt-1" value={c.sponsorPitch.wallCtaLabel}
                onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, wallCtaLabel: e.target.value } }))}
                placeholder="Advertise with us" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Line above it
              <input className="input mt-1" value={c.sponsorPitch.wallCtaLine}
                onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, wallCtaLine: e.target.value } }))}
                placeholder="Put your brand in front of every family at our events." />
            </label>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Leave blank for those defaults. The line names the event automatically on event pages.</p>
        </div>

        {/* The pitch that runs under the wall on every event page. Off until it's
            filled in -- an org with nothing to say shouldn't get a half-empty sales
            panel just because the feature shipped. */}
        <div className="mt-6 pt-5 border-t border-slate-200">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={!!c.sponsorPitch.show}
              onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, show: e.target.checked } }))} />
            <span>
              <span className="block font-semibold text-sm text-slate-800">Ask for sponsors on event pages</span>
              <span className="block text-xs text-slate-500 mt-0.5">Adds a short pitch under the partner wall with your reach and what a spot includes, plus a &ldquo;Become a sponsor&rdquo; button into the vendor page&rsquo;s sponsorship form.</span>
            </span>
          </label>

          {c.sponsorPitch.show && (
            <div className="mt-4 space-y-2.5">
              <input className="input w-full" value={c.sponsorPitch.headline}
                onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, headline: e.target.value } }))}
                placeholder="Headline — leave blank for &quot;Put your brand in front of every family at [event].&quot;" />
              <input className="input w-full" value={c.sponsorPitch.sub}
                onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, sub: e.target.value } }))}
                placeholder="One line under the headline" />
              <textarea className="input w-full min-h-[92px]" value={c.sponsorPitch.benefits.join('\n')}
                onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, benefits: e.target.value.split('\n') } }))}
                placeholder={'What a sponsor gets — one per line\nLogo on the live schedule and results pages\nNamed in every confirmation and reminder email'} />
              <p className="text-xs text-slate-400">Leave blank to use the default list. Teams and clubs are counted live from registrations &mdash; add anything else you can stand behind below.</p>
              <div className="space-y-2">
                {c.sponsorPitch.stats.map((st, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input w-32" value={st.value} placeholder="2,400"
                      onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, stats: v.sponsorPitch.stats.map((x, j) => j === i ? { ...x, value: e.target.value } : x) } }))} />
                    <input className="input flex-1" value={st.label} placeholder="Spectators"
                      onChange={e => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, stats: v.sponsorPitch.stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x) } }))} />
                    <button onClick={() => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, stats: v.sponsorPitch.stats.filter((_, j) => j !== i) } }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={() => setC(v => ({ ...v, sponsorPitch: { ...v.sponsorPitch, stats: [...v.sponsorPitch.stats, { value: '', label: '' }] } }))} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add a number</button>
              </div>
            </div>
          )}
        </div>
              </>
            )}
            {sel === 'instagram' && (
              <>
        <p className="text-xs text-slate-400 mb-3">Shows your latest Instagram posts across the bottom of your site. Requires an Instagram <b>Business or Creator</b> account and an access token (see setup guide). Leave blank to hide.</p>
        <div className="grid gap-3">
          <div><label className="label">Username (for the “Follow” link)</label><input className="input" value={c.instagram.username} onChange={e => setC(v => ({ ...v, instagram: { ...v.instagram, username: e.target.value } }))} placeholder="@yourhandle" /></div>
          <div><label className="label">Access token</label><input type="password" className="input" value={c.instagram.token} onChange={e => setC(v => ({ ...v, instagram: { ...v.instagram, token: e.target.value } }))} placeholder="Long-lived Instagram token" /></div>
        </div>
              </>
            )}
            {sel === 'register' && (
              <p className="text-sm text-slate-600">Ends the page with your next tournament and a Register a team button. It updates itself as dates pass, and shows only while an upcoming event takes registrations.</p>
            )}
            {sel === 'footer' && (
              <>
        <div className="grid gap-3">
          <div><label className="label">Email</label><input className="input" value={c.contact.email} onFocus={() => setFocus('email')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, email: e.target.value } }))} placeholder="info@…" /></div>
          <div><label className="label">Phone</label><input className="input" value={c.contact.phone} onFocus={() => setFocus('phone')} onBlur={() => setFocus('')} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, phone: e.target.value } }))} placeholder="(555) 555-5555" /></div>
          <div><label className="label">Hours</label><input className="input" value={c.contact.hours} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, hours: e.target.value } }))} placeholder="Mon–Fri 9–5" /></div>
          <div><label className="label">Address</label><input className="input" value={c.contact.address} onChange={e => setC(v => ({ ...v, contact: { ...v.contact, address: e.target.value } }))} placeholder="City, State" /></div>
          <div><label className="label">Facebook URL</label><input className="input" value={c.socials.facebook} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, facebook: e.target.value } }))} placeholder="https://facebook.com/…" /></div>
          <div><label className="label">Instagram URL</label><input className="input" value={c.socials.instagram} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, instagram: e.target.value } }))} placeholder="https://instagram.com/…" /></div>
          <div><label className="label">Website URL</label><input className="input" value={c.socials.website} onChange={e => setC(v => ({ ...v, socials: { ...v.socials, website: e.target.value } }))} placeholder="https://…" /></div>
        </div>
              </>
            )}
            {selPage && c.pages.map((pg, i) => i !== pi ? null : (
              <div key={i}>
                <label className="label">Page title</label>
                <input className="input" value={pg.title} onFocus={() => setFocus('pageTitle')} onBlur={() => setFocus('')} onChange={e => { const title = e.target.value; setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, title, slug: x.slug || slugify(title) } : x) })) }} placeholder="Page title (e.g. Directions & parking)" />
                <div className="mt-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1 text-xs text-slate-400 flex-1">
                      <span className="whitespace-nowrap">/o/{org?.slug || 'your-org'}/</span>
                      <input className="input py-1 text-xs flex-1" value={pg.slug} onChange={e => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, slug: slugify(e.target.value) } : x) }))} placeholder="directions" />
                    </div>
                    <input className="input py-1 text-xs" value={pg.group || ''} onChange={e => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, group: e.target.value } : x) }))} placeholder={pg.placement === 'footer' ? 'Footer heading (e.g. Guides)' : 'Menu group (optional)'} />
                    <select className="input py-1 text-xs" value={pg.placement || 'nav'} onChange={e => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, placement: e.target.value as 'nav' | 'footer' } : x) }))}>
                      <option value="nav">In the menu</option>
                      <option value="footer">In the footer</option>
                    </select>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {pg.heroImage ? <img src={pg.heroImage} alt="" className="h-12 w-20 object-cover rounded-lg border border-slate-200" /> : <div className="h-12 w-20 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={16} /></div>}
                    <div>
                      <label className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer inline-block">Banner image<input type="file" accept="image/*" className="hidden" onChange={e => pageHeroImg(i, e.target.files?.[0])} /></label>
                      <GalleryPicker label="From library" triggerClassName="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1" onPick={(url) => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, heroImage: url } : x) }))} />
                      {pg.heroImage && <button onClick={() => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, heroImage: '' } : x) }))} className="text-xs text-slate-400 hover:text-red-600 ml-2">Remove</button>}
                      <p className="text-[11px] text-slate-400 mt-1">Optional banner shown behind the page title.</p>
                    </div>
                  </div>
                  <div className="mt-2"><MarkdownField value={pg.body} onChange={val => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, body: val } : x) }))} minHeight={160} placeholder="Page content…" /></div>
                  <AiGenerateButton kind="custom" current={pg.body} onResult={(t) => setC(v => ({ ...v, pages: v.pages.map((x, j) => j === i ? { ...x, body: t } : x) }))} />

                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function OrgSiteEditor() {
  return (
    <Suspense fallback={null}>
      <OrgSiteEditorInner />
    </Suspense>
  )
}
