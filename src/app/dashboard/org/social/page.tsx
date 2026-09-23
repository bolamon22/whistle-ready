'use client'
// Social scheduler — /dashboard/org/social
// Two-week calendar of Instagram/Facebook posts + an approvals board. Anyone on
// staff can draft; only a director/admin can approve (enforced again server-side
// in /api/social/posts/[id]). Approved posts publish automatically via the
// publish cron. Design follows the mockup Bo approved (dark glass, Sintra-style):
// this page deliberately runs dark even though the rest of the dashboard is light.
import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Plus, X, Link2, ThumbsUp, Instagram, Facebook, Image as ImageIcon, Heart, MessageCircle, Send, Check, AlertTriangle, Trash2, RotateCcw } from 'lucide-react'

type Status = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'canceled'
interface Account { id: string; platform: 'instagram' | 'facebook'; label: string; status: string; lastError: string; tokenExpiresAt: string | null }
interface Post {
  id: string; socialAccountId: string; caption: string; mediaUrls: string; scheduledFor: string; status: Status
  approvedByUserId: string; lastError: string; publishedAt: string | null
  socialAccount?: { id: string; platform: string; label: string; status: string }
}

const STATUS_LABEL: Record<string, string> = { draft: 'Needs approval', scheduled: 'Scheduled', publishing: 'Publishing…', published: 'Published', failed: 'Failed', canceled: 'Canceled' }
const STATUS_TEXT: Record<string, string> = { draft: 'text-amber-300', scheduled: 'text-emerald-300', publishing: 'text-emerald-300', published: 'text-slate-400', failed: 'text-rose-300', canceled: 'text-slate-500' }
const QUICK_TIMES: [number, number][] = [[9, 0], [11, 0], [12, 30], [18, 30]]

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
  return <span className={`inline-grid place-items-center rounded-full border-2 border-[#151a24] ${ig ? 'bg-pink-600' : 'bg-blue-500'}`} style={{ width: size + 4, height: size + 4 }}>{ig ? <Instagram size={size - 6} className="text-white" /> : <Facebook size={size - 6} className="text-white" />}</span>
}

function Thumb({ post }: { post: Post }) {
  const src = media(post)[0]
  return (
    <div className={`relative flex-none w-11 h-11 rounded-xl overflow-hidden grid place-items-center ${src ? 'bg-slate-800' : 'bg-white/5 border border-dashed border-white/15 text-slate-500'}`}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={15} />}
      <span className="absolute -right-1 -bottom-1"><PlatformBadge platform={post.socialAccount?.platform || ''} /></span>
    </div>
  )
}

export default function SocialPage() { return <Suspense fallback={<div className="min-h-screen bg-[#0c0f16] p-10 text-center text-slate-400">Loading…</div>}><SocialInner /></Suspense> }

