'use client'
// Insights tab of the social scheduler — the "dive deeper" view behind the
// 28-day reach tile. Everything comes from GET /api/social/insights/report (stored
// snapshots only, no live Meta calls), so switching period/account is instant-ish.
// Chart rules follow the dataviz skill: one series per chart in the dashboard's
// teal, IG/FB identity in their platform colors (validated pair), hover tooltips on
// every mark, and every finding states its sample size.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Instagram, Facebook, RefreshCw, TrendingUp, Film, Image as ImageIcon, Clock, ArrowUpDown, ExternalLink } from 'lucide-react'

type Totals = { posts: number; measured: number; reach: number; interactions: number; likes: number; comments: number; saves: number; shares: number; engagementRate: number | null; avgReach: number | null }
type Group = Totals & { key: string }
type Row = { id: string; platform: string; account: string; publishedAt: string; format: 'reel' | 'video' | 'photo' | 'story' | 'carousel'; caption: string; thumb: string; permalink: string; reach: number; views: number; likes: number; comments: number; saves: number; shares: number; interactions: number; engagementRate: number | null; fetchedAt: string | null }
type Report = { days: number; monthly: boolean; current: Totals; previous: Totals; trend: { key: string; reach: number; interactions: number; posts: number }[]; byPlatform: Group[]; byFormat: Group[]; byWeekday: Group[]; bySlot: Group[]; posts: Row[]; lastSnapshot: string | null }

const TEAL = '#0d9488', TEAL_HOVER = '#0f766e'
const PLATFORM_COLOR: Record<string, string> = { instagram: '#db2777', facebook: '#2563eb' } // validated pair (dataviz validator, light)
const FORMAT_LABEL: Record<string, string> = { reel: 'Reels', photo: 'Photos', carousel: 'Carousels', video: 'Videos', story: 'Stories' }
const FORMAT_ONE: Record<string, string> = { reel: 'Reel', photo: 'Photo', carousel: 'Carousel', video: 'Video', story: 'Story' }
const SLOT_LABEL: Record<string, string> = { morning: 'Morning · before 11', midday: 'Midday · 11–2', afternoon: 'Afternoon · 2–6', evening: 'Evening · after 6' }
const PERIODS: [number, string][] = [[7, '7 days'], [28, '28 days'], [90, '90 days'], [365, '12 months']]

const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : Math.round(n).toLocaleString()
const pct = (x: number | null, dp = 1) => x == null ? '—' : `${(x * 100).toFixed(dp)}%`
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtDayYr = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function Delta({ cur, prev, kind = 'pct', label }: { cur: number | null; prev: number | null; kind?: 'pct' | 'pts'; label: string }) {
  if (cur == null || prev == null || (kind === 'pct' && prev === 0)) return <div className="text-[11px] text-slate-400">No prior {label} to compare</div>
  const d = kind === 'pct' ? (cur - prev) / prev : (cur - prev) * 100
  const up = d > 0.0005, down = d < -0.0005
  const txt = kind === 'pct' ? `${Math.abs(d * 100).toFixed(0)}%` : `${Math.abs(d).toFixed(1)} pts`
  return <div className={`text-[11px] font-bold ${up ? 'text-emerald-700' : down ? 'text-rose-600' : 'text-slate-500'}`}>{up ? '▲' : down ? '▼' : '='} {up || down ? txt : 'flat'} <span className="font-medium text-slate-400">vs prior {label}</span></div>
}

function Tile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex flex-col gap-1 min-w-0 h-full">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums text-slate-900 leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      {children}
    </div>
  )
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(Math.max(260, Math.floor(e[0].contentRect.width))))
    ro.observe(ref.current); return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

