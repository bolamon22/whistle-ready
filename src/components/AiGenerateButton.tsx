'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles, Wand2 } from 'lucide-react'

const QUICK_FORMAT = 'Reformat with bold section headers (## headings and **bold** labels) and bullet points ("- ") wherever it helps. Keep ALL the information — only improve the structure, formatting, and scannability.'

// Small "Generate with AI" control: opens a prompt (with one-click quick prompts),
// calls /api/ai/generate, and hands the drafted text back to the parent field.
// Pass `current` so a quick prompt can reformat the existing text instead of
// starting from scratch.
export default function AiGenerateButton({ kind, onResult, label, current, quickPrompts }: { kind?: string; onResult: (text: string) => void; label?: string; current?: string; quickPrompts?: { label: string; prompt: string }[] }) {
  const params = useParams() as any
  const tournamentId = params?.id
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const chips = [{ label: 'Bold headers + bullets', prompt: QUICK_FORMAT }, ...(quickPrompts || [])]

  async function run(override?: string) {
    const p = (override ?? prompt).trim()
    if (!p) { setErr('Type an instruction or pick a quick prompt.'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p, current, tournamentId, kind }) })
      const d = await r.json()
      if (!r.ok || !d.text) setErr(d.error || 'Could not generate')
      else { onResult(d.text); setOpen(false); setPrompt('') }
    } catch { setErr('Could not reach the AI service') }
    setBusy(false)
  }

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Sparkles size={13} /> {label || 'Generate with AI'}</button>
      {open && (
        <div className="mt-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50">
          <div className="flex flex-wrap gap-1 mb-1.5">
            {chips.map(c => (
              <button key={c.label} type="button" onClick={() => (current && current.trim()) ? run(c.prompt) : setPrompt(c.prompt)} disabled={busy} className="text-[11px] bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 hover:border-teal-400 hover:text-teal-700 inline-flex items-center gap-1 disabled:opacity-50"><Wand2 size={11} /> {c.label}</button>
            ))}
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} placeholder="Describe what to write… e.g. a friendly overview for a holiday youth lacrosse tournament" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <button type="button" onClick={() => run()} disabled={busy} className="text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded px-2.5 py-1 disabled:opacity-50">{busy ? 'Generating…' : 'Generate'}</button>
            <button type="button" onClick={() => { setOpen(false); setErr('') }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{current && current.trim() ? 'A quick prompt rewrites the current text; ' : ''}Replaces the field with the draft — you can edit it after.</p>
        </div>
      )}
    </div>
  )
}