function SocialInner() {
  const { data: session, status } = useSession()
  const router = useRouter(); const search = useSearchParams()
  const role = (session?.user as any)?.role as string | undefined
  const canApprove = role === 'director' || role === 'admin'

  const [posts, setPosts] = useState<Post[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [configured, setConfigured] = useState(true)
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
      const [p, a] = await Promise.all([api('/api/social/posts'), api('/api/social/accounts')])
      setPosts(p.posts || []); setAccounts(a.accounts || []); setConfigured(a.configured !== false)
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
    if (await patch(p.id, { action: 'approve' }, `Approved — publishes ${fmtDate(when)} at ${fmtTime(when)}`)) setDrawer(null)
  }
  async function moveTo(id: string, day: Date) {
    const p = byId(id); if (!p) return
    if (p.status === 'published' || p.status === 'publishing') { toast.error('Published posts can’t be moved'); return }
    const old = new Date(p.scheduledFor); const nw = new Date(day); nw.setHours(old.getHours(), old.getMinutes(), 0, 0)
    if (nw < new Date()) { toast.error('That day has already passed'); return }
    await patch(id, { scheduledFor: nw.toISOString() }, `Moved to ${fmtDate(nw)} · keeps ${fmtTime(nw)}`)
  }
  function newPostOn(day: Date) { const d = new Date(day); d.setHours(11, 0, 0, 0); setDrawer({ kind: 'new', when: d }) }

  if (status === 'loading' || loading) return <div className="min-h-screen bg-[#0c0f16] p-10 text-center text-slate-400">Loading…</div>

  const rangeEnd = addDays(rangeStart, 13)
  const rangeLabel = `${rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0)

  return (
    <div className="min-h-screen text-slate-100 bg-[#0c0f16] [background-image:radial-gradient(900px_520px_at_8%_-10%,rgba(45,212,191,0.14),transparent_60%),radial-gradient(800px_500px_at_100%_10%,rgba(99,102,241,0.12),transparent_60%)]">
      <Toaster position="top-right" toastOptions={{ style: { background: '#151a24', color: '#eef2f8', border: '1px solid rgba(255,255,255,0.1)' } }} />

      {/* top bar */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0c0f16]/80 backdrop-blur-xl">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-slate-400 hover:text-teal-300" title="Home"><ChevronLeft size={18} /></Link>
            <div className="min-w-0"><div className="font-extrabold text-sm leading-tight">Social scheduler</div><div className="text-xs text-slate-500 truncate hidden sm:block">Instagram &amp; Facebook · approve once, it publishes itself</div></div>
          </div>
          <button onClick={() => newPostOn(addDays(today, 1))} disabled={!accounts.length} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-400 text-[#062a27] font-bold text-sm px-4 py-2.5 hover:brightness-105 disabled:opacity-40"><Plus size={15} strokeWidth={2.8} /> Create post</button>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 py-5 flex flex-col gap-4">
        {!configured && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-100 text-sm px-4 py-3 flex gap-2"><AlertTriangle size={16} className="flex-none mt-0.5" /><span>The Meta app keys aren’t set yet (META_APP_ID / META_APP_SECRET in Vercel). Drafting works; connecting accounts and publishing won’t until they’re added — see SOCIAL-SCHEDULER.md.</span></div>
        )}

        {/* hero tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3">
          <button onClick={() => setView('queue')} className="text-left rounded-2xl p-4 min-h-[120px] flex flex-col justify-between gap-4 bg-gradient-to-br from-teal-400 to-teal-200 text-[#062a27] hover:brightness-105">
            <div className="flex items-center justify-between"><ThumbsUp size={20} /><span className="w-7 h-7 rounded-full bg-black/15 grid place-items-center"><ChevronRight size={14} /></span></div>
            <div><div className="text-3xl font-extrabold leading-none tabular-nums">{needsReview}</div><div className="font-extrabold">posts to review</div><div className="text-xs opacity-70 mt-0.5">Approve in one tap — nothing publishes without you</div></div>
          </button>
          <button onClick={() => setDrawer({ kind: 'accounts' })} className="text-left rounded-2xl p-4 min-h-[120px] flex flex-col justify-between gap-4 bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur">
            <div className="flex items-center justify-between text-slate-300"><Link2 size={20} /><span className="w-7 h-7 rounded-full bg-white/10 grid place-items-center"><ChevronRight size={14} /></span></div>
            <div><div className="font-extrabold">{accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} connected` : 'No accounts connected yet'}</div><div className="text-xs text-slate-500 mt-0.5 truncate">{accounts.length ? accounts.map(a => a.label).join(' · ') : 'Connect your Instagram + Facebook to start scheduling'}</div></div>
          </button>
          <div className="flex gap-3 sm:col-span-2 lg:col-span-1">
            <div className="flex-1 lg:min-w-[150px] rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-2xl font-extrabold tabular-nums">{scheduledCount}</div><div className="text-xs text-slate-500">Scheduled &amp; waiting</div></div>
            <div className="flex-1 lg:min-w-[150px] rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-2xl font-extrabold tabular-nums">{published28}</div><div className="text-xs text-slate-500">Published · 28 days</div></div>
          </div>
        </div>

        {/* toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setRangeStart(addDays(rangeStart, -14))} className="w-8 h-8 rounded-lg border border-white/15 bg-white/5 grid place-items-center text-slate-300 hover:text-white" aria-label="Previous two weeks"><ChevronLeft size={15} /></button>
            <h2 className="text-lg sm:text-xl font-extrabold">{rangeLabel}</h2>
            <button onClick={() => setRangeStart(addDays(rangeStart, 14))} className="w-8 h-8 rounded-lg border border-white/15 bg-white/5 grid place-items-center text-slate-300 hover:text-white" aria-label="Next two weeks"><ChevronRight size={15} /></button>
            <button onClick={() => setRangeStart(startOfWeek(new Date()))} className="text-sm font-bold text-slate-300 hover:text-white px-2">Today</button>
          </div>
          <div className="inline-flex p-1 gap-0.5 rounded-xl bg-white/10 border border-white/10">
            {(['week', 'queue'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view === v ? 'bg-[#151a24] text-white shadow' : 'text-slate-400'}`}>{v === 'week' ? 'Calendar' : 'Approvals'}</button>)}
          </div>
          <div className="hidden md:flex gap-3 text-xs text-slate-500 items-center"><span><i className="inline-block w-2 h-2 rounded-full bg-amber-300 mr-1.5" />Needs approval</span><span><i className="inline-block w-2 h-2 rounded-full bg-emerald-300 mr-1.5" />Scheduled</span><span><i className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5" />Published</span><span><i className="inline-block w-2 h-2 rounded-full bg-rose-300 mr-1.5" />Failed</span><span>· Drag a post to another day</span></div>
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
                      className={`group rounded-2xl p-2.5 flex-col gap-2 md:min-h-[200px] bg-white/5 border transition ${isToday ? 'border-teal-400 shadow-[inset_0_0_0_1px_rgba(45,212,191,1)]' : 'border-white/10'} ${isPast ? 'opacity-70' : ''} ${dayPosts.length ? 'flex' : 'hidden md:flex'}`}>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>{day.toLocaleDateString(undefined, { weekday: 'short' })} <span className="text-slate-100">{day.getDate()}</span>{isToday && <span className="text-teal-300"> · Today</span>}</span>
                        {!isPast && accounts.length > 0 && <button onClick={() => newPostOn(day)} className="w-5 h-5 rounded-md border border-dashed border-white/20 grid place-items-center text-slate-500 md:opacity-0 group-hover:opacity-100 hover:text-white" title="New post this day"><Plus size={11} /></button>}
                      </div>
                      {dayPosts.map(p => (
                        <div key={p.id} draggable={p.status !== 'published' && p.status !== 'publishing'} onDragStart={() => { dragId.current = p.id }} onDragEnd={() => { dragId.current = null }} onClick={() => setDrawer({ kind: 'post', id: p.id, mode: 'preview' })}
                          className="rounded-xl bg-[#151a24] border border-white/10 p-2 flex gap-2 items-center cursor-pointer hover:-translate-y-px hover:border-white/20 hover:shadow-xl transition">
                          <Thumb post={p} />
                          <div className="min-w-0 flex-1"><div className="text-xs font-bold leading-tight line-clamp-2">{firstLine(p.caption)}</div><div className={`text-[11px] font-bold mt-0.5 flex flex-wrap gap-x-1.5 ${STATUS_TEXT[p.status]}`}>{STATUS_LABEL[p.status]}<span className="text-slate-500">{fmtTime(new Date(p.scheduledFor))}</span></div></div>
                        </div>
                      ))}
                      {!dayPosts.length && !isPast && <div className="mt-auto text-[11px] text-slate-600 text-center py-3 border border-dashed border-white/10 rounded-xl">Nothing scheduled</div>}
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
                <div key={col.t} className="rounded-2xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2.5 min-h-[200px]">
                  <div className="flex items-center justify-between px-1 pb-1 text-sm font-extrabold"><span>{col.t}</span><span className="text-xs text-slate-400 bg-white/10 rounded-full px-2 py-0.5">{list.length}</span></div>
                  {!list.length && <div className="text-[11px] text-slate-600 text-center py-4 border border-dashed border-white/10 rounded-xl">Nothing here</div>}
                  {list.map(p => (
                    <div key={p.id} onClick={() => setDrawer({ kind: 'post', id: p.id, mode: 'preview' })} className="rounded-2xl bg-[#151a24] border border-white/10 p-2.5 flex flex-col gap-2 cursor-pointer hover:border-white/20">
                      <div className="flex gap-2 items-center"><Thumb post={p} /><div className="min-w-0 flex-1"><div className="text-xs font-bold truncate">{firstLine(p.caption)}</div><div className="text-[11px] text-slate-500">{p.socialAccount?.label} · {fmtDate(new Date(p.scheduledFor))} · {fmtTime(new Date(p.scheduledFor))}</div></div></div>
                      <div className="text-xs text-slate-400 line-clamp-2 whitespace-pre-line">{p.caption}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{p.approvedByUserId ? 'Approved' : p.status === 'draft' ? (canApprove ? 'Waiting on you' : 'Waiting on a director') : ''}</span>
                        {p.status === 'draft' && canApprove && <button onClick={e => { e.stopPropagation(); approve(p) }} className="rounded-lg bg-emerald-400 text-[#05261b] text-xs font-bold px-3 py-1.5">Approve</button>}
                        {p.status === 'failed' && <span className="text-[11px] font-bold text-rose-300">Failed · open to retry</span>}
                        {(p.status === 'scheduled' || p.status === 'publishing') && <span className="text-[11px] font-bold text-emerald-300">Auto-publishes</span>}
                        {p.status === 'published' && <span className="text-[11px] font-bold text-slate-400">Live</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-slate-600 pt-2">Publishing checks every 15 minutes. Insights snapshot every 4 hours.</p>
      </div>

      {/* drawer */}
      {drawer && <div className="fixed inset-0 z-40 bg-black/55" onClick={() => setDrawer(null)} />}
      <div className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] bg-[#151a24] border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-200 ${drawer ? 'translate-x-0' : 'translate-x-full'}`}>
        {drawer?.kind === 'post' && byId(drawer.id) && <PostDrawer post={byId(drawer.id)!} mode={drawer.mode} setMode={m => setDrawer({ ...drawer, mode: m })} canApprove={canApprove} onClose={() => setDrawer(null)} onApprove={approve} onPatch={patch} onDelete={remove} />}
        {drawer?.kind === 'new' && <ComposeDrawer when={drawer.when} accounts={accounts} canApprove={canApprove} onClose={() => setDrawer(null)} onSaved={async () => { setDrawer(null); await load() }} />}
        {drawer?.kind === 'accounts' && <AccountsDrawer accounts={accounts} configured={configured} canManage={canApprove} onClose={() => setDrawer(null)} onChanged={load} />}
      </div>
    </div>
  )
}

