'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

// Small pieces both Financials tabs draw.

export const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtOr = (n: number | null | undefined, dash = '—') => (n === null || n === undefined ? dash : fmt(n))
export const pct = (ch: number | null) => {
  if (ch === null || !Number.isFinite(ch)) return ''
  if (Math.abs(ch) < 0.005) return 'same'
  return `${ch > 0 ? '+' : '−'}${Math.round(Math.abs(ch) * 100)}%`
}
/** "$1,234.50" / "1234.5" / "" -> number | null */
export const parseMoney = (v: string): number | null => {
  const n = parseFloat(String(v || '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}
/** A stored YYYY-MM-DD as the calendar day it is (not UTC midnight). */
export const showDay = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}

export function SectionTitle({ id, children, right }: { id: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="w-1.5 h-7 rounded-full bg-teal-500" aria-hidden />
        <h2 id={id} className="text-xl font-extrabold text-slate-900">{children}</h2>
      </div>
      {right}
    </div>
  )
}

export function Expander({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label}
      className="w-9 h-9 flex-shrink-0 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center">
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  )
}

const TONES: Record<string, string> = {
  waiting: 'bg-slate-100 text-slate-700',
  owed: 'bg-amber-100 text-amber-800',
  deposit: 'bg-sky-100 text-sky-800',
  paid: 'bg-emerald-100 text-emerald-800',
}
export function StatusPill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${TONES[tone] || TONES.waiting}`}>{children}</span>
}

export const pillBtn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50'
export const pillBtnTeal = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full border border-teal-600 bg-white text-sm font-bold text-teal-700 hover:bg-teal-50'
export const pillBtnSolid = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold'
export const moneyInput = 'w-32 text-right border border-slate-300 rounded-lg px-2.5 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500'
