'use client'

// Public event-page content (overview, hotels, rules, contacts, hero, layout),
// extracted so the Setup wizard can host it alongside the operational config —
// one place to set a tournament up instead of two.
//
// Content lives in AppSetting `tournamentSite:{id}` via /api/tournaments/[id]/site,
// which is a DIFFERENT store from the Tournament row the wizard PATCHes. The wizard
// saves both; `saveEventContent` is exported so it can do that in one action.
//
// Deliberately NOT here:
//   Location  — venues own address/map now (Setup › Venues & fields)
//   Divisions — mirrors Setup › Divisions; the age-chart link moved there
//   Fees      — auto-generated from registration pricing

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ImagePlus, Sparkles } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import AiGenerateButton from '@/components/AiGenerateButton'
import BlockBuilder from '@/components/BlockBuilder'
import GalleryPicker from '@/components/GalleryPicker'
import { resolveBlocks, Block } from '@/lib/eventBlocks'

export type Loc = { name: string; address: string; mapUrl: string; fieldMapUrl: string }
export type Contact = { name: string; role: string; phone: string; email: string }
export type EventContent = {
  overview: string; ageChartUrl: string; heroImage: string
  locations: Loc[]; hotels: string; hotelsUrl: string
  rules: string; rulesSourceId?: string; contacts: Contact[]
  sectionOrder?: string[]; hiddenSections?: string[]
  blocks?: Block[]
}
export const EMPTY_EVENT_CONTENT: EventContent = {
  overview: '', ageChartUrl: '', heroImage: '', locations: [], hotels: '', hotelsUrl: '',
  rules: '', rulesSourceId: '', contacts: [], sectionOrder: [], hiddenSections: [], blocks: [],
}

export type RuleSet = { id: string; name: string; format?: string; body: string }

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

async function compressImage(file: File, maxDim = 1400, quality = 0.82): Promise<Blob> {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return file
  if (file.size < 400 * 1024) return file
  try {
    const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(file) })
    const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl })
    let width = img.width, height = img.height
    if (Math.max(width, height) > maxDim) { const sc = maxDim / Math.max(width, height); width = Math.round(width * sc); height = Math.round(height * sc) }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d'); if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch { return file }
}

async function uploadImage(file: File): Promise<string | null> {
  try {
    const blob = await compressImage(file)
    const fd = new FormData(); fd.append('file', blob, 'upload.jpg')
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!r.ok) return null
    const d = await r.json().catch(() => ({})); return d.url || null
  } catch { return null }
}

/** Loads + saves the public event content for a tournament. */
export function useEventContent(id: string) {
  const [content, setContent] = useState<EventContent>(EMPTY_EVENT_CONTENT)
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}/site`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setContent(() => {
        // Stored values may be null/undefined; coerce so consumers can safely
        // call .trim() without crashing the page.
        const str = (v: any) => typeof v === 'string' ? v : ''
        return {
          ...EMPTY_EVENT_CONTENT, ...d,
          overview: str(d?.overview), ageChartUrl: str(d?.ageChartUrl), heroImage: str(d?.heroImage),
          hotels: str(d?.hotels), hotelsUrl: str(d?.hotelsUrl),
          rules: str(d?.rules), rulesSourceId: str(d?.rulesSourceId),
          locations: Array.isArray(d?.locations) ? d.locations : [],
          contacts: Array.isArray(d?.contacts) ? d.contacts : [],
        }
      }))
      .catch(() => {})
      .finally(() => setLoaded(true))
    fetch('/api/org-rules')
      .then(r => r.ok ? r.json() : {})
      .then(d => setRuleSets(Array.isArray(d.sets) ? d.sets : []))
      .catch(() => {})
  }, [id])

  /** Persist the content. Returns true on success — never throws. */
  const saveEventContent = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tournaments/${id}/site`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      return res.ok
    } catch { return false }
  }, [id, content])

  return { content, setContent, ruleSets, loaded, saveEventContent }
}

export type EventSectionKey = 'overview' | 'hotels' | 'rules' | 'contacts' | 'hero' | 'pagebuilder'

