'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { LETTER_BUTTONS, LETTER_REWRITES, LETTER_TONES, type LetterButton, type LetterTone } from '@/lib/customLetters'
import DictateButton from '@/components/DictateButton'

// The AI half of the Email clubs dialog (Bo, Oct 12 2026): write a new letter from
// a description, or rewrite the one on screen. Both only fill the editor -- the
// preview, the test copy and the Send button are the same as for any letter.
// The prompt and its rules live in lib/letterAi; this file is just the controls.
// Both boxes take dictation (Bo, Oct 12 2026) through the same DictateButton Chirp
// uses: the browser's own speech recognition, words land in the box, nothing is
// recorded by us, and the mic simply doesn't show where the browser can't do it.
// The vendor email dialog (components/contacts/VendorEmailDialog) uses the same
// controls with its own writer behind them: pass `endpoint` and `extra`.

export type AiLetter = { name?: string; subject: string; body: string; unknown?: string[]; dropped?: string[] }

async function askAi(payload: Record<string, unknown>, endpoint = '/api/registrations/comm-ai'): Promise<AiLetter> {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d?.body) throw new Error(d?.error || 'The AI could not write that just now.')
  return d as AiLetter
}

const chip = (on: boolean) =>
  `px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`

/** The button a letter of the org's own carries. Also how it is sent: Pay balance
 *  makes it a payment letter (lib/customLetters). */
export function ButtonPicker({ value, onChange }: { value: LetterButton; onChange: (b: LetterButton) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {LETTER_BUTTONS.map(b => (
        <button key={b.value} type="button" onClick={() => onChange(b.value)} aria-pressed={value === b.value} className={chip(value === b.value)}>{b.label}</button>
      ))}
    </div>
  )
}

/** "Write it with AI" for a new letter. */
export function AiWritePanel({ tournamentId, button, onButton, onResult, endpoint, extra, placeholder, note }: {
  tournamentId: string
  /** The club letters' button row. Leave both out to hide it (vendor emails have none). */
  button?: LetterButton
  onButton?: (b: LetterButton) => void
  onResult: (r: AiLetter) => void
  /** Another writer behind the same controls, e.g. /api/contacts/email-ai. */
  endpoint?: string
  /** Sent with every request, e.g. who the email is to and which event. */
  extra?: Record<string, unknown>
  placeholder?: string
  note?: string
}) {
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState<LetterTone>('Friendly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const write = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true); setError('')
    try {
      onResult(await askAi({ mode: 'write', prompt, tone, kind: 'custom', button, tournamentId, ...extra }, endpoint))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI could not write that just now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 mb-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-teal-800 mb-2"><Sparkles size={16} /> Write it with AI</div>
      <label htmlFor="ai-letter-prompt" className="block text-xs font-medium text-slate-600 mb-1">What should this email say?</label>
      <div className="flex items-start gap-2">
        <textarea id="ai-letter-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000}
          placeholder={placeholder || 'Type it, or tap the mic and say it. e.g. Pools are posted. Ask clubs to check their teams and divisions and reply by Friday if anything is wrong.'}
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white min-h-[84px] resize-y focus:outline-none focus:ring-2 focus:ring-teal-400" />
        <DictateButton value={prompt} onChange={t => setPrompt(t.slice(0, 2000))} disabled={busy} className="h-9 bg-white" />
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        {onButton && (<>
          <span className="text-xs font-medium text-slate-600">Button</span>
          <ButtonPicker value={button || 'none'} onChange={onButton} />
        </>)}
        <span className="text-xs font-medium text-slate-600">Tone</span>
        <div className="flex flex-wrap gap-1">
          {LETTER_TONES.map(t => <button key={t} type="button" onClick={() => setTone(t)} aria-pressed={tone === t} className={chip(tone === t)}>{t}</button>)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={write} disabled={!prompt.trim() || busy}
          className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {busy ? 'Writing…' : 'Write it'}
        </button>
        <span className="flex-1 min-w-[12rem] text-[11px] text-slate-500 leading-snug">{note || 'Writes the words only. Names, balances, team lists and links fill in from each club\u2019s record.'}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** One-click rewrites under any letter, built-in or the org's own, with an undo. */
export function AiRewriteBar({ tournamentId, kind, button, subject, body, onResult, endpoint, extra, placeholder }: {
  tournamentId: string
  kind: string
  button?: LetterButton
  subject: string
  body: string
  onResult: (r: AiLetter) => void
  endpoint?: string
  extra?: Record<string, unknown>
  placeholder?: string
}) {
  const [busy, setBusy] = useState('')
  const [asking, setAsking] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [undo, setUndo] = useState<{ subject: string; body: string } | null>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState('')

  const run = async (label: string, text: string) => {
    if (!text.trim() || busy || !body.trim()) return
    setBusy(label); setError('')
    const before = { subject, body }
    try {
      const r = await askAi({ mode: 'rewrite', prompt: text, kind, button, subject, body, tournamentId, ...extra }, endpoint)
      setUndo(before)
      setDropped(r.dropped || [])
      setAsking(false); setInstruction('')
      onResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI could not rewrite that just now.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mr-1"><Sparkles size={12} className="text-teal-600" /> Rewrite:</span>
        {LETTER_REWRITES.map(r => (
          <button key={r.label} type="button" onClick={() => run(r.label, r.instruction)} disabled={!!busy || !body.trim()}
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-800 disabled:opacity-50">
            {busy === r.label ? 'Rewriting…' : r.label}
          </button>
        ))}
        <button type="button" onClick={() => setAsking(a => !a)} disabled={!!busy}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 disabled:opacity-50">Tell it what to change…</button>
        {undo && !busy && (
          <button type="button" onClick={() => { onResult(undo); setUndo(null); setDropped([]) }}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"><Undo2 size={12} /> Undo the AI change</button>
        )}
      </div>
      {asking && (
        <div className="mt-2 flex gap-2">
          <input value={instruction} onChange={e => setInstruction(e.target.value)} maxLength={500} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); run('custom', instruction) } }}
            placeholder={placeholder || 'e.g. Mention the hotel block closes Oct 20'}
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <DictateButton value={instruction} onChange={t => setInstruction(t.slice(0, 500))} disabled={!!busy} className="h-[34px]" />
          <button type="button" onClick={() => run('custom', instruction)} disabled={!instruction.trim() || !!busy}
            className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">{busy === 'custom' ? 'Rewriting…' : 'Rewrite'}</button>
        </div>
      )}
      {dropped.length > 0 && (
        <p role="alert" className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The rewrite left out {dropped.map(f => `{${f}}`).join(', ')}. Undo it, or put {dropped.length === 1 ? 'it' : 'them'} back where {dropped.length === 1 ? 'it belongs' : 'they belong'}.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  )
}
