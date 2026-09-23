'use client'
// Social scheduler — /dashboard/org/social
// Two-week calendar of Instagram/Facebook posts + an approvals board. Anyone on
// staff can draft; only a director/admin can approve (enforced again server-side
// in /api/social/posts/[id]). Approved posts publish automatically via the
// publish cron. Layout follows the approved mockup (Sintra-style tiles, two-week
// calendar, slide-over); colors follow the dashboard's light slate/teal standard.
import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Plus, X, Link2, ThumbsUp, Instagram, Facebook, Image as ImageIcon, Heart, MessageCircle, Send, Check, AlertTriangle, Trash2, RotateCcw, Zap, ListPlus, Clock, ExternalLink, Download } from 'lucide-react'

type Status = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled'
interface Account { id: string; platform: 'instagram' | 'facebook'; label: string; status: string; lastError: string; tokenExpiresAt: string | null }
interface Post {
  id: string; socialAccountId: string; caption: string; mediaUrls: string; scheduledFor: string; status: Status
  approvedByUserId: string; lastError: string; publishedAt: string | null; firstComment: string; groupId: string; permalink: string; importedAt: string | null
  socialAccount?: { id: string; platform: string; label: string; status: string }
}

const STATUS_LABEL: Record<string, string> = { draft: 'Needs approval', scheduled: 'Scheduled', publishing: 'Publishing…', published: 'Published', failed: 'Failed', canceled: 'Canceled' }
const STATUS_TEXT: Record<string, string> = { draft: 'text-amber-700', scheduled: 'text-emerald-700', publishing: 'text-emerald-700', published: 'text-slate-500', failed: 'text-rose-600', canceled: 'text-slate-400' }
const QUICK_TIMES: [number, number][] = [[9, 0], [11, 0], [12, 30], [18, 30]]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
interface QueueSlot { dow: number; h: number; m: number }
interface QueueInfo { slots: QueueSlot[]; tzOffsetMin: number; next: string[] }
interface PostMetrics { reach: number; impressions: number; likes: number; comments: number; saves: number; shares: number; interactions: number; fetchedAt: string }
interface Rollup { reach: number; interactions: number; withData: number; posts: number }
interface Insights { latest: Record<string, PostMetrics>; window: { days: number; current: Rollup; previous: Rollup } | null }
const fmtNum = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString()
const delta = (cur: number, prev: number) => prev > 0 ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%` : ''

const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const fmtLong = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + fmtTime(d)
const toLocalInput = (d: Date) => { const p = (n: number) => (n < 10 ? '0' : '') + n; return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const media = (p: { mediaUrls: string }): string[] => { try { const a = JSON.parse(p.mediaUrls || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }
const firstLine = (s: string) => (s.split('\n').find(l => l.trim()) || 'Untitled').slice(0, 60)

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d
}

function PlatformBadge({ platform, size = 16 }: { platform: string; size?: number }) {
  const ig = platform === 'instagram'
  return <span className={`inline-grid place-items-center rounded-full border-2 border-white ${ig ? 'bg-pink-600' : 'bg-blue-500'}`} style={{ width: size + 4, height: size + 4 }}>{ig ? <Instagram size={size - 6} className="text-white" /> : <Facebook size={size - 6} className="text-white" />}</span>
}

function Thumb({ post }: { post: Post }) {
  const src = media(post)[0]
  return (
    <div className={`relative flex-none w-11 h-11 rounded-xl overflow-hidden grid place-items-center ${src ? 'bg-slate-200' : 'bg-slate-100 border border-dashed border-slate-300 text-slate-400'}`}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={15} />}
      <span className="absolute -right-1 -bottom-1"><PlatformBadge platform={post.socialAccount?.platform || ''} /></span>
    </div>
  )
}

export default function SocialPage() { return <Suspense fallback={<div className="min-h-screen bg-slate-50 p-10 text-center text-slate-400">Loading…</div>}><SocialInner /></Suspense> }

function SocialInner() {
  const { data: session, status } = useSession()
  const router = useRouter(); const search = useSearchParams()
  const role = (session?.user as any)?.role as string | undefined
  const canApprove = role === 'director' || role === 'admin'

  const [posts, setPosts] = useState<Post[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [configured, setConfigured] = useState(true)
  const [queue, setQueue] = useState<QueueInfo>({ slots: [], tzOffsetMin: new Date().getTimezoneOffset(), next: [] })
  const [insights, setInsights] = useState<Insights>({ latest: {}, window: null })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'queue'>('week')
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date()))
  const [drawer, setDrawer] = useState<{ kind: 'post'; id: string; mode: 'preview' | 'edit' } | { kind: 'new'; when: Date } | { kind: 'accounts' } | null>(null)
  const dragId = useRef<string | null>(null)
  const today = new Date()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    load()
  }, [status, session])

  useEffect(() => {
    const c = search.get('connected'); const e = search.get('error')
    if (c) { toast.success(`${c} account${c === '1' ? '' : 's'} connected`); router.replace('/dashboard/org/social') }
    if (e) { toast.error(e); router.replace('/dashboard/org/social') }
  }, [search])

  async function load() {
    try {
      const [p, a, q, ins] = await Promise.all([api('/api/social/posts'), api('/api/social/accounts'), api(`/api/social/queue?tz=${new Date().getTimezoneOffset()}`).catch(() => null), api('/api/social/insights/summary').catch(() => null)])
      setPosts(p.posts || []); setAccounts(a.accounts || []); setConfigured(a.configured !== false)
      if (q) setQueue(q)
      if (ins) setInsights(ins)
    } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
  }

  const byId = (id: string) => posts.find(p => p.id === id)
  const needsReview = posts.filter(p => p.status === 'draft').length
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length
  const published28 = posts.filter(p => p.status === 'published' && p.publishedAt && Date.now() - new Date(p.publishedAt).getTime() < 28 * 864e5).length

  async function patch(id: string, body: any, okMsg?: string) {
    try { await api(`/api/social/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); if (okMsg) toast.success(okMsg); await load(); return true }
    catch (e: any) { toast.error(e.message); return false }
  }
  async function remove(id: string, msg: string) {
    try { await api(`/api/social/posts/${id}`, { method: 'DELETE' }); toast.success(msg); setDrawer(null); await load() } catch (e: any) { toast.error(e.message) }
  }
  async function approve(p: Post) {
    if (new Date(p.scheduledFor) < new Date()) { toast.error('That time has passed — pick a new date first'); setDrawer({ kind: 'post', id: p.id, mode: 'edit' }); return }
    const when = new Date(p.scheduledFor)
    const siblings = p.groupId ? posts.filter(x => x.groupId === p.groupId && x.id !== p.id && x.status === 'draft').length : 0
    if (await patch(p.id, { action: 'approve' }, `Approved${siblings ? ` (+${siblings} more account${siblings === 1 ? '' : 's'})` : ''} — publishes ${fmtDate(when)} at ${fmtTime(when)}`)) setDrawer(null)
  }
  async function moveTo(id: string, day: Date) {
    const p = byId(id); if (!p) return
    if (p.status === 'published' || p.status === 'publishing') { toast.error('Published posts can’t be moved'); return }
    const old = new Date(p.scheduledFor); const nw = new Date(day); nw.setHours(old.getHours(), old.getMinutes(), 0, 0)
    if (nw < new Date()) { toast.error('That day has already passed'); return }
    await patch(id, { scheduledFor: nw.toISOString() }, `Moved to ${fmtDate(nw)} · keeps ${fmtTime(nw)}`)
  }
  async function publishNow(p: Post) {
    try {
      const d = await api(`/api/social/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'publish-now' }) })
      toast.success(d.warning ? `Published — ${d.warning}` : 'Published — it’s live'); setDrawer(null); await load()
    } catch (e: any) { toast.error(e.message); await load() }
  }
  function newPostOn(day: Date) { const d = new Date(day); d.setHours(11, 0, 0, 0); setDrawer({ kind: 'new', when: d }) }

  if (status === 'loading' || loading) return <div className="min-h-screen bg-slate-50 p-10 text-center text-slate-400">Loading…</div>

  const rangeEnd = addDays(rangeStart, 13)
  const rangeLabel = `${rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0)

  return (
    <div className="min-h-screen text-slate-800 bg-slate-50">
      <Toaster position="top-right" />

      {/* top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-slate-500 hover:text-teal-700" title="Home"><ChevronLeft size={18} /></Link>
            <div className="min-w-0"><div className="font-extrabold text-sm leading-tight">Social scheduler</div><div className="text-xs text-slate-500 truncate hidden sm:block">Instagram &amp; Facebook · approve once, it publishes itself</div></div>
          </div>
          <button onClick={() => newPostOn(addDays(today, 1))} disabled={!accounts.length} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-4 py-2.5 disabled:opacity-40"><Plus size={15} strokeWidth={2.8} /> Create post</button>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-5 flex flex-col gap-4">
        {!configured && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-sm px-4 py-3 flex gap-2"><AlertTriangle size={16} className="flex-none mt-0.5" /><span>The Meta app keys aren’t set yet (META_APP_ID / META_APP_SECRET in Vercel). Drafting works; connecting accounts and publishing won’t until they’re added — see SOCIAL-SCHEDULER.md.</span></div>
        )}

        {/* hero tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3">
          <button onClick={() => setView('queue')} className="text-left rounded-2xl p-4 min-h-[120px] flex flex-col justify-between gap-4 bg-gradient-to-br from-teal-600 to-teal-500 text-white shadow-sm hover:brightness-105">
            <div className="flex items-center justify-between"><ThumbsUp size={20} /><span className="w-7 h-7 rounded-full bg-black/15 grid place-items-center"><ChevronRight size={14} /></span></div>
            <div><div className="text-3xl font-extrabold leading-none tabular-nums">{needsReview}</div><div className="font-extrabold">posts to review</div><div className="text-xs opacity-80 mt-0.5">Approve in one tap — nothing publishes without you</div></div>
          </button>
          <button onClick={() => setDrawer({ kind: 'accounts' })} title="Accounts & queue times" className="text-left rounded-2xl p-4 min-h-[120px] flex flex-col justify-between gap-4 bg-white border border-slate-200 hover:border-slate-300 shadow-sm">
            <div className="flex items-center justify-between text-slate-500"><Link2 size={20} /><span className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center"><ChevronRight size={14} /></span></div>
            <div><div className="font-extrabold">{accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} connected` : 'No accounts connected yet'}</div><div className="text-xs text-slate-500 mt-0.5 truncate">{accounts.length ? accounts.map(a => a.label).join(' · ') : 'Connect your Instagram + Facebook to start scheduling'}</div></div>
          </button>
          <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
            {(() => { const w = insights.window; const cur = w?.current; const prev = w?.previous; const has = !!cur && cur.withData > 0
              return <>
                <div className="flex-1 lg:min-w-[150px] rounded-2xl p-4 bg-white border border-slate-200 shadow-sm" title={has ? `${cur!.withData} of ${cur!.posts} posts have insights so far` : 'Shows once the insights snapshot has run (every 4 hours) or after importing history'}>
                  <div className="flex items-baseline gap-2"><span className="text-2xl font-extrabold tabular-nums">{has ? fmtNum(cur!.reach) : '—'}</span>{has && prev && prev.withData > 0 && <span className="text-xs font-bold text-emerald-600">{delta(cur!.reach, prev.reach)}</span>}</div>
                  <div className="text-xs text-slate-500">People reached · {w?.days || 28} days</div>
                </div>
                <div className="flex-1 lg:min-w-[150px] rounded-2xl p-4 bg-white border border-slate-200 shadow-sm" title={`${scheduledCount} scheduled · ${published28} published in 28 days`}>
                  <div className="flex items-baseline gap-2"><span className="text-2xl font-extrabold tabular-nums">{has ? fmtNum(cur!.interactions) : '—'}</span>{has && prev && prev.withData > 0 && <span className="text-xs font-bold text-emerald-600">{delta(cur!.interactions, prev.interactions)}</span>}</div>
                  <div className="text-xs text-slate-500">Interactions · {w?.days || 28} days</div>
                </div>
              </> })()}
          </div>
        </div>

        {/* toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setRangeStart(addDays(rangeStart, -14))} className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Previous two weeks"><ChevronLeft size={15} /></button>
            <h2 className="text-lg sm:text-xl font-extrabold">{rangeLabel}</h2>
            <button onClick={() => setRangeStart(addDays(rangeStart, 14))} className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Next two weeks"><ChevronRight size={15} /></button>
            <button onClick={() => setRangeStart(startOfWeek(new Date()))} className="text-sm font-bold text-slate-600 hover:text-slate-900 px-2">Today</button>
          </div>
          <div className="inline-flex p-1 gap-0.5 rounded-xl bg-slate-100 border border-slate-200">
            {(['week', 'queue'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{v === 'week' ? 'Calendar' : 'Approvals'}</button>)}
          </div>
          <div className="hidden md:flex gap-3 text-xs text-slate-500 items-center"><span><i className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />Needs approval</span><span><i className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />Scheduled</span><span><i className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5" />Published</span><span><i className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5" />Failed</span><span>· Drag a post to another day</span></div>
        </div>

        {/* calendar */}
        {view === 'week' && (
          <div className="flex flex-col gap-3">
            {[0, 1].map(w => (
              <div key={w} className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {Array.from({ length: 7 }, (_, i) => addDays(rangeStart, w * 7 + i)).map(day => {
                  const dayPosts = posts.filter(p => p.status !== 'canceled' && sameDay(new Date(p.scheduledFor), day)).sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor))
                  const isToday = sameDay(day, today); const isPast = day < dayStart
                  return (
                    <div key={+day}
                      onDragOver={e => { if (dragId.current) { e.preventDefault(); e.currentTarget.classList.add('!border-teal-400', '!bg-teal-400/10') } }}
                      onDragLeave={e => e.currentTarget.classList.remove('!border-teal-400', '!bg-teal-400/10')}
                      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('!border-teal-400', '!bg-teal-400/10'); if (dragId.current) moveTo(dragId.current, day); dragId.current = null }}
                      className={`group rounded-2xl p-2.5 flex-col gap-2 md:min-h-[200px] bg-white border transition ${isToday ? 'border-teal-500 shadow-[inset_0_0_0_1px_rgb(20,184,166)]' : 'border-slate-200'} ${isPast ? 'opacity-70' : ''} ${dayPosts.length ? 'flex' : 'hidden md:flex'}`}>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>{day.toLocaleDateString(undefined, { weekday: 'short' })} <span className="text-slate-900">{day.getDate()}</span>{isToday && <span className="text-teal-600"> · Today</span>}</span>
                        {!isPast && accounts.length > 0 && <button onClick={() => newPostOn(day)} className="w-5 h-5 rounded-md border border-dashed border-slate-300 grid place-items-center text-slate-400 md:opacity-0 group-hover:opacity-100 hover:text-slate-900" title="New post this day"><Plus size={11} /></button>}
                      </div>
                      {dayPosts.map(p => (
                        <div key={p.id} draggable={p.status !== 'published' && p.status !== 'publishing'} onDragStart={() => { dragId.current = p.id }} onDragEnd={() => { dragId.current = null }} onClick={() => setDrawer({ kind: 'post', id: p.id, mode: 'preview' })}
                          className="rounded-xl bg-slate-50 border border-slate-200 p-2 flex gap-2 items-center cursor-pointer hover:-translate-y-px hover:border-slate-300 hover:shadow-md transition">
                          <Thumb post={p} />
                          <div className="min-w-0 flex-1"><div className="text-xs font-bold leading-tight line-clamp-2">{firstLine(p.caption)}</div><div className={`text-[11px] font-bold mt-0.5 flex flex-wrap gap-x-1.5 ${STATUS_TEXT[p.status]}`}>{STATUS_LABEL[p.status]}<span className="text-slate-500">{fmtTime(new Date(p.scheduledFor))}</span></div></div>
                        </div>
                      ))}
                      {!dayPosts.length && !isPast && <div className="mt-auto text-[11px] text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">Nothing scheduled</div>}
                    </div>
                  )
                })}
              </div>
            ))}
            {!posts.length && <div className="text-center text-sm text-slate-500 py-6">{accounts.length ? 'No posts yet — hit Create post, or the + on any day.' : 'Connect an account first, then start scheduling.'}</div>}
          </div>
        )}

        {/* approvals board */}
        {view === 'queue' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[{ t: 'Needs approval', f: (p: Post) => p.status === 'draft' }, { t: 'Scheduled', f: (p: Post) => p.status === 'scheduled' || p.status === 'failed' || p.status === 'publishing' }, { t: 'Published', f: (p: Post) => p.status === 'published' }].map(col => {
              const list = posts.filter(col.f).sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor))
              return (
                <div key={col.t} className="rounded-2xl bg-white border border-slate-200 p-3 flex flex-col gap-2.5 min-h-[200px]">
                  <div className="flex items-center justify-between px-1 pb-1 text-sm font-extrabold"><span>{col.t}</span><span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{list.length}</span></div>
                  {!list.length && <div className="text-[11px] text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl">Nothing here</div>}
                  {list.map(p => (
                    <div key={p.id} onClick={() => setDrawer({ kind: 'post', id: p.id, mode: 'preview' })} className="rounded-2xl bg-slate-50 border border-slate-200 p-2.5 flex flex-col gap-2 cursor-pointer hover:border-slate-300">
                      <div className="flex gap-2 items-center"><Thumb post={p} /><div className="min-w-0 flex-1"><div className="text-xs font-bold truncate">{firstLine(p.caption)}</div><div className="text-[11px] text-slate-500">{p.socialAccount?.label} · {fmtDate(new Date(p.scheduledFor))} · {fmtTime(new Date(p.scheduledFor))}</div></div></div>
                      <div className="text-xs text-slate-600 line-clamp-2 whitespace-pre-line">{p.caption}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{p.approvedByUserId ? 'Approved' : p.status === 'draft' ? (canApprove ? 'Waiting on you' : 'Waiting on a director') : ''}</span>
                        {p.status === 'draft' && canApprove && <button onClick={e => { e.stopPropagation(); approve(p) }} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5">Approve</button>}
                        {p.status === 'failed' && <span className="text-[11px] font-bold text-rose-600">Failed · open to retry</span>}
                        {(p.status === 'scheduled' || p.status === 'publishing') && <span className="text-[11px] font-bold text-emerald-700">Auto-publishes</span>}
                        {p.status === 'published' && <span className="text-[11px] font-bold text-slate-500">Live</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pt-2">Publishing checks every 15 minutes. Insights snapshot every 4 hours.</p>
      </div>

      {/* drawer */}
      {drawer && <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setDrawer(null)} />}
      <div className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-200 ${drawer ? 'translate-x-0' : 'translate-x-full'}`}>
        {drawer?.kind === 'post' && byId(drawer.id) && <PostDrawer post={byId(drawer.id)!} metrics={insights.latest[drawer.id]} siblings={posts.filter(x => x.groupId && x.groupId === byId(drawer.id)!.groupId && x.id !== drawer.id)} queue={queue} mode={drawer.mode} setMode={m => setDrawer({ ...drawer, mode: m })} canApprove={canApprove} onClose={() => setDrawer(null)} onApprove={approve} onPublishNow={publishNow} onPatch={patch} onDelete={remove} />}
        {drawer?.kind === 'new' && <ComposeDrawer when={drawer.when} accounts={accounts} queue={queue} canApprove={canApprove} onClose={() => setDrawer(null)} onSaved={async () => { setDrawer(null); await load() }} />}
        {drawer?.kind === 'accounts' && <AccountsDrawer accounts={accounts} configured={configured} queue={queue} canManage={canApprove} onClose={() => setDrawer(null)} onChanged={load} />}
      </div>
    </div>
  )
}

/* ---------------- drawers ---------------- */
function DrawerHead({ title, onClose, children }: { title: string; onClose: () => void; children?: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-200"><h3 className="font-extrabold text-sm">{title}</h3><div className="flex items-center gap-2">{children}<button onClick={onClose} className="w-8 h-8 rounded-lg border border-slate-300 bg-white grid place-items-center text-slate-500 hover:text-slate-900" aria-label="Close"><X size={14} /></button></div></div>
}
const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500'
const labelCls = 'block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5'

function NativePreview({ platform, label, caption, imgSrc, when }: { platform: string; label: string; caption: string; imgSrc?: string; when: Date }) {
  const ig = platform === 'instagram'
  const handle = label.replace(/^@/, '')
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-3 py-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-indigo-500" /><div><div className="text-sm font-extrabold">{handle}</div><div className="text-[11px] text-slate-500">{ig ? 'Instagram post' : `${fmtDate(when)} · Public`}</div></div></div>
      {!ig && <div className="px-3 pb-2.5 text-sm whitespace-pre-wrap leading-snug">{caption || <span className="text-slate-500">No caption yet</span>}</div>}
      <div className={`${ig ? 'aspect-square' : 'aspect-[1.91/1]'} bg-slate-200 grid place-items-center text-slate-500 text-xs tracking-widest`}>{imgSrc ? <img src={imgSrc} alt="" className="w-full h-full object-cover" /> : 'NO PHOTO YET'}</div>
      {ig ? <><div className="flex gap-3.5 px-3 pt-2.5 text-slate-700"><Heart size={20} /><MessageCircle size={20} /><Send size={20} /></div><div className="px-3 pt-1.5 pb-3 text-sm whitespace-pre-wrap leading-snug"><b>{handle}</b> {caption}</div></>
        : <div className="flex justify-around px-3 py-2 border-t border-slate-200 text-xs font-bold text-slate-500"><span>Like</span><span>Comment</span><span>Share</span></div>}
    </div>
  )
}

function UploadBox({ src, onUploaded }: { src?: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  async function pick(f: File) {
    setBusy(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.url) throw new Error(d.error || 'Upload failed')
      // Meta fetches the image by URL, so a data: URL fallback would never publish.
      if (d.inlineFallback || String(d.url).startsWith('data:')) throw new Error('Image storage is unavailable right now — try again in a minute')
      onUploaded(d.url); toast.success('Photo added')
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <div onClick={() => ref.current?.click()} className={`rounded-2xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 cursor-pointer text-center text-xs text-slate-500 ${src ? 'overflow-hidden' : 'p-4'}`}>
      {src ? <img src={src} alt="" className="w-full max-h-56 object-cover block" /> : busy ? 'Uploading…' : 'Click to add the photo (the Canva export)'}
      <input ref={ref} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
    </div>
  )
}

interface EditProps { caption: string; setCaption: (s: string) => void; firstComment: string; setFirstComment: (s: string) => void; when: Date; setWhen: (d: Date) => void; imgSrc?: string; setImg: (u: string) => void; queue: QueueInfo; accounts?: Account[]; acctIds?: string[]; setAcctIds?: (ids: string[]) => void; showFirstComment: boolean }
function EditFields({ caption, setCaption, firstComment, setFirstComment, when, setWhen, imgSrc, setImg, queue, accounts, acctIds, setAcctIds, showFirstComment }: EditProps) {
  const past = when < new Date()
  const nextQueue = queue.next.map(s => new Date(s)).find(d => d > new Date())
  return (
    <>
      {accounts && setAcctIds && (
        <div><label className={labelCls}>Post to</label>
          <div className="flex flex-wrap gap-1.5">{accounts.map(a => { const on = acctIds?.includes(a.id); return (
            <button key={a.id} type="button" onClick={() => setAcctIds(on ? (acctIds || []).filter(x => x !== a.id) : [...(acctIds || []), a.id])} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition ${on ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-500 hover:text-slate-900'}`}>
              <span className={`w-4 h-4 rounded-full grid place-items-center ${a.platform === 'instagram' ? 'bg-pink-600' : 'bg-blue-500'}`}>{a.platform === 'instagram' ? <Instagram size={10} className="text-white" /> : <Facebook size={10} className="text-white" />}</span>{a.label}{on && <Check size={12} />}
            </button>) })}</div>
          {(acctIds?.length || 0) > 1 && <div className="text-[11px] text-slate-500 mt-1.5">One post per account — approving one approves the set.</div>}
        </div>
      )}
      <div><label className={labelCls}>Photo</label><UploadBox src={imgSrc} onUploaded={setImg} /></div>
      <div><label className={labelCls}>Caption</label><textarea value={caption} onChange={e => setCaption(e.target.value)} maxLength={2200} rows={5} className={inputCls + ' resize-y leading-snug'} placeholder="Write the caption…" /><div className="text-right text-[11px] text-slate-500 mt-1 tabular-nums">{caption.length}/2200</div></div>
      <div>
        <label className={labelCls}>Publish date</label>
        <input type="datetime-local" value={toLocalInput(when)} onChange={e => e.target.value && setWhen(new Date(e.target.value))} className={inputCls + (past ? ' !border-rose-400 !bg-rose-50' : '')} />
        {past && <div className="text-xs font-bold text-rose-600 mt-1.5">This date has passed. Pick a new one.</div>}
        <div className="flex flex-wrap gap-1.5 mt-2">{nextQueue && <button type="button" onClick={() => setWhen(nextQueue)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${+when === +nextQueue ? 'border-teal-500 text-teal-700 bg-teal-50' : 'border-teal-300 text-teal-700 hover:bg-teal-50'}`}><ListPlus size={12} /> Next queue slot · {fmtDate(nextQueue)} {fmtTime(nextQueue)}</button>}{QUICK_TIMES.map(([h, m]) => { const d = new Date(when); d.setHours(h, m, 0, 0); const on = when.getHours() === h && when.getMinutes() === m; return <button key={`${h}:${m}`} type="button" onClick={() => setWhen(d)} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${on ? 'border-teal-500 text-teal-700 bg-teal-50' : 'border-slate-300 text-slate-500 hover:text-slate-900'}`}>{fmtTime(d)}</button> })}</div>
      </div>
      {showFirstComment && <div><label className={labelCls}>First comment <span className="normal-case tracking-normal font-semibold text-slate-400">· hashtags go here, posted right after publish</span></label><textarea value={firstComment} onChange={e => setFirstComment(e.target.value)} maxLength={2200} rows={2} className={inputCls + ' resize-y leading-snug'} placeholder="#lacrosse #floridalacrosse #monstermash" /></div>}
    </>
  )
}

