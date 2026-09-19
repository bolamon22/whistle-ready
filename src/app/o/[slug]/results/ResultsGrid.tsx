'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, MapPin, BarChart3, ListFilter, X } from 'lucide-react'

export interface ResultRow {
  id: string
  name: string
  startDate: string
  endDate: string
  location: string
  logoUrl: string
}

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return ''
}
function initials(name: string) { return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase() }
const ACCENTS = ['#0e7490', '#b45309', '#9f1239', '#1d4ed8', '#6d28d9', '#047857']
function accentFor(str: string) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return ACCENTS[h % ACCENTS.length] }

// A decade of events is named a decade of different ways -- "Sunshine State Games
// 2015", "Sunshine State Games Summer Kick Off - 2019", "Sunshine State Summer Kick
// Off 24", "Sunshine Summer Kick Off 2026" are all one tournament. Trimming the year
// off the end would file those as four separate series, so the series is recognised
// by its distinctive words instead. Fall Classic is tested before Summer Kick Off
// because "Sunshine State Games Fall Classic" would otherwise match both.
const SERIES: [RegExp, string][] = [
  [/monster mash/i, 'Monster Mash'],
  [/fall classic/i, 'Fall Classic'],
  [/jingle brawl/i, 'Jingle Brawl'],
  [/summer kick ?off|sunshine state games/i, 'Summer Kick Off'],
]
export function seriesOf(name: string) {
  for (const [re, label] of SERIES) if (re.test(name)) return label
  // Anything outside the known series still groups sensibly: drop a trailing year
  // so "Fathers Day 2026" and "Fathers Day 2025" land on one chip.
  return name.replace(/[\s,–-]*(20\d{2}|'\d{2})\s*$/, '').trim() || name.trim()
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${active
        ? 'bg-teal-600 border-teal-600 text-white'
        : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'}`}
    >{children}</button>
  )
}

export default function ResultsGrid({ items }: { items: ResultRow[] }) {
  const [series, setSeries] = useState<string | null>(null)
  const [year, setYear] = useState<string | null>(null)

  const { seriesList, yearList } = useMemo(() => {
    const s = new Map<string, number>()
    const y = new Map<string, number>()
    for (const t of items) {
      const k = seriesOf(t.name); s.set(k, (s.get(k) || 0) + 1)
      const v = yr(t.startDate || t.endDate); if (v) y.set(v, (y.get(v) || 0) + 1)
    }
    return {
      // Most-run series first, so the four that matter sit at the front however
      // many one-off events end up in the list.
      seriesList: [...s.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      yearList: [...y.keys()].sort((a, b) => b.localeCompare(a)),
    }
  }, [items])

  const shown = useMemo(() => items.filter(t =>
    (!series || seriesOf(t.name) === series) &&
    (!year || yr(t.startDate || t.endDate) === year)
  ), [items, series, year])

  const filtered = series !== null || year !== null

  return (
    <>
      <div className="mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 w-24 flex-shrink-0">
            <ListFilter size={13} /> Tournament
          </span>
          <Chip active={series === null} onClick={() => setSeries(null)}>All</Chip>
          {seriesList.map(([name, n]) => (
            <Chip key={name} active={series === name} onClick={() => setSeries(series === name ? null : name)}>
              {name} <span className={series === name ? 'text-teal-100' : 'text-slate-400'}>{n}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400 w-24 flex-shrink-0">Year</span>
          <Chip active={year === null} onClick={() => setYear(null)}>All</Chip>
          {yearList.map(v => (
            <Chip key={v} active={year === v} onClick={() => setYear(year === v ? null : v)}>{v}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <p className="text-sm text-slate-500">
            {shown.length} {shown.length === 1 ? 'tournament' : 'tournaments'}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => { setSeries(null); setYear(null) }}
              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900"
            ><X size={14} /> Clear filters</button>
          )}
        </div>
      </div>

      {shown.length === 0
        ? <p className="text-slate-500">No tournaments match those filters.</p>
        : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(t => {
              const accent = accentFor(t.name)
              return (
                <div key={t.id} className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
                  <Link href={`/tournaments/${t.id}/public`} className="absolute inset-0 z-10" aria-label={`View ${t.name} schedule & standings`} />
                  <div className="h-2" style={{ backgroundColor: accent }} />
                  <div className="p-5 flex items-start gap-4">
                    {t.logoUrl
                      ? <img src={t.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-contain bg-white border border-slate-100 flex-shrink-0" />
                      : <div className="w-20 h-20 rounded-2xl text-white flex items-center justify-center font-bold text-xl flex-shrink-0" style={{ backgroundColor: accent }}>{initials(t.name)}</div>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 leading-tight">{t.name}</h3>
                      <p className="text-sm text-slate-500 mt-1 inline-flex items-center gap-1"><CalendarDays size={14} /> {fmtRange(t.startDate, t.endDate)}</p>
                      {t.location && <p className="text-sm text-slate-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={14} /> {t.location}</p>}
                    </div>
                  </div>
                  <div className="mt-auto border-t border-slate-100 bg-teal-600 group-hover:bg-teal-700 transition-colors py-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-white"><BarChart3 size={15} /> Results &amp; standings</div>
                </div>
              )
            })}
          </div>}
    </>
  )
}