/* ---------------- drawers ---------------- */
function DrawerHead({ title, onClose, children }: { title: string; onClose: () => void; children?: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-white/10"><h3 className="font-extrabold text-sm">{title}</h3><div className="flex items-center gap-2">{children}<button onClick={onClose} className="w-8 h-8 rounded-lg border border-white/15 bg-white/5 grid place-items-center text-slate-300 hover:text-white" aria-label="Close"><X size={14} /></button></div></div>
}
const inputCls = 'w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5'

function NativePreview({ platform, label, caption, imgSrc, when }: { platform: string; label: string; caption: string; imgSrc?: string; when: Date }) {
  const ig = platform === 'instagram'
  const handle = label.replace(/^@/, '')
  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
      <div className="flex items-center gap-2.5 px-3 py-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-indigo-500" /><div><div className="text-sm font-extrabold">{handle}</div><div className="text-[11px] text-slate-500">{ig ? 'Instagram post' : `${fmtDate(when)} · Public`}</div></div></div>
      {!ig && <div className="px-3 pb-2.5 text-sm whitespace-pre-wrap leading-snug">{caption || <span className="text-slate-500">No caption yet</span>}</div>}
      <div className={`${ig ? 'aspect-square' : 'aspect-[1.91/1]'} bg-slate-800 grid place-items-center text-slate-500 text-xs tracking-widest`}>{imgSrc ? <img src={imgSrc} alt="" className="w-full h-full object-cover" /> : 'NO PHOTO YET'}</div>
      {ig ? <><div className="flex gap-3.5 px-3 pt-2.5 text-slate-300"><Heart size={20} /><MessageCircle size={20} /><Send size={20} /></div><div className="px-3 pt-1.5 pb-3 text-sm whitespace-pre-wrap leading-snug"><b>{handle}</b> {caption}</div></>
        : <div className="flex justify-around px-3 py-2 border-t border-white/10 text-xs font-bold text-slate-500"><span>Like</span><span>Comment</span><span>Share</span></div>}
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
    <div onClick={() => ref.current?.click()} className={`rounded-2xl border-[1.5px] border-dashed border-white/20 bg-white/5 cursor-pointer text-center text-xs text-slate-500 ${src ? 'overflow-hidden' : 'p-4'}`}>
      {src ? <img src={src} alt="" className="w-full max-h-56 object-cover block" /> : busy ? 'Uploading…' : 'Click to add the photo (the Canva export)'}
      <input ref={ref} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
    </div>
  )
}