function PostDrawer({ post, metrics, siblings, queue, mode, setMode, canApprove, onClose, onApprove, onPublishNow, onPatch, onDelete }: { post: Post; metrics?: PostMetrics; siblings: Post[]; queue: QueueInfo; mode: 'preview' | 'edit'; setMode: (m: 'preview' | 'edit') => void; canApprove: boolean; onClose: () => void; onApprove: (p: Post) => void; onPublishNow: (p: Post) => Promise<void>; onPatch: (id: string, body: any, msg?: string) => Promise<boolean>; onDelete: (id: string, msg: string) => void }) {
  const [caption, setCaption] = useState(post.caption)
  const [firstComment, setFirstComment] = useState(post.firstComment || '')
  const [confirmNow, setConfirmNow] = useState(false); const [publishing, setPublishing] = useState(false)
  const [when, setWhen] = useState(new Date(post.scheduledFor))
  const [img, setImg] = useState<string | undefined>(media(post)[0])
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { setCaption(post.caption); setFirstComment(post.firstComment || ''); setWhen(new Date(post.scheduledFor)); setImg(media(post)[0]); setConfirmDel(false); setConfirmNow(false) }, [post.id, post.status, post.caption, post.scheduledFor, post.mediaUrls, post.firstComment])
  const a = post.socialAccount || { platform: 'instagram', label: '' }
  const editable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed'
  const dirty = caption !== post.caption || firstComment !== (post.firstComment || '') || +when !== +new Date(post.scheduledFor) || img !== media(post)[0]
  const save = () => onPatch(post.id, { caption, firstComment, scheduledFor: when.toISOString(), mediaUrls: img ? [img] : [] }, 'Saved')
  const draftSiblings = siblings.filter(s => s.status === 'draft').length
  const statusLine = post.status === 'draft' ? <div className="rounded-xl bg-amber-50 text-amber-800 text-xs font-bold px-3 py-2.5">Needs approval · scheduled for {fmtLong(when)}</div>
    : post.status === 'scheduled' ? <div className="rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-2.5 flex gap-2"><Check size={14} className="flex-none mt-px" />Approved · publishes automatically {fmtLong(when)}</div>
    : post.status === 'failed' ? <div className="rounded-xl bg-rose-50 text-rose-700 text-xs font-bold px-3 py-2.5">{post.lastError || 'Publish failed'}</div>
    : post.status === 'published' ? <div className="rounded-xl bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2.5 flex items-center gap-2 flex-wrap"><span>Published {post.publishedAt ? fmtLong(new Date(post.publishedAt)) : ''}{post.importedAt ? ' · imported' : ''}</span>{post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-teal-700 hover:underline">Open on {a.platform === 'instagram' ? 'Instagram' : 'Facebook'} <ExternalLink size={12} /></a>}</div>
    : <div className="rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-2.5">Publishing right now…</div>
  return (
    <>
      <DrawerHead title={`${STATUS_LABEL[post.status]} · ${a.platform === 'instagram' ? 'Instagram' : 'Facebook'}`} onClose={onClose}>
        {editable && <div className="inline-flex p-1 gap-0.5 rounded-xl bg-slate-100 border border-slate-200">{(['preview', 'edit'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded-lg text-xs font-bold capitalize ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{m}</button>)}</div>}
      </DrawerHead>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
        {statusLine}
        {mode === 'preview' || !editable ? <NativePreview platform={a.platform} label={a.label} caption={caption} imgSrc={img} when={when} />
          : <EditFields caption={caption} setCaption={setCaption} firstComment={firstComment} setFirstComment={setFirstComment} when={when} setWhen={setWhen} imgSrc={img} setImg={setImg} queue={queue} showFirstComment />}
        {post.status === 'published' && (metrics
          ? <div className="grid grid-cols-4 gap-2">{[['Reached', metrics.reach], ['Likes', metrics.likes], ['Comments', metrics.comments], [a.platform === 'instagram' ? 'Saves' : 'Shares', a.platform === 'instagram' ? metrics.saves : metrics.shares]].map(([l, v]) => <div key={String(l)} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"><div className="text-lg font-extrabold tabular-nums">{fmtNum(Number(v))}</div><div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{l}</div></div>)}<div className="col-span-4 text-[11px] text-slate-500">Insights as of {fmtDate(new Date(metrics.fetchedAt))} {fmtTime(new Date(metrics.fetchedAt))} · refreshes every 4 hours</div></div>
          : <div className="text-xs text-slate-500">No insights yet — the next snapshot runs within 4 hours.</div>)}
        {mode === 'preview' && post.firstComment && <div className="text-xs text-slate-400"><span className="font-bold text-slate-500 uppercase tracking-wide text-[10px] mr-1.5">First comment</span>{post.firstComment}</div>}
        {siblings.length > 0 && <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600 flex flex-wrap items-center gap-2"><span className="font-bold text-slate-700">Also going to</span>{siblings.map(s => <span key={s.id} className="inline-flex items-center gap-1"><PlatformBadge platform={s.socialAccount?.platform || ''} size={12} />{s.socialAccount?.label} <span className={STATUS_TEXT[s.status]}>· {STATUS_LABEL[s.status]}</span></span>)}</div>}
        {!img && editable && <div className="text-xs text-slate-500">A photo is required — Instagram won’t accept a text-only post, and the automation will mark this failed without one.</div>}
      </div>
      <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap gap-2">
        {post.status === 'draft' && canApprove && <button onClick={async () => { if (dirty && !(await save())) return; onApprove({ ...post, scheduledFor: when.toISOString() }) }} disabled={!img || when < new Date()} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 disabled:opacity-40">Approve &amp; schedule{draftSiblings ? ` · ${draftSiblings + 1} accounts` : ''}</button>}
        {editable && canApprove && img && !confirmNow && <button onClick={() => setConfirmNow(true)} className="rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-sm px-3 py-2.5 inline-flex items-center gap-1.5" title="Publish this instant instead of waiting for the scheduled time"><Zap size={14} /> Publish now</button>}
        {editable && canApprove && confirmNow && <span className="inline-flex items-center gap-2 text-xs"><span className="text-slate-700 font-bold">Post to {a.label} right now?</span><button disabled={publishing} onClick={async () => { setPublishing(true); if (dirty && !(await save())) { setPublishing(false); return } await onPublishNow(post); setPublishing(false) }} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 disabled:opacity-50">{publishing ? 'Publishing…' : 'Yes, publish'}</button><button onClick={() => setConfirmNow(false)} className="text-slate-500 font-bold px-2">Not yet</button></span>}
        {post.status === 'failed' && canApprove && <button onClick={async () => { if (dirty && !(await save())) return; const at = when < new Date() ? new Date(Date.now() + 5 * 60000) : when; if (await onPatch(post.id, { action: 'retry', scheduledFor: at.toISOString() }, `Re-queued for ${fmtDate(at)} ${fmtTime(at)}`)) onClose() }} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-4 py-2.5 inline-flex items-center gap-1.5"><RotateCcw size={14} /> Retry</button>}
        {editable && dirty && <button onClick={async () => { if (await save()) setMode('preview') }} className="rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-sm px-4 py-2.5">Save changes</button>}
        {post.status === 'scheduled' && canApprove && <button onClick={() => onPatch(post.id, { action: 'unapprove' }, 'Moved back to needs approval').then(ok => ok && onClose())} className="rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-sm px-4 py-2.5">Unapprove</button>}
        {editable && !confirmDel && <button onClick={() => setConfirmDel(true)} className="rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-sm px-3 py-2.5 inline-flex items-center gap-1.5 ml-auto"><Trash2 size={14} /> {post.status === 'draft' ? 'Decline' : 'Delete'}</button>}
        {editable && confirmDel && <span className="ml-auto inline-flex items-center gap-2 text-xs"><span className="text-slate-600">Remove this post?</span><button onClick={() => onDelete(post.id, 'Removed')} className="rounded-lg bg-rose-500 text-white font-bold px-3 py-1.5">Yes, remove</button><button onClick={() => setConfirmDel(false)} className="text-slate-500 font-bold px-2">Keep</button></span>}
        {!editable && <button onClick={onClose} className="rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm px-4 py-2.5 ml-auto">Close</button>}
      </div>
    </>
  )
}

function ComposeDrawer({ when: init, accounts, queue, canApprove, onClose, onSaved }: { when: Date; accounts: Account[]; queue: QueueInfo; canApprove: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [caption, setCaption] = useState(''); const [firstComment, setFirstComment] = useState(''); const [when, setWhen] = useState(init); const [img, setImg] = useState<string | undefined>(); const [acctIds, setAcctIds] = useState<string[]>(accounts.map(a => a.id)); const [busy, setBusy] = useState(false)
  const nextQueue = queue.next.map(s => new Date(s)).find(d => d > new Date())
  async function create(approve: boolean, at: Date = when) {
    if (!acctIds.length) { toast.error('Pick at least one account'); return }
    if (!caption.trim()) { toast.error('Add a caption first'); return }
    if (!img) { toast.error('Add a photo — Instagram and Facebook both need one'); return }
    if (at < new Date()) { toast.error('Pick a future date'); return }
    setBusy(true)
    try {
      const d = await api('/api/social/posts', { method: 'POST', body: JSON.stringify({ socialAccountIds: acctIds, caption, firstComment, mediaUrls: [img], scheduledFor: at.toISOString() }) })
      const n = acctIds.length; const acctNote = n > 1 ? ` on ${n} accounts` : ''
      if (approve) { await api(`/api/social/posts/${d.post.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }); toast.success(`Scheduled${acctNote} — publishes ${fmtDate(at)} at ${fmtTime(at)}`) }
      else toast.success(`Saved${acctNote} — waiting on approval`)
      await onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <DrawerHead title="New post" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
        <EditFields caption={caption} setCaption={setCaption} firstComment={firstComment} setFirstComment={setFirstComment} when={when} setWhen={setWhen} imgSrc={img} setImg={setImg} queue={queue} accounts={accounts} acctIds={acctIds} setAcctIds={setAcctIds} showFirstComment={accounts.some(a => acctIds.includes(a.id) && a.platform === 'instagram')} />
        <div className="rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs px-3 py-2.5 flex gap-2"><AlertTriangle size={14} className="flex-none mt-px" />{canApprove ? 'Save as a draft to review later, or approve now and it publishes itself at the scheduled time.' : 'Saves as a draft. A director approves it before the automation will publish it.'}</div>
      </div>
      <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap gap-2">
        <button onClick={() => create(false)} disabled={busy} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-4 py-2.5 disabled:opacity-50">Save as draft</button>
        {canApprove && <button onClick={() => create(true)} disabled={busy} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 disabled:opacity-50">Save &amp; approve</button>}
        {nextQueue && <button onClick={() => create(canApprove, nextQueue)} disabled={busy} title={`Next open queue slot: ${fmtDate(nextQueue)} ${fmtTime(nextQueue)}`} className="rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-sm px-3 py-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"><ListPlus size={14} /> Add to queue</button>}
        <button onClick={onClose} className="rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm px-4 py-2.5 ml-auto">Cancel</button>
      </div>
    </>
  )
}

function AccountsDrawer({ accounts, configured, queue, canManage, onClose, onChanged }: { accounts: Account[]; configured: boolean; queue: QueueInfo; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  async function importHistory() {
    setImporting(true)
    try {
      const d = await api('/api/social/import-history', { method: 'POST', body: JSON.stringify({ limit: 60 }) })
      const errs = (d.accounts || []).filter((a: any) => a.error)
      toast.success(d.imported ? `Imported ${d.imported} post${d.imported === 1 ? '' : 's'} · ${d.snapshotted} with insights` : 'Nothing new to import — already up to date')
      errs.forEach((a: any) => toast.error(`${a.account}: ${a.error}`))
      await onChanged()
    } catch (e: any) { toast.error(e.message) } finally { setImporting(false) }
  }
  const [slots, setSlots] = useState<QueueSlot[]>(queue.slots)
  const [savingSlots, setSavingSlots] = useState(false)
  useEffect(() => { setSlots(queue.slots) }, [queue.slots])
  const slotsDirty = JSON.stringify(slots) !== JSON.stringify(queue.slots)
  async function saveSlots() {
    setSavingSlots(true)
    try { await api('/api/social/queue', { method: 'PUT', body: JSON.stringify({ slots, tzOffsetMin: new Date().getTimezoneOffset() }) }); toast.success('Queue times saved'); await onChanged() } catch (e: any) { toast.error(e.message) } finally { setSavingSlots(false) }
  }
  async function disconnect(id: string) {
    try { await api(`/api/social/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); toast.success('Disconnected — its scheduled posts moved back to needs approval'); setConfirmId(null); await onChanged() } catch (e: any) { toast.error(e.message) }
  }
  return (
    <>
      <DrawerHead title="Accounts & queue times" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <div className={labelCls}>Connected accounts</div>
        {!accounts.length && <div className="text-sm text-slate-500">Nothing connected yet.</div>}
        {accounts.map(a => {
          const days = a.tokenExpiresAt ? Math.round((new Date(a.tokenExpiresAt).getTime() - Date.now()) / 864e5) : null
          const healthy = a.status === 'active'
          return (
            <div key={a.id} className="rounded-2xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl grid place-items-center flex-none ${a.platform === 'instagram' ? 'bg-pink-600' : 'bg-blue-500'}`}>{a.platform === 'instagram' ? <Instagram size={18} className="text-white" /> : <Facebook size={18} className="text-white" />}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-extrabold truncate">{a.label}</div><div className="text-[11px] text-slate-500 truncate">{a.platform === 'instagram' ? 'Instagram' : 'Facebook Page'}{days !== null ? ` · access renews in ${days} days` : ''}{!healthy && a.lastError ? ` · ${a.lastError}` : ''}</div></div>
              <span className={`text-[11px] font-bold ${healthy ? 'text-emerald-700' : 'text-rose-600'}`}>{healthy ? 'Healthy' : a.status}</span>
              {canManage && (confirmId === a.id
                ? <button onClick={() => disconnect(a.id)} className="text-[11px] font-bold rounded-lg bg-rose-500 text-white px-2 py-1">Confirm</button>
                : <button onClick={() => setConfirmId(a.id)} className="text-slate-400 hover:text-rose-600" title="Disconnect"><X size={15} /></button>)}
            </div>
          )
        })}
        {canManage && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-extrabold mb-1">{accounts.length ? 'Add another account' : 'Connect Instagram + Facebook'}</div>
            <div className="text-xs text-slate-500 mb-3">You’ll be sent to Meta to sign in as the Page admin. Every Page you manage (and the Instagram account linked to it) gets connected. Because these are your own accounts there’s no app-review wait.</div>
            {configured ? <a href="/api/social/connect" className="inline-flex rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-4 py-2.5">Continue with Meta</a>
              : <div className="text-xs text-amber-800">Add META_APP_ID and META_APP_SECRET in Vercel first — see SOCIAL-SCHEDULER.md.</div>}
          </div>
        )}
        {canManage && accounts.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1"><div className="text-sm font-extrabold">Import post history</div><div className="text-xs text-slate-500">Pulls the last 60 posts from each account into the calendar, with reach and likes, so insights cover everything — not just posts made here. Safe to run again; it only adds what's new.</div></div>
            <button onClick={importHistory} disabled={importing} className="rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs px-3 py-2 inline-flex items-center gap-1.5 flex-none disabled:opacity-50"><Download size={13} /> {importing ? 'Importing…' : 'Import'}</button>
          </div>
        )}
        <div className={labelCls + ' mt-3'}>Queue times</div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
          <div className="text-xs text-slate-500 flex gap-2"><Clock size={14} className="flex-none mt-px" /><span>"Add to queue" drops a post into the next one of these that's still open. Times are in your local time zone.</span></div>
          {slots.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={s.dow} disabled={!canManage} onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, dow: +e.target.value } : x))} className={inputCls + ' !w-auto !py-1.5'}>{DOW.map((d, di) => <option key={di} value={di}>{d}</option>)}</select>
              <input type="time" disabled={!canManage} value={`${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); if (!isNaN(h)) setSlots(slots.map((x, j) => j === i ? { ...x, h, m: m || 0 } : x)) }} className={inputCls + ' !w-auto !py-1.5'} />
              {canManage && <button onClick={() => setSlots(slots.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 ml-auto" title="Remove"><X size={15} /></button>}
            </div>
          ))}
          {canManage && <div className="flex gap-2 pt-1"><button onClick={() => setSlots([...slots, { dow: 2, h: 11, m: 0 }])} className="rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold px-3 py-1.5 inline-flex items-center gap-1"><Plus size={12} /> Add time</button>{slotsDirty && <button onClick={saveSlots} disabled={savingSlots || !slots.length} className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50">{savingSlots ? 'Saving…' : 'Save queue times'}</button>}</div>}
          {queue.next.length > 0 && <div className="text-[11px] text-slate-500 pt-1">Next open: {queue.next.slice(0, 3).map(s => `${fmtDate(new Date(s))} ${fmtTime(new Date(s))}`).join(' · ')}</div>}
        </div>
      </div>
      <div className="px-4 py-3 border-t border-slate-200 flex"><button onClick={onClose} className="rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm px-4 py-2.5 ml-auto">Close</button></div>
    </>
  )
}
