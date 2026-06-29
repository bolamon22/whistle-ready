'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import { ChevronDown, Plus, Trash2, Save, ExternalLink, ImagePlus, Sparkles } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import AiGenerateButton from '@/components/AiGenerateButton'
import BlockBuilder from '@/components/BlockBuilder'
import GalleryPicker from '@/components/GalleryPicker'
import { resolveBlocks, Block } from '@/lib/eventBlocks'

type Loc = { name: string; address: string; mapUrl: string; fieldMapUrl: string }
type Contact = { name: string; role: string; phone: string; email: string }
type Content = {
  overview: string; feesText: string; divisionsText: string; ageChartUrl: string; heroImage: string
  locations: Loc[]; hotels: string; hotelsUrl: string; rules: string; rulesSourceId?: string; contacts: Contact[]
  sectionOrder?: string[]; hiddenSections?: string[]
  blocks?: Block[]
}
const EMPTY: Content = { overview: '', feesText: '', divisionsText: '', ageChartUrl: '', heroImage: '', locations: [], hotels: '', hotelsUrl: '', rules: '', rulesSourceId: '', contacts: [], sectionOrder: [], hiddenSections: [], blocks: [] }

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

function Sec({ title, summary, isOpen, onToggle, children }: { title: string; summary?: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="card mb-4 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left">
        <h2 className="font-semibold text-slate-800 flex-1">{title}</h2>
        {summary ? <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{summary}</span> : null}
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </section>
  )
}

