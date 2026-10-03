'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import ChirpAvatar from '@/components/ChirpAvatar'

// The pieces that make Chirp read as a help desk rather than a mystery bubble
// (Bo picked option "B with C" from the launcher mockups, Oct 3 2026):
// a labeled "Ask Chirp" button with an online dot, an optional greeting card
// that pops once per visit, and a help-desk header, topic tiles and a
// "can make mistakes" note inside the open chat. Shared by the public and
// staff Chirps so they look like one product.

const NAVY = 'bg-[#0f1f3d]'

/** The launcher: a labeled pill while closed, a round close button while open. */
export function ChirpLauncher({ open, onToggle, sub = 'Help desk · answers 24/7', lift = false }: {
  open: boolean; onToggle: () => void; sub?: string; lift?: boolean
}) {
  const pos = `fixed ${lift ? 'bottom-20' : 'bottom-4'} right-3 sm:bottom-6 sm:right-6 z-50`
  if (open) {
    return (
      <button type="button" onClick={onToggle} aria-label="Close Chirp"
        className={`${pos} w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white bg-slate-600 hover:bg-slate-700 transition-colors`}>
        <X size={22} />
      </button>
    )
  }
  return (
    <button type="button" onClick={onToggle} aria-label="Ask Chirp, the help desk"
      className={`${pos} h-14 rounded-full ${NAVY} shadow-[0_10px_28px_rgba(15,31,61,0.35)] hover:bg-slate-800 transition-colors flex items-center gap-2.5 pl-1.5 pr-4 sm:pr-5`}>
      <span className="relative flex-none">
        <ChirpAvatar size={44} />
        <span className="absolute right-0 bottom-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0f1f3d]" />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[15px] font-bold text-white">Ask Chirp</span>
        <span className="hidden sm:block text-[11px] text-teal-200">{sub}</span>
      </span>
    </button>
  )
}

/** Show the greeting a few seconds after the page loads, once per browser
 *  session, and never again once dismissed or once the chat is opened. */
export function useGreeting(key: string, open: boolean, enabled = true, delayMs = 4000) {
  const storeKey = `chirp-greeted-${key}`
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let seen = false
    try { seen = sessionStorage.getItem(storeKey) === '1' } catch {}
    if (seen) return
    const t = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(t)
  }, [enabled, storeKey, delayMs])
  const dismiss = () => { setShow(false); try { sessionStorage.setItem(storeKey, '1') } catch {} }
  useEffect(() => { if (open && show) dismiss() })   // opening the chat counts as seen
  return { show: show && !open, dismiss }
}

/** The greeting card above the launcher. */
export function ChirpGreeting({ title, body, chips, onDismiss, lift = false }: {
  title: string; body: string; chips: { label: string; onPick: () => void }[]; onDismiss: () => void; lift?: boolean
}) {
  return (
    <aside aria-live="polite"
      className={`fixed ${lift ? 'bottom-36' : 'bottom-20'} left-3 right-3 sm:left-auto sm:right-6 sm:bottom-24 sm:w-[300px] z-50 bg-white border border-slate-200 rounded-2xl shadow-[0_14px_40px_rgba(15,23,42,0.18)] p-3.5 flex flex-col gap-2.5`}>
      <div className="flex items-start gap-2.5">
        <ChirpAvatar size={34} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-slate-900">{title}</p>
          <p className="text-[13px] leading-snug text-slate-600 mt-0.5">{body}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          className="flex-none -mt-1.5 -mr-1.5 w-9 h-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <button key={c.label} type="button" onClick={c.onPick}
            className="text-[13px] sm:text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-full px-3 py-2 sm:py-1.5">
            {c.label}
          </button>
        ))}
      </div>
    </aside>
  )
}

/** The open chat's header. */
export function ChirpHeader({ subtitle, actions }: { subtitle: string; actions?: ReactNode }) {
  return (
    <div className={`${NAVY} px-4 py-3 flex items-center gap-3 flex-shrink-0`}>
      <span className="relative flex-none">
        <ChirpAvatar size={38} />
        <span className="absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0f1f3d]" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">Chirp · Help desk</p>
        <p className="text-[11px] text-teal-200 truncate">{subtitle}</p>
      </div>
      {actions}
    </div>
  )
}

/** The first thing in an empty chat: a hello and up to four topic tiles. */
export function ChirpWelcome({ hello, topics }: {
  hello: string; topics: { label: string; icon: ReactNode; onPick: () => void }[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <ChirpAvatar size={24} />
        <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed">{hello}</div>
      </div>
      <p className="text-[11px] font-semibold text-slate-500">Popular questions</p>
      <div className="grid grid-cols-2 gap-2">
        {topics.map(t => (
          <button key={t.label} type="button" onClick={t.onPick}
            className="text-left bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 rounded-xl p-2.5 flex flex-col gap-1.5 min-h-[64px] transition-colors">
            <span className="text-teal-700">{t.icon}</span>
            <span className="text-[13px] font-semibold text-slate-800 leading-snug">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The small print under the question box. */
export function ChirpNote({ contact }: { contact?: string }) {
  return (
    <p className="text-[11px] text-slate-500 text-center mt-2">
      AI assistant, can make mistakes.{contact ? <> Need a person? <a href={`mailto:${contact}`} className="text-teal-700 underline">{contact}</a></> : null}
    </p>
  )
}
