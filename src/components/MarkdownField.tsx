'use client'
import { useRef, useState } from 'react'
import { Bold, Italic, Heading2, List, Link2, Eye, Pencil } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
  mono?: boolean
}

// Reusable rich-text field for Markdown content. A small formatting toolbar
// (Bold / Italic / Heading / Bullets / Link) inserts Markdown into the textarea,
// and a Preview toggle renders it exactly as the public pages will (mdToHtml).
export default function MarkdownField({ value, onChange, placeholder, minHeight = 140, mono }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  function surround(before: string, after: string, fallback = '') {
    const el = ref.current
    if (!el) { onChange((value || '') + before + fallback + after); return }
    const s = el.selectionStart, e = el.selectionEnd
    const sel = value.slice(s, e) || fallback
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = s + before.length
      el.selectionEnd = s + before.length + sel.length
    })
  }

  function linePrefix(prefix: string) {
    const el = ref.current
    if (!el) { onChange((value || '') + '\n' + prefix); return }
    const s = el.selectionStart, e = el.selectionEnd
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const nlAfter = value.indexOf('\n', e)
    const lineEnd = nlAfter === -1 ? value.length : nlAfter
    const block = value.slice(lineStart, lineEnd)
    const newBlock = block.split('\n').map(l => (l.length ? prefix + l : l)).join('\n')
    const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd)
    onChange(next)
    requestAnimationFrame(() => { el.focus() })
  }

  function insertLink() {
    const el = ref.current
    const s = el ? el.selectionStart : (value || '').length
    const e = el ? el.selectionEnd : (value || '').length
    const sel = value.slice(s, e) || 'link text'
    const next = value.slice(0, s) + `[${sel}](https://)` + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => { if (el) el.focus() })
  }

  const btn = 'p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700'
  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-200 bg-slate-50">
        <button type="button" onClick={() => surround('**', '**', 'bold text')} className={btn} title="Bold"><Bold size={15} /></button>
        <button type="button" onClick={() => surround('*', '*', 'italic text')} className={btn} title="Italic"><Italic size={15} /></button>
        <button type="button" onClick={() => linePrefix('## ')} className={btn} title="Heading"><Heading2 size={15} /></button>
        <button type="button" onClick={() => linePrefix('- ')} className={btn} title="Bullet list"><List size={15} /></button>
        <button type="button" onClick={insertLink} className={btn} title="Link"><Link2 size={15} /></button>
        <button type="button" onClick={() => setPreview(p => !p)} className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-200">
          {preview ? (<><Pencil size={13} /> Edit</>) : (<><Eye size={13} /> Preview</>)}
        </button>
      </div>
      {preview ? (
        <div className="px-3 py-3 text-sm overflow-auto" style={{ minHeight }} dangerouslySetInnerHTML={{ __html: mdToHtml(value || '') || '<p class="text-slate-400">Nothing to preview yet.</p>' }} />
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ minHeight }}
          className={`w-full px-3 py-2 text-sm focus:outline-none resize-y ${mono ? 'font-mono text-xs leading-relaxed' : ''}`}
        />
      )}
    </div>
  )
}
