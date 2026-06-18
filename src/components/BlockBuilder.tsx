'use client'
import { useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, Copy, Trash2, Pencil, Plus } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import { Block, blockTypeLabel, isBuiltin, newBlock, CUSTOM_BLOCK_LABELS, CUSTOM_TYPES } from '@/lib/eventBlocks'

const lbl = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-2 mb-1'
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

function DisplayPicker({ b, updateProps }: { b: Block; updateProps: (id: string, patch: any) => void }) {
  const p = b.props || {}
  return (
    <>
      <label className={lbl}>Show this block</label>
      <select className={inp} value={p.display || 'inline'} onChange={e => updateProps(b.id, { display: e.target.value })}>
        <option value="inline">On the event page</option>
        <option value="page">Its own page (linked in the Event info menu)</option>
      </select>
    </>
  )
}

function Editor({ b, updateProps }: { b: Block; updateProps: (id: string, patch: any) => void }) {
  const p = b.props || {}
  if (b.type === 'custom') return (
    <>
      <label className={lbl}>Title</label>
      <input className={inp} value={p.title || ''} onChange={e => updateProps(b.id, { title: e.target.value })} placeholder="Section title" />
      <label className={lbl}>Content</label>
      <MarkdownField value={p.body || ''} onChange={v => updateProps(b.id, { body: v })} minHeight={120} placeholder="Write anything — parking, food trucks, awards…" />
      <DisplayPicker b={b} updateProps={updateProps} />
    </>
  )
  if (b.type === 'cta') return (
    <>
      <label className={lbl}>Button label</label>
      <input className={inp} value={p.label || ''} onChange={e => updateProps(b.id, { label: e.target.value })} placeholder="Register now" />
      <label className={lbl}>Link URL</label>
      <input className={inp} value={p.url || ''} onChange={e => updateProps(b.id, { url: e.target.value })} placeholder="https://…" />
      <label className={lbl}>Style</label>
      <select className={inp} value={p.style || 'primary'} onChange={e => updateProps(b.id, { style: e.target.value })}>
        <option value="primary">Solid (teal)</option>
        <option value="secondary">Outline</option>
      </select>
    </>
  )
  if (b.type === 'faq') {
    const items: any[] = Array.isArray(p.items) ? p.items : []
    const setItems = (it: any[]) => updateProps(b.id, { items: it })
    return (
      <>
        <label className={lbl}>Title (optional)</label>
        <input className={inp} value={p.title || ''} onChange={e => updateProps(b.id, { title: e.target.value })} placeholder="e.g. Frequently asked questions, Travel info…" />
        <label className={lbl}>Collapsible sections</label>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-2">
              <input className={inp} value={it.q || ''} onChange={e => setItems(items.map((x, j) => j === idx ? { ...x, q: e.target.value } : x))} placeholder="Heading (what people tap to expand)" />
              <div className="mt-1.5">
                <MarkdownField value={it.a || ''} onChange={v => setItems(items.map((x, j) => j === idx ? { ...x, a: v } : x))} minHeight={90} placeholder="Content — supports bold, bullets, links…" />
              </div>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== idx))} className="text-xs text-slate-400 hover:text-red-600 mt-1">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setItems([...items, { q: '', a: '' }])} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add section</button>
        </div>
        <DisplayPicker b={b} updateProps={updateProps} />
      </>
    )
  }
  if (b.type === 'countdown') return (
    <>
      <label className={lbl}>Title</label>
      <input className={inp} value={p.title || ''} onChange={e => updateProps(b.id, { title: e.target.value })} placeholder="Countdown to kickoff" />
      <p className="text-xs text-slate-400 mt-2">Counts down to the tournament&apos;s start date automatically.</p>
    </>
  )
  return null
}

export default function BlockBuilder({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const move = (from: number, to: number) => { if (to < 0 || to >= blocks.length || from === to) return; const n = [...blocks]; const [m] = n.splice(from, 1); n.splice(to, 0, m); onChange(n) }
  const update = (id: string, patch: Partial<Block>) => onChange(blocks.map(b => b.id === id ? { ...b, ...patch } : b))
  const updateProps = (id: string, patch: any) => onChange(blocks.map(b => b.id === id ? { ...b, props: { ...(b.props || {}), ...patch } } : b))
  const remove = (id: string) => onChange(blocks.filter(b => b.id !== id))
  const duplicate = (b: Block) => { const copy = { ...newBlock(b.type), props: JSON.parse(JSON.stringify(b.props || {})) }; const i = blocks.findIndex(x => x.id === b.id); const n = [...blocks]; n.splice(i + 1, 0, copy); onChange(n) }
  const add = (type: string) => { onChange([...blocks, newBlock(type)]); setAdding(false) }

  const labelOf = (b: Block) => {
    if (isBuiltin(b.type)) return blockTypeLabel(b.type)
    const p = b.props || {}
    if (b.type === 'cta') return p.label || 'Call-to-action'
    return p.title || blockTypeLabel(b.type)
  }

  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) => {
        const builtin = isBuiltin(b.type)
        const hidden = !!b.hidden
        const expanded = editId === b.id && !builtin
        return (
          <div key={b.id} className="rounded-lg border border-slate-200 bg-white">
            <div
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={e => { e.preventDefault(); setOver(i) }}
              onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); setOver(null) }}
              onDragEnd={() => { setDrag(null); setOver(null) }}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${over === i && drag !== null ? 'ring-1 ring-teal-300' : ''} ${hidden ? 'opacity-55' : ''}`}
            >
              <GripVertical size={16} className="text-slate-300 cursor-grab shrink-0" />
              <span className={`flex-1 text-sm font-medium truncate ${hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{labelOf(b)}</span>
              <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${builtin ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-600'}`}>{builtin ? 'Built-in' : (CUSTOM_BLOCK_LABELS[b.type] || 'Block')}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ChevronUp size={15} /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === blocks.length - 1} className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move down"><ChevronDown size={15} /></button>
                <button type="button" onClick={() => update(b.id, { hidden: !hidden })} className={`p-1 rounded hover:bg-slate-100 ${hidden ? 'text-slate-400' : 'text-teal-600'}`} title={hidden ? 'Hidden — click to show' : 'Visible — click to hide'}>{hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                {!builtin && <button type="button" onClick={() => setEditId(expanded ? null : b.id)} className={`p-1 rounded hover:bg-slate-100 ${expanded ? 'text-teal-600' : 'text-slate-400'}`} title="Edit"><Pencil size={15} /></button>}
                {!builtin && <button type="button" onClick={() => duplicate(b)} className="p-1 rounded text-slate-400 hover:bg-slate-100" title="Duplicate"><Copy size={15} /></button>}
                {!builtin && <button type="button" onClick={() => remove(b.id)} className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>}
              </div>
            </div>
            {expanded && <div className="px-3 pb-3 border-t border-slate-100 pt-3"><Editor b={b} updateProps={updateProps} /></div>}
          </div>
        )
      })}

      <div className="pt-1">
        <button type="button" onClick={() => setAdding(a => !a)} className="text-sm font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Plus size={15} /> Add block</button>
        {adding && (
          <div className="mt-2 w-full sm:w-64 bg-white rounded-lg border border-slate-200 overflow-hidden">
            {CUSTOM_TYPES.map(tp => (
              <button key={tp} type="button" onClick={() => add(tp)} className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0">{CUSTOM_BLOCK_LABELS[tp]}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