export default function EventPageEditor() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [c, setC] = useState<Content>(EMPTY)
  const [open, setOpen] = useState<Record<string, boolean>>({ layout: true, overview: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [genFaq, setGenFaq] = useState(false)
  const [regDivs, setRegDivs] = useState<string[]>([])
  const [ruleSets, setRuleSets] = useState<{ id: string; name: string; format?: string; body: string }[]>([])

  useEffect(() => {
    fetch('/api/org-rules').then(r => r.ok ? r.json() : { sets: [] }).then(d => setRuleSets(Array.isArray(d.sets) ? d.sets : [])).catch(() => {})
        fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined)
        try { const divs = JSON.parse(d.registrationDivisions || '[]'); if (Array.isArray(divs)) setRegDivs(divs.filter(Boolean)) } catch {}
      }
    }).catch(() => {})
    fetch(`/api/tournaments/${id}/site`).then(r => r.ok ? r.json() : {}).then(d => {
      setC(prev => ({ ...EMPTY, ...d, locations: Array.isArray(d.locations) ? d.locations : [], contacts: Array.isArray(d.contacts) ? d.contacts : [], divisionsText: d.divisionsText || prev.divisionsText }))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/site`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      if (res.ok) toast.success('Event page saved')
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }
  async function generateFaqs() {
    setGenFaq(true)
    try {
      await fetch(`/api/tournaments/${id}/site`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) })
      const res = await fetch(`/api/tournaments/${id}/generate-faqs`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        const fresh = await fetch(`/api/tournaments/${id}/site`).then(r => r.ok ? r.json() : null)
        if (fresh) setC(prev => ({ ...EMPTY, ...fresh, locations: Array.isArray(fresh.locations) ? fresh.locations : [], contacts: Array.isArray(fresh.contacts) ? fresh.contacts : [], divisionsText: fresh.divisionsText || prev.divisionsText }))
        toast.success(d.added ? `Added ${d.added} FAQ${d.added === 1 ? '' : 's'} from event details` : 'FAQs already up to date')
      } else toast.error(d.error || 'Could not generate FAQs')
    } catch { toast.error('Could not generate FAQs') } finally { setGenFaq(false) }
  }
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const fieldMapUpload = async (i: number, f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, fieldMapUrl: u } : x) })); else toast.error('Upload failed') }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto">
        <Toaster position="top-right" />
        <TournamentNav id={id} name={name} logoUrl={logo} />

        <div className="flex items-center justify-between mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Event page</h1>
            <p className="text-sm text-slate-500">Public info parents &amp; coaches see for this tournament.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/tournaments/${id}/event`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> View</Link>
            <button onClick={save} disabled={saving} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

        <Sec title="Hero banner" summary={c.heroImage ? 'Set' : 'Empty'} isOpen={!!open.hero} onToggle={() => toggle('hero')}>
          <p className="text-xs text-slate-500 mb-3">Optional background image shown behind the tournament name at the top of the event page (and the register / waiver / rules headers). A dark overlay keeps the white text readable.</p>
          <div className="flex items-center gap-3">
            {c.heroImage ? <img src={c.heroImage} alt="" className="h-20 w-36 object-cover rounded-lg border border-slate-200" /> : <div className="h-20 w-36 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={18} /></div>}
            <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">{c.heroImage ? 'Replace' : 'Upload'}<input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const u = await uploadImage(f); if (u) setC(v => ({ ...v, heroImage: u })); else toast.error('Upload failed') }} /></label>
            <GalleryPicker label="From library" onPick={(url) => setC(v => ({ ...v, heroImage: url }))} />
            {c.heroImage && <button type="button" onClick={() => setC(v => ({ ...v, heroImage: '' }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
          </div>
        </Sec>

        <Sec title="Page builder" summary="Drag, add, hide" isOpen={!!open.layout} onToggle={() => toggle('layout')}>
          <p className="text-xs text-slate-500 mb-3">Drag to reorder how blocks appear on the public event page, hide ones you don&apos;t need, or add custom blocks. Built-in sections pull their content from the fields below; custom blocks are edited right here. Empty sections never show.</p>
          <div className="mb-3">
            <button type="button" onClick={generateFaqs} disabled={genFaq} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"><Sparkles size={14} /> {genFaq ? 'Generating…' : 'Generate FAQs from event details'}</button>
            <p className="text-[11px] text-slate-400 mt-1">Builds a Q&amp;A block from this tournament's dates, location, format, divisions, fees and registration — great for visitors and AI search. Edit or remove any after.</p>
          </div>
          <BlockBuilder blocks={resolveBlocks(c)} onChange={(blocks) => setC(v => ({ ...v, blocks }))} />
        </Sec>

        <Sec title="Overview" summary={c.overview ? 'Set' : 'Empty'} isOpen={!!open.overview} onToggle={() => toggle('overview')}>
          <label className={labelCls}>Summary</label>
          <AiGenerateButton kind="overview" current={c.overview} onResult={(t) => setC(v => ({ ...v, overview: t }))} />
          <MarkdownField value={c.overview} onChange={val => setC(v => ({ ...v, overview: val }))} minHeight={140} placeholder="Welcome blurb about this tournament…" />
          <p className="text-xs text-slate-400 mt-1">Supports Markdown (## headings, **bold**, - bullets).</p>
        </Sec>

        <Sec title="Tournament fees" summary="Auto from pricing" isOpen={!!open.fees} onToggle={() => toggle('fees')}>
          <p className="text-sm text-slate-500">The fee schedule on the event page is generated automatically from your <a href={`/tournaments/${id}/builder`} className="text-teal-700 hover:text-teal-900 underline">registration pricing</a> (team rates, volume discounts, early-bird dates) — no need to retype it here. To hide it from the public page, use the Page builder above.</p>
        </Sec>

        <Sec title="Divisions" summary={`${regDivs.length} from setup`} isOpen={!!open.divisions} onToggle={() => toggle('divisions')}>
          <p className="text-xs text-slate-500 mb-3">Divisions are pulled automatically from <a href={`/tournaments/${id}/builder`} className="text-teal-700 hover:text-teal-900 underline">Setup &rsaquo; Divisions</a> and stay in sync with the event page — no need to retype them here.</p>
          {regDivs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {regDivs.map((d, i) => <span key={i} className="text-sm bg-slate-100 text-slate-700 rounded-full px-3 py-1">{d}</span>)}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No divisions selected yet in Setup &rsaquo; Divisions.</p>
          )}
          <label className={`${labelCls} mt-4`}>Age chart / eligibility link (optional)</label>
          <input className={inputCls} value={c.ageChartUrl} onChange={e => setC(v => ({ ...v, ageChartUrl: e.target.value }))} placeholder="https://…" />
        </Sec>

        <Sec title="Location" summary={`${c.locations.length}`} isOpen={!!open.locations} onToggle={() => toggle('locations')}>
          <div className="flex justify-end mb-2"><button onClick={() => setC(v => ({ ...v, locations: [...v.locations, { name: '', address: '', mapUrl: '', fieldMapUrl: '' }] }))} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add location</button></div>
          {c.locations.length === 0 && <p className="text-sm text-slate-400">No locations yet.</p>}
          <div className="space-y-3">
            {c.locations.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <input className="input flex-1" value={l.name} onChange={e => setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Venue name (e.g. Village Park)" />
                  <button onClick={() => setC(v => ({ ...v, locations: v.locations.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
                <input className="input mt-2" value={l.address} onChange={e => setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, address: e.target.value } : x) }))} placeholder="Street address" />
                <input className="input mt-2" value={l.mapUrl} onChange={e => setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, mapUrl: e.target.value } : x) }))} placeholder="Google Maps link (optional)" />
                <p className="text-xs text-slate-400 mt-1">A Google map embeds automatically from the street address. The field map image is clickable to enlarge on the public page.</p>
                <div className="flex items-center gap-3 mt-2">
                  {l.fieldMapUrl ? <img src={l.fieldMapUrl} alt="" className="h-16 w-24 object-cover rounded-lg border border-slate-200" /> : <div className="h-16 w-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={16} /></div>}
                  <label className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer">Field map<input type="file" accept="image/*" className="hidden" onChange={e => fieldMapUpload(i, e.target.files?.[0])} /></label>
                  <GalleryPicker label="From library" accept="any" triggerClassName="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1" onPick={(url) => setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, fieldMapUrl: url } : x) }))} />
                  {l.fieldMapUrl && <button onClick={() => setC(v => ({ ...v, locations: v.locations.map((x, j) => j === i ? { ...x, fieldMapUrl: '' } : x) }))} className="text-sm text-slate-400 hover:text-red-600">Remove</button>}
                </div>
              </div>
            ))}
          </div>
        </Sec>

        <Sec title="Hotels" summary={c.hotelsUrl || c.hotels ? 'Set' : 'Empty'} isOpen={!!open.hotels} onToggle={() => toggle('hotels')}>
          <label className={labelCls}>Booking link (housing company)</label>
          <input className={inputCls} value={c.hotelsUrl} onChange={e => setC(v => ({ ...v, hotelsUrl: e.target.value }))} placeholder="https://book.housingcompany.com/…" />
          <p className="text-xs text-slate-400 mt-1">Shows as a “Book hotels” button on the event page.</p>
          <label className={labelCls}>Details (optional)</label>
          <AiGenerateButton kind="custom" current={c.hotels} onResult={(t) => setC(v => ({ ...v, hotels: t }))} />
          <MarkdownField value={c.hotels} onChange={val => setC(v => ({ ...v, hotels: val }))} minHeight={120} placeholder="Stay-to-play info, room blocks, notes…" />
          <p className="text-xs text-slate-400 mt-1">Supports Markdown, including [links](https://…).</p>
        </Sec>

        <Sec title="Rules" summary={c.rulesSourceId ? (ruleSets.find(r => r.id === c.rulesSourceId)?.name || 'Linked') : (c.rules ? 'Custom' : 'Empty')} isOpen={!!open.rules} onToggle={() => toggle('rules')}>
          {ruleSets.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Rules source</label>
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" value={c.rulesSourceId || ''} onChange={e => setC(v => ({ ...v, rulesSourceId: e.target.value }))}>
                <option value="">Custom for this event</option>
                {ruleSets.map(r => <option key={r.id} value={r.id}>{r.name}{r.format ? ` (${r.format})` : ''}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Link to a set from your <a href="/dashboard/org/rules" className="text-teal-700 hover:underline">Rules library</a> (edits there update every linked event), or keep custom rules just for this event.</p>
            </div>
          )}
          {c.rulesSourceId ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Linked to <b>{ruleSets.find(r => r.id === c.rulesSourceId)?.name || 'a rule set'}</b> — edit it in the <a href="/dashboard/org/rules" className="text-teal-700 hover:underline">Rules library</a>.</p>
              <div className="text-sm text-slate-600 whitespace-pre-line max-h-40 overflow-y-auto bg-white rounded-lg p-3 border border-slate-100">{ruleSets.find(r => r.id === c.rulesSourceId)?.body || <span className="text-slate-400">No rules text in this set yet.</span>}</div>
            </div>
          ) : (
            <>
              <AiGenerateButton kind="custom" current={c.rules} onResult={(t) => setC(v => ({ ...v, rules: t }))} />
              <MarkdownField value={c.rules} onChange={val => setC(v => ({ ...v, rules: val }))} minHeight={120} placeholder="Rules, policies, or links…" />
              <p className="text-xs text-slate-400 mt-1">Supports Markdown.</p>
            </>
          )}
        </Sec>

        <Sec title="Contacts" summary={`${c.contacts.length}`} isOpen={!!open.contacts} onToggle={() => toggle('contacts')}>
          <div className="flex justify-end mb-2"><button onClick={() => setC(v => ({ ...v, contacts: [...v.contacts, { name: '', role: '', phone: '', email: '' }] }))} className="text-sm text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={14} /> Add contact</button></div>
          {c.contacts.length === 0 && <p className="text-sm text-slate-400">No contacts yet.</p>}
          <div className="space-y-3">
            {c.contacts.map((ct, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <input className="input flex-1" value={ct.name} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} placeholder="Name" />
                  <button onClick={() => setC(v => ({ ...v, contacts: v.contacts.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2 mt-2">
                  <input className="input" value={ct.role} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, role: e.target.value } : x) }))} placeholder="Role (e.g. Director)" />
                  <input className="input" value={ct.phone} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, phone: e.target.value } : x) }))} placeholder="Phone" />
                  <input className="input" value={ct.email} onChange={e => setC(v => ({ ...v, contacts: v.contacts.map((x, j) => j === i ? { ...x, email: e.target.value } : x) }))} placeholder="Email" />
                </div>
              </div>
            ))}
          </div>
        </Sec>
      </div>
    </div>
  )
}