// Column chart: reach per week/month. Columns ≤24px, 4px rounded tops, square base,
// hairline grid, a full-band hit target per column so hover is easy.
function TrendChart({ data, monthly }: { data: Report['trend']; monthly: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 190, padL = 44, padR = 8, padT = 12, padB = 26
  const max = Math.max(1, ...data.map(d => d.reach))
  const step = max <= 5 ? 1 : Math.pow(10, Math.floor(Math.log10(max)))
  const niceMax = Math.ceil(max / step) * step
  const ticks = [0, niceMax / 2, niceMax]
  const band = (width - padL - padR) / Math.max(1, data.length)
  const barW = Math.min(24, Math.max(3, band * 0.6))
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax)
  const label = (k: string) => monthly ? new Date(`${k}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' }) : new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const every = Math.ceil(data.length / Math.max(1, Math.floor((width - padL) / 56)))
  const h = hover != null ? data[hover] : null
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={`Reach by ${monthly ? 'month' : 'week'}`}>
        {ticks.map(t => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748b" className="tabular-nums">{compact(t)}</text></g>)}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2; const top = y(d.reach); const bh = H - padB - top
          const r = Math.min(4, bh / 2, barW / 2)
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
              <rect x={padL + band * i} y={padT} width={band} height={H - padT - padB} fill="transparent" />
              {d.reach > 0 && <path d={`M${cx - barW / 2},${H - padB} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${H - padB} Z`} fill={hover === i ? TEAL_HOVER : TEAL} />}
              {d.reach === 0 && d.posts === 0 && <line x1={cx - barW / 2} x2={cx + barW / 2} y1={H - padB} y2={H - padB} stroke="#cbd5e1" strokeWidth={2} />}
              {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">{label(d.key)}</text>}
            </g>
          )
        })}
      </svg>
      {h && hover != null && (
        <div className="pointer-events-none absolute z-10 rounded-lg bg-slate-900 text-white text-xs px-2.5 py-1.5 shadow-lg whitespace-nowrap" style={{ left: Math.min(width - 150, Math.max(0, padL + band * hover + band / 2 - 70)), top: Math.max(0, y(h.reach) - 58) }}>
          <div className="font-bold">{monthly ? label(h.key) : `Week of ${label(h.key)}`}</div>
          <div className="tabular-nums">{h.reach.toLocaleString()} reached · {h.interactions.toLocaleString()} interactions</div>
          <div className="text-slate-300">{h.posts} post{h.posts === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  )
}

// Horizontal bars for small breakdowns. Value at the tip in text ink; bar color
// carries identity only where identity exists (platform), teal otherwise.
function BarList({ items, metric, colorOf, fmt, note }: { items: { key: string; label: ReactNode; value: number; n: number; extra?: string }[]; metric: string; colorOf?: (k: string) => string; fmt: (v: number) => string; note?: string }) {
  const max = Math.max(1e-9, ...items.map(i => i.value))
  const [hover, setHover] = useState<string | null>(null)
  if (!items.length) return <div className="text-xs text-slate-400 py-4">No posts in this period.</div>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map(it => (
        <div key={it.key} onMouseEnter={() => setHover(it.key)} onMouseLeave={() => setHover(null)} className="grid grid-cols-[96px_1fr] items-center gap-2" title={`${metric}: ${fmt(it.value)} · ${it.n} post${it.n === 1 ? '' : 's'}${it.extra ? ` · ${it.extra}` : ''}`}>
          <div className="text-xs font-semibold text-slate-700 truncate">{it.label}</div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-[18px] rounded-r-[4px] transition-[width]" style={{ width: `${Math.max(2, (it.value / max) * 72)}%`, background: colorOf ? colorOf(it.key) : TEAL, opacity: hover && hover !== it.key ? 0.55 : 1 }} />
            <div className="text-xs tabular-nums text-slate-700 whitespace-nowrap"><b>{fmt(it.value)}</b> <span className="text-slate-400">· n={it.n}</span></div>
          </div>
        </div>
      ))}
      {note && <div className="text-[11px] text-slate-400 pt-1">{note}</div>}
    </div>
  )
}

function Card({ title, sub, children, className = '' }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-200 shadow-sm p-4 min-w-0 ${className}`}>
      <div className="mb-3"><div className="text-sm font-extrabold text-slate-900">{title}</div>{sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}</div>
      {children}
    </div>
  )
}

type SortKey = 'reach' | 'interactions' | 'engagementRate' | 'likes' | 'comments' | 'publishedAt'