export default function EventContentSection({
  section, id, content: c, setContent: setC, ruleSets,
}: {
  section: EventSectionKey
  id: string
  content: EventContent
  setContent: React.Dispatch<React.SetStateAction<EventContent>>
  ruleSets: RuleSet[]
}) {
  const [genFaq, setGenFaq] = useState(false)

  async function generateFaqs() {
    setGenFaq(true)
    try {
      // Save first so the generator sees the latest details.
      await fetch(`/api/tournaments/${id}/site`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      const res = await fetch(`/api/tournaments/${id}/generate-faqs`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        const fresh = await fetch(`/api/tournaments/${id}/site`).then(r => r.ok ? r.json() : null)
        if (fresh) setC(prev => ({ ...EMPTY_EVENT_CONTENT, ...fresh, locations: Array.isArray(fresh.locations) ? fresh.locations : [], contacts: Array.isArray(fresh.contacts) ? fresh.contacts : [] }))
        toast.success(d.added ? `Added ${d.added} FAQ${d.added === 1 ? '' : 's'} from event details` : 'FAQs already up to date')
      } else toast.error(d.error || 'Could not generate FAQs')
    } catch { toast.error('Could not generate FAQs') } finally { setGenFaq(false) }
  }

  if (section === 'hero') return (
    <div>
      <p className="text-sm text-slate-500 mb-4">Optional background image shown behind the tournament name at the top of the event page (and the register / waiver / rules headers). A dark overlay keeps the white text readable.</p>
      <div className="flex items-center gap-3 flex-wrap">
        {c.heroImage
          ? <img src={c.heroImage} alt="" className="h-20 w-36 object-cover rounded-lg border border-slate-200" />
          : <div className="h-20 w-36 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={18} /></div>}
        <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">
          {c.heroImage ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, heroImage: u })); else toast.error('Upload failed') }} />
        </label>
        <GalleryPicker label="From library" onPick={(url) => setC(v => ({ ...v, heroImage: url }))} />
        {c.heroImage && <button type="button" onClick={() => setC(v => ({ ...v, heroImage: '' }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
      </div>
    </div>
  )

  if (section === 'pagebuilder') return (
    <div>
      <p className="text-sm text-slate-500 mb-3">Drag to reorder how blocks appear on the public event page, hide ones you don&apos;t need, or add custom blocks. Built-in sections pull their content from the other Public sections; custom blocks are edited right here. Empty sections never show.</p>
      <div className="mb-3">
        <button type="button" onClick={generateFaqs} disabled={genFaq} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50">
          <Sparkles size={14} /> {genFaq ? 'Generating…' : 'Generate FAQs from event details'}
        </button>
        <p className="text-[11px] text-slate-400 mt-1">Builds a Q&amp;A block from this tournament&apos;s dates, location, format, divisions, fees and registration — great for visitors and AI search. Edit or remove any after.</p>
      </div>
      <BlockBuilder blocks={resolveBlocks(c)} onChange={(blocks) => setC(v => ({ ...v, blocks }))} />
    </div>
  )

  if (section === 'overview') return (
    <div>
      <label className={labelCls}>Summary</label>
      <AiGenerateButton kind="overview" current={c.overview} onResult={(t) => setC(v => ({ ...v, overview: t }))} />
      <MarkdownField value={c.overview} onChange={val => setC(v => ({ ...v, overview: val }))} minHeight={140} placeholder="Welcome blurb about this tournament…" />
      <p className="text-xs text-slate-400 mt-1">Supports Markdown (## headings, **bold**, - bullets).</p>
    </div>
  )

  if (section === 'hotels') return (
    <div>
      <label className={labelCls}>Booking link (housing company)</label>
      <input className={inputCls} value={c.hotelsUrl} onChange={e => setC(v => ({ ...v, hotelsUrl: e.target.value }))} placeholder="https://book.housingcompany.com/…" />
      <p className="text-xs text-slate-400 mt-1">Shows as a “Book hotels” button on the event page.</p>
      <label className={labelCls}>Details (optional)</label>
      <AiGenerateButton kind="custom" current={c.hotels} onResult={(t) => setC(v => ({ ...v, hotels: t }))} />
      <MarkdownField value={c.hotels} onChange={val => setC(v => ({ ...v, hotels: val }))} minHeight={120} placeholder="Stay-to-play info, room blocks, notes…" />
      <p className="text-xs text-slate-400 mt-1">Supports Markdown, including [links](https://…).</p>
    </div>
  )

  if (section === 'rules') return (
    <div>
      {ruleSets.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Rules source</label>
          <select className={inputCls} value={c.rulesSourceId || ''} onChange={e => setC(v => ({ ...v, rulesSourceId: e.target.value }))}>
            <option value="">Custom for this event</option>
            {ruleSets.map(r => <option key={r.id} value={r.id}>{r.name}{r.format ? ` (${r.format})` : ''}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">Link to a set from your <a href="/dashboard/org/rules" className="text-teal-700 hover:underline">Rules library</a> (edits there update every linked event), or keep custom rules just for this event.</p>
        </div>
      )}
      {c.rulesSourceId ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-2">Linked to <b>{ruleSets.find(r => r.id === c.rulesSourceId)?.name || 'a rule set'}</b> — edit it in the <a href="/dashboard/org/rules" className="text-teal-700 hover:underline">Rules library</a>.</p>
          <div className="text-sm text-slate-600 whitespace-pre-line max-h-60 overflow-y-auto bg-white rounded-lg p-3 border border-slate-100">{ruleSets.find(r => r.id === c.rulesSourceId)?.body || <span className="text-slate-400">No rules text in this set yet.</span>}</div>
        </div>
      ) : (
        <>
          <AiGenerateButton kind="custom" current={c.rules} onResult={(t) => setC(v => ({ ...v, rules: t }))} />
          <MarkdownField value={c.rules} onChange={val => setC(v => ({ ...v, rules: val }))} minHeight={120} placeholder="Rules, policies, or links…" />
          <p className="text-xs text-slate-400 mt-1">Supports Markdown.</p>
        </>
      )}
    </div>
  )

  if (section === 'contacts') return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-slate-500">Who teams should contact with questions. Shown on the public event page.</p>
        <button type="button" onClick={() => setC(v => ({ ...v, contacts: [...v.contacts, { name: '', role: '', phone: '', email: '' }] }))} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add contact</button>
      </div>
      {c.contacts.length === 0 && <p className="text-sm text-slate-400">No contacts yet.</p>}
      <div className="space-y-3">
        {c.contacts.map((ct, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <input className={inputCls} value={ct.name} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Name" />
              <button type="button" onClick={() => setC(v => ({ ...v, contacts: v.contacts.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-2">
              <input className={inputCls} value={ct.role} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, role: e.target.value } : x) }))} placeholder="Role (e.g. Tournament Director)" />
              <input className={inputCls} value={ct.phone} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, phone: e.target.value } : x) }))} placeholder="Phone" />
              <input className={inputCls} value={ct.email} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, email: e.target.value } : x) }))} placeholder="Email" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return null
}