interface EditProps { caption: string; setCaption: (s: string) => void; when: Date; setWhen: (d: Date) => void; imgSrc?: string; setImg: (u: string) => void; accounts?: Account[]; acctId?: string; setAcct?: (id: string) => void }
function EditFields({ caption, setCaption, when, setWhen, imgSrc, setImg, accounts, acctId, setAcct }: EditProps) {
  const past = when < new Date()
  return (
    <>
      <div><label className={labelCls}>Photo</label><UploadBox src={imgSrc} onUploaded={setImg} /></div>
      <div><label className={labelCls}>Caption</label><textarea value={caption} onChange={e => setCaption(e.target.value)} maxLength={2200} rows={5} className={inputCls + ' resize-y leading-snug'} placeholder="Write the caption…" /><div className="text-right text-[11px] text-slate-500 mt-1 tabular-nums">{caption.length}/2200</div></div>
      <div>
        <label className={labelCls}>Publish date</label>
        <input type="datetime-local" value={toLocalInput(when)} onChange={e => e.target.value && setWhen(new Date(e.target.value))} className={inputCls + (past ? ' !border-rose-400 !bg-rose-400/10' : '')} />
        {past && <div className="text-xs font-bold text-rose-300 mt-1.5">This date has passed. Pick a new one.</div>}
        <div className="flex flex-wrap gap-1.5 mt-2">{QUICK_TIMES.map(([h, m]) => { const d = new Date(when); d.setHours(h, m, 0, 0); const on = when.getHours() === h && when.getMinutes() === m; return <button key={`${h}:${m}`} type="button" onClick={() => setWhen(d)} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${on ? 'border-teal-400 text-teal-300' : 'border-white/15 text-slate-400 hover:text-white'}`}>{fmtTime(d)}</button> })}</div>
      </div>
      {accounts && setAcct && <div><label className={labelCls}>Account</label><select value={acctId} onChange={e => setAcct(e.target.value)} className={inputCls}>{accounts.map(a => <option key={a.id} value={a.id}>{a.platform === 'instagram' ? 'Instagram · ' : 'Facebook · '}{a.label}</option>)}</select></div>}
    </>
  )
}

function PostDrawer({ post, mode, setMode, canApprove, onClose, onApprove, onPatch, onDelete }: { post: Post; mode: 'preview' | 'edit'; setMode: (m: 'preview' | 'edit') => void; canApprove: boolean; onClose: () => void; onApprove: (p: Post) => void; onPatch: (id: string, body: any, msg?: string) => Promise<boolean>; onDelete: (id: string, msg: string) => void }) {
  const [caption, setCaption] = useState(post.caption)
  const [when, setWhen] = useState(new Date(post.scheduledFor))
  const [img, setImg] = useState<string | undefined>(media(post)[0])
  const [confirmDel, setConfirmDel] = useState(false)
  useEffect(() => { setCaption(post.caption); setWhen(new Date(post.scheduledFor)); setImg(media(post)[0]); setConfirmDel(false) }, [post.id, post.status, post.caption, post.scheduledFor, post.mediaUrls])
  const a = post.socialAccount || { platform: 'instagram', label: '' }
  const editable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed'
  const dirty = caption !== post.caption || +when !== +new Date(post.scheduledFor) || img !== media(post)[0]
  const save = () => onPatch(post.id, { caption, scheduledFor: when.toISOString(), mediaUrls: img ? [img] : [] }, 'Saved')
  const statusLine = post.status === 'draft' ? <div className="rounded-xl bg-amber-400/15 text-amber-200 text-xs font-bold px-3 py-2.5">Needs approval · scheduled for {fmtLong(when)}</div>
    : post.status === 'scheduled' ? <div className="rounded-xl bg-emerald-400/15 text-emerald-200 text-xs font-bold px-3 py-2.5 flex gap-2"><Check size={14} className="flex-none mt-px" />Approved · publishes automatically {fmtLong(when)}</div>
    : post.status === 'failed' ? <div className="rounded-xl bg-rose-400/15 text-rose-200 text-xs font-bold px-3 py-2.5">{post.lastError || 'Publish failed'}</div>
    : post.status === 'published' ? <div className="rounded-xl bg-white/10 text-slate-300 text-xs font-bold px-3 py-2.5">Published {post.publishedAt ? fmtLong(new Date(post.publishedAt)) : ''}</div>
    : <div className="rounded-xl bg-emerald-400/15 text-emerald-200 text-xs font-bold px-3 py-2.5">Publishing right now…</div>
  return (
    <>
      <DrawerHead title={`${STATUS_LABEL[post.status]} · ${a.platform === 'instagram' ? 'Instagram' : 'Facebook'}`} onClose={onClose}>
        {editable && <div className="inline-flex p-1 gap-0.5 rounded-xl bg-white/10 border border-white/10">{(['preview', 'edit'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded-lg text-xs font-bold capitalize ${mode === m ? 'bg-[#0c0f16] text-white' : 'text-slate-400'}`}>{m}</button>)}</div>}
      </DrawerHead>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
        {statusLine}
        {mode === 'preview' || !editable ? <NativePreview platform={a.platform} label={a.label} caption={caption} imgSrc={img} when={when} />
          : <EditFields caption={caption} setCaption={setCaption} when={when} setWhen={setWhen} imgSrc={img} setImg={setImg} />}
        {!img && editable && <div className="text-xs text-slate-500">A photo is required — Instagram won’t accept a text-only post, and the automation will mark this failed without one.</div>}
      </div>
      <div className="px-4 py-3 border-t border-white/10 flex flex-wrap gap-2">
        {post.status === 'draft' && canApprove && <button onClick={async () => { if (dirty && !(await save())) return; onApprove({ ...post, scheduledFor: when.toISOString() }) }} disabled={!img || when < new Date()} className="rounded-xl bg-emerald-400 text-[#05261b] font-bold text-sm px-4 py-2.5 disabled:opacity-40">Approve &amp; schedule</button>}
        {post.status === 'failed' && canApprove && <button onClick={async () => { if (dirty && !(await save())) return; const at = when < new Date() ? new Date(Date.now() + 5 * 60000) : when; if (await onPatch(post.id, { action: 'retry', scheduledFor: at.toISOString() }, `Re-queued for ${fmtDate(at)} ${fmtTime(at)}`)) onClose() }} className="rounded-xl bg-teal-400 text-[#062a27] font-bold text-sm px-4 py-2.5 inline-flex items-center gap-1.5"><RotateCcw size={14} /> Retry</button>}
        {editable && dirty && <button onClick={async () => { if (await save()) setMode('preview') }} className="rounded-xl bg-white/10 border border-white/15 font-bold text-sm px-4 py-2.5">Save changes</button>}
        {post.status === 'scheduled' && canApprove && <button onClick={() => onPatch(post.id, { action: 'unapprove' }, 'Moved back to needs approval').then(ok => ok && onClose())} className="rounded-xl bg-white/10 border border-white/15 font-bold text-sm px-4 py-2.5">Unapprove</button>}
        {editable && !confirmDel && <button onClick={() => setConfirmDel(true)} className="rounded-xl text-rose-300 hover:bg-rose-400/10 font-bold text-sm px-3 py-2.5 inline-flex items-center gap-1.5 ml-auto"><Trash2 size={14} /> {post.status === 'draft' ? 'Decline' : 'Delete'}</button>}
        {editable && confirmDel && <span className="ml-auto inline-flex items-center gap-2 text-xs"><span className="text-slate-400">Remove this post?</span><button onClick={() => onDelete(post.id, 'Removed')} className="rounded-lg bg-rose-500 text-white font-bold px-3 py-1.5">Yes, remove</button><button onClick={() => setConfirmDel(false)} className="text-slate-400 font-bold px-2">Keep</button></span>}
        {!editable && <button onClick={onClose} className="rounded-xl text-slate-300 hover:bg-white/10 font-bold text-sm px-4 py-2.5 ml-auto">Close</button>}
      </div>
    </>
  )
}