export default function InsightsView({ canRefresh, onOpenPost }: { canRefresh: boolean; onOpenPost: (id: string) => void }) {
  const [days, setDays] = useState(28)
  const [platform, setPlatform] = useState<'' | 'instagram' | 'facebook'>('')
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'reach', dir: -1 })
  const [showAll, setShowAll] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await fetch(`/api/social/insights/report?days=${days}&tz=${encodeURIComponent(tz)}${platform ? `&platform=${platform}` : ''}`)
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Could not load insights')
      setData(d)
    } catch (e: any) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [days, platform])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/social/insights/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) })
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Refresh failed')
      toast.success(`Updated ${d.refreshed} of ${d.eligible} posts${d.failed ? ` · ${d.failed} couldn't be read` : ''}`)
      if (d.failed && d.error) toast.error(d.error)
      await load()
    } catch (e: any) { toast.error(e.message) } finally { setRefreshing(false) }
  }

  const periodLabel = PERIODS.find(p => p[0] === days)?.[1] || `${days} days`
  const cur = data?.current, prev = data?.previous

  const sorted = useMemo(() => {
    const rows = [...(data?.posts || [])]
    rows.sort((a, b) => {
      const va = sort.key === 'publishedAt' ? +new Date(a.publishedAt) : (a[sort.key] ?? -1) as number
      const vb = sort.key === 'publishedAt' ? +new Date(b.publishedAt) : (b[sort.key] ?? -1) as number
      return (va - vb) * sort.dir
    })
    return rows
  }, [data, sort])

  // Plain-English findings. Each one names its sample; nothing is claimed from
  // fewer than 2 posts per side.
  const findings = useMemo(() => {
    if (!data) return [] as string[]
    const out: string[] = []
    const measured = data.posts.filter(p => p.fetchedAt)
    const top = [...measured].sort((a, b) => b.reach - a.reach)[0]
    if (top && top.reach > 0 && measured.length >= 3) {
      const avg = (data.current.avgReach || 0)
      out.push(`Top post reached ${top.reach.toLocaleString()} — ${avg > 0 ? `${(top.reach / avg).toFixed(1)}× the ${periodLabel.replace(/s$/, '').replace(/^(\d+) /, '$1-')} average of ${Math.round(avg).toLocaleString()}` : 'the best of the period'} (${FORMAT_ONE[top.format].toLowerCase()}, ${fmtDay(top.publishedAt)}).`)
    }
    const fmts = data.byFormat.filter(f => f.measured >= 2 && f.avgReach != null).sort((a, b) => (b.avgReach! - a.avgReach!))
    if (fmts.length >= 2 && fmts[0].avgReach! > 0 && fmts[1].avgReach! > 0) {
      const r = fmts[0].avgReach! / fmts[1].avgReach!
      if (r >= 1.2) out.push(`${FORMAT_LABEL[fmts[0].key]} averaged ${r.toFixed(1)}× the reach of ${FORMAT_LABEL[fmts[1].key].toLowerCase()} (${Math.round(fmts[0].avgReach!).toLocaleString()} vs ${Math.round(fmts[1].avgReach!).toLocaleString()} per post; n=${fmts[0].measured} vs ${fmts[1].measured}).`)
    }
    const dow = data.byWeekday.filter(d => d.measured >= 2 && d.avgReach != null).sort((a, b) => b.avgReach! - a.avgReach!)
    if (dow.length >= 2) out.push(`${dow[0].key} posts reached the most on average — ${Math.round(dow[0].avgReach!).toLocaleString()} per post (n=${dow[0].measured}).`)
    if (data.current.posts > 0 && prev && prev.posts > 0) {
      const perWeekNow = data.current.posts / (days / 7), perWeekBefore = prev.posts / (days / 7)
      if (Math.abs(perWeekNow - perWeekBefore) >= 0.5) out.push(`Posting ${perWeekNow > perWeekBefore ? 'picked up' : 'slowed'}: ${perWeekNow.toFixed(1)} posts/week vs ${perWeekBefore.toFixed(1)} the ${periodLabel} before.`)
    }
    return out
  }, [data, days, periodLabel, prev])

  const unmeasured = (data?.posts || []).filter(p => !p.fetchedAt).length
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`px-2 py-2 font-bold text-[11px] uppercase tracking-wide text-slate-500 text-right whitespace-nowrap ${cls}`}>
      <button onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))} className={`inline-flex items-center gap-1 hover:text-slate-900 ${sort.key === k ? 'text-slate-900' : ''}`}>{label}<ArrowUpDown size={11} className={sort.key === k ? 'opacity-100' : 'opacity-40'} /></button>
    </th>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* filters — one row above the charts */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex p-1 gap-0.5 rounded-xl bg-slate-100 border border-slate-200">
          {PERIODS.map(([d, l]) => <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${days === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>)}
        </div>
        <div className="inline-flex p-1 gap-0.5 rounded-xl bg-slate-100 border border-slate-200">
          {([['', 'All accounts'], ['instagram', 'Instagram'], ['facebook', 'Facebook']] as const).map(([k, l]) => <button key={k} onClick={() => setPlatform(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${platform === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{k && <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLOR[k] }} />}{l}</button>)}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          {data?.lastSnapshot && <span>Numbers as of {fmtDay(data.lastSnapshot)} {new Date(data.lastSnapshot).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
          {canRefresh && <button onClick={refresh} disabled={refreshing} className="rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh numbers'}</button>}
        </div>
      </div>

      {loading && !data ? <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center text-sm text-slate-400">Loading insights…</div> : data && cur && prev && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="People reached" value={compact(cur.reach)} sub="summed across posts"><Delta cur={cur.reach} prev={prev.reach} label={periodLabel} /></Tile>
            <Tile label="Interactions" value={compact(cur.interactions)} sub={`${compact(cur.likes)} likes · ${compact(cur.comments)} comments`}><Delta cur={cur.interactions} prev={prev.interactions} label={periodLabel} /></Tile>
            <Tile label="Engagement rate" value={pct(cur.engagementRate)} sub="interactions ÷ reach"><Delta cur={cur.engagementRate} prev={prev.engagementRate} kind="pts" label={periodLabel} /></Tile>
            <Tile label="Posts published" value={String(cur.posts)} sub={`${(cur.posts / (days / 7)).toFixed(1)} per week`}><Delta cur={cur.posts} prev={prev.posts} label={periodLabel} /></Tile>
            <div className="col-span-2 md:col-span-1"><Tile label="Avg reach per post" value={cur.avgReach == null ? '—' : compact(cur.avgReach)} sub={`${cur.measured} of ${cur.posts} posts measured`}><Delta cur={cur.avgReach} prev={prev.avgReach} label={periodLabel} /></Tile></div>
          </div>

          {findings.length > 0 && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <div className="text-xs font-extrabold text-teal-900 flex items-center gap-1.5 mb-2"><TrendingUp size={14} /> What's working · {periodLabel}</div>
              <ul className="flex flex-col gap-1.5">{findings.map((f, i) => <li key={i} className="text-sm text-slate-700 leading-snug flex gap-2"><span className="text-teal-600 font-bold">•</span><span>{f}</span></li>)}</ul>
            </div>
          )}

          <Card title={`Reach by ${data.monthly ? 'month' : 'week'}`} sub={`${periodLabel}${platform ? ` · ${platform === 'instagram' ? 'Instagram' : 'Facebook'} only` : ''} · hover a column for the week's posts`}>
            {cur.posts === 0 ? <div className="text-xs text-slate-400 py-8 text-center">Nothing published in this period.</div> : <TrendChart data={data.trend} monthly={data.monthly} />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card title="By account" sub="Total reach · engagement rate in the tooltip">
              <BarList metric="Reach" fmt={compact} colorOf={k => PLATFORM_COLOR[k] || TEAL}
                items={data.byPlatform.map(g => ({ key: g.key, value: g.reach, n: g.posts, extra: `engagement ${pct(g.engagementRate)}`, label: <span className="inline-flex items-center gap-1.5">{g.key === 'instagram' ? <Instagram size={13} /> : <Facebook size={13} />}{g.key === 'instagram' ? 'Instagram' : 'Facebook'}</span> }))} />
              {data.byPlatform.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{data.byPlatform.map(g => <div key={g.key} className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{g.key === 'instagram' ? 'Instagram' : 'Facebook'} ER</div><div className="text-sm font-extrabold tabular-nums">{pct(g.engagementRate)}</div></div>)}</div>}
            </Card>
            <Card title="By format" sub="Average reach per post">
              <BarList metric="Avg reach" fmt={compact} note={data.byFormat.some(f => f.measured < 3) ? 'Small samples (n<3) are directional, not proof.' : undefined}
                items={data.byFormat.filter(g => g.avgReach != null).map(g => ({ key: g.key, value: g.avgReach || 0, n: g.measured, extra: `engagement ${pct(g.engagementRate)}`, label: <span className="inline-flex items-center gap-1.5">{g.key === 'reel' || g.key === 'video' ? <Film size={13} /> : g.key === 'story' ? <Clock size={13} /> : <ImageIcon size={13} />}{FORMAT_LABEL[g.key]}</span> }))} />
            </Card>
            <Card title="When it lands" sub={`Average reach per post · ${Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ')} time`}>
              <BarList metric="Avg reach" fmt={compact}
                items={data.byWeekday.filter(g => g.measured > 0).map(g => ({ key: g.key, value: g.avgReach || 0, n: g.measured, label: g.key }))} />
              <div className="mt-3 pt-3 border-t border-slate-100">
                <BarList metric="Avg reach" fmt={compact} note="Needs a few more posts per slot before it's a pattern."
                  items={data.bySlot.filter(g => g.measured > 0).map(g => ({ key: g.key, value: g.avgReach || 0, n: g.measured, label: SLOT_LABEL[g.key].split(' · ')[0] }))} />
              </div>
            </Card>
          </div>

          {/* Top posts */}
          <Card title="Posts ranked" sub="Click a row to open the post · click a column to sort">
            {sorted.length === 0 ? <div className="text-xs text-slate-400 py-6 text-center">Nothing published in this period.</div> : <>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm min-w-[720px]">
                  <thead><tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-bold text-[11px] uppercase tracking-wide text-slate-500 w-10">#</th>
                    <th className="px-2 py-2 text-left font-bold text-[11px] uppercase tracking-wide text-slate-500">Post</th>
                    {th('publishedAt', 'Date')}{th('reach', 'Reach')}{th('interactions', 'Interactions')}{th('engagementRate', 'Eng. rate')}{th('likes', 'Likes', 'hidden md:table-cell')}{th('comments', 'Comments', 'hidden md:table-cell')}
                    <th className="px-4 py-2 text-right font-bold text-[11px] uppercase tracking-wide text-slate-500 hidden md:table-cell">Saves / shares</th>
                  </tr></thead>
                  <tbody>
                    {(showAll ? sorted : sorted.slice(0, 10)).map((p, i) => (
                      <tr key={p.id} onClick={() => onOpenPost(p.id)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="px-4 py-2 text-xs font-bold text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex-none grid place-items-center text-slate-400">
                              {p.thumb ? <img src={p.thumb} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : p.format === 'photo' || p.format === 'carousel' ? <ImageIcon size={14} /> : <Film size={14} />}
                              <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: PLATFORM_COLOR[p.platform] || '#94a3b8' }} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-800 truncate max-w-[280px]">{(p.caption.split('\n').find(l => l.trim()) || (p.format === 'story' ? 'Story' : 'Untitled')).slice(0, 80)}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">{FORMAT_ONE[p.format]} · {p.account}{p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-teal-700 hover:underline inline-flex items-center gap-0.5">open <ExternalLink size={10} /></a>}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-slate-600 whitespace-nowrap tabular-nums">{fmtDayYr(p.publishedAt)}</td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums text-slate-900">{p.fetchedAt ? p.reach.toLocaleString() : <span className="text-slate-300 font-normal">—</span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{p.fetchedAt ? p.interactions.toLocaleString() : '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{pct(p.engagementRate)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600 hidden md:table-cell">{p.fetchedAt ? p.likes : '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-600 hidden md:table-cell">{p.fetchedAt ? p.comments : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 hidden md:table-cell">{p.fetchedAt ? `${p.saves} / ${p.shares}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sorted.length > 10 && <button onClick={() => setShowAll(v => !v)} className="mt-3 text-xs font-bold text-teal-700 hover:underline">{showAll ? 'Show top 10' : `Show all ${sorted.length} posts`}</button>}
            </>}
          </Card>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Reach is added up post by post, so someone who saw three of your posts counts three times — it's total reach, not unique people.
            Interactions = likes + comments + saves + shares. {unmeasured > 0 && `${unmeasured} post${unmeasured === 1 ? '' : 's'} in this period ${unmeasured === 1 ? 'has' : 'have'} no numbers yet — the next snapshot or Refresh numbers fills ${unmeasured === 1 ? 'it' : 'them'} in. `}
            Facebook reach needs one more reconnect (Accounts → Continue with Meta) to grant the insights permission; until then Facebook posts count likes, comments and shares only.
          </p>
        </div>
      )}
    </div>
  )
}