function ComposeDrawer({ when: init, accounts, canApprove, onClose, onSaved }: { when: Date; accounts: Account[]; canApprove: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [caption, setCaption] = useState(''); const [when, setWhen] = useState(init); const [img, setImg] = useState<string | undefined>(); const [acct, setAcct] = useState(accounts[0]?.id || ''); const [busy, setBusy] = useState(false)
  async function create(approve: boolean) {
    if (!caption.trim()) { toast.error('Add a caption first'); return }
    if (!img) { toast.error('Add a photo — Instagram and Facebook both need one'); return }
    if (when < new Date()) { toast.error('Pick a future date'); return }
    setBusy(true)
    try {
      const d = await api('/api/social/posts', { method: 'POST', body: JSON.stringify({ socialAccountId: acct, caption, mediaUrls: [img], scheduledFor: when.toISOString() }) })
      if (approve) { await api(`/api/social/posts/${d.post.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }); toast.success(`Scheduled — publishes ${fmtDate(when)} at ${fmtTime(when)}`) }
      else toast.success('Saved — waiting on approval')
      await onSaved()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <DrawerHead title="New post" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
        <EditFields caption={caption} setCaption={setCaption} when={when} setWhen={setWhen} imgSrc={img} setImg={setImg} accounts={accounts} acctId={acct} setAcct={setAcct} />
        <div className="rounded-xl bg-teal-400/10 border border-teal-400/25 text-teal-200 text-xs px-3 py-2.5 flex gap-2"><AlertTriangle size={14} className="flex-none mt-px" />{canApprove ? 'Save as a draft to review later, or approve now and it publishes itself at the scheduled time.' : 'Saves as a draft. A director approves it before the automation will publish it.'}</div>
      </div>
      <div className="px-4 py-3 border-t border-white/10 flex flex-wrap gap-2">
        <button onClick={() => create(false)} disabled={busy} className="rounded-xl bg-teal-400 text-[#062a27] font-bold text-sm px-4 py-2.5 disabled:opacity-50">Save as draft</button>
        {canApprove && <button onClick={() => create(true)} disabled={busy} className="rounded-xl bg-emerald-400 text-[#05261b] font-bold text-sm px-4 py-2.5 disabled:opacity-50">Save &amp; approve</button>}
        <button onClick={onClose} className="rounded-xl text-slate-300 hover:bg-white/10 font-bold text-sm px-4 py-2.5 ml-auto">Cancel</button>
      </div>
    </>
  )
}

function AccountsDrawer({ accounts, configured, canManage, onClose, onChanged }: { accounts: Account[]; configured: boolean; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  async function disconnect(id: string) {
    try { await api(`/api/social/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); toast.success('Disconnected — its scheduled posts moved back to needs approval'); setConfirmId(null); await onChanged() } catch (e: any) { toast.error(e.message) }
  }
  return (
    <>
      <DrawerHead title="Connected accounts" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {!accounts.length && <div className="text-sm text-slate-400">Nothing connected yet.</div>}
        {accounts.map(a => {
          const days = a.tokenExpiresAt ? Math.round((new Date(a.tokenExpiresAt).getTime() - Date.now()) / 864e5) : null
          const healthy = a.status === 'active'
          return (
            <div key={a.id} className="rounded-2xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl grid place-items-center flex-none ${a.platform === 'instagram' ? 'bg-pink-600' : 'bg-blue-500'}`}>{a.platform === 'instagram' ? <Instagram size={18} className="text-white" /> : <Facebook size={18} className="text-white" />}</span>
              <div className="min-w-0 flex-1"><div className="text-sm font-extrabold truncate">{a.label}</div><div className="text-[11px] text-slate-500 truncate">{a.platform === 'instagram' ? 'Instagram' : 'Facebook Page'}{days !== null ? ` · access renews in ${days} days` : ''}{!healthy && a.lastError ? ` · ${a.lastError}` : ''}</div></div>
              <span className={`text-[11px] font-bold ${healthy ? 'text-emerald-300' : 'text-rose-300'}`}>{healthy ? 'Healthy' : a.status}</span>
              {canManage && (confirmId === a.id
                ? <button onClick={() => disconnect(a.id)} className="text-[11px] font-bold rounded-lg bg-rose-500 text-white px-2 py-1">Confirm</button>
                : <button onClick={() => setConfirmId(a.id)} className="text-slate-500 hover:text-rose-300" title="Disconnect"><X size={15} /></button>)}
            </div>
          )
        })}
        {canManage && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-extrabold mb-1">{accounts.length ? 'Add another account' : 'Connect Instagram + Facebook'}</div>
            <div className="text-xs text-slate-500 mb-3">You’ll be sent to Meta to sign in as the Page admin. Every Page you manage (and the Instagram account linked to it) gets connected. Because these are your own accounts there’s no app-review wait.</div>
            {configured ? <a href="/api/social/connect" className="inline-flex rounded-xl bg-teal-400 text-[#062a27] font-bold text-sm px-4 py-2.5">Continue with Meta</a>
              : <div className="text-xs text-amber-200">Add META_APP_ID and META_APP_SECRET in Vercel first — see SOCIAL-SCHEDULER.md.</div>}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-white/10 flex"><button onClick={onClose} className="rounded-xl text-slate-300 hover:bg-white/10 font-bold text-sm px-4 py-2.5 ml-auto">Close</button></div>
    </>
  )
}
