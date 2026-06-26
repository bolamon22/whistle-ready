'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronDown, FileText, ClipboardList, Save, ExternalLink, Link2, Inbox, Pencil, X, Users, ImagePlus } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import RegConfirmationEditor from '@/components/RegConfirmationEditor'
import { DEFAULT_REG_CONFIRMATION, type RegConfirmation } from '@/lib/regConfirmation'

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
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

const DEFAULT_WAIVER = `## 1. Acknowledgment of Risk
I understand that lacrosse is a high-intensity sport involving aggressive play and physical contact. I acknowledge that participation carries inherent risks, including but not limited to:
- Serious physical injury, permanent disability, or death.
- Head and neck injuries, including concussions, even when proper protective headgear is worn.
- Exposure to communicable diseases or illnesses.
I voluntarily and freely choose to incur these risks and assume full responsibility for my/my child's participation.

## 2. Medical Authorization & Responsibility
In the event of an injury or medical emergency, I hereby grant permission to the tournament organizers and their contracted athletic trainers or staff to facilitate medical treatment.

## 3. Release of Liability & Hold Harmless
I release, waive, discharge, and hold harmless the tournament organizers, their owners, employees, coaches, volunteers, and the facility from any and all liability arising out of participation in this event.

## 4. Media Release
I grant the tournament organizers the right to use photographs or video footage of me/my child for promotional purposes.

## 5. Electronic Signature & Verification
By submitting this form, I verify that I have read and understood this waiver, that I am at least 18 years of age, that I am the participant or the legal parent/guardian of the minor participant, and that my typed name constitutes my legal electronic signature.`

type PlayerForm = {
  waiverTitle: string; waiverText: string
  fields: { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean }
  confirmationTitle: string; confirmationMessage: string; emailConfirmation: boolean
}
type VendorForm = {
  disclaimer: string; levels: string[]; paymentOptions: string[]
  confirmationTitle: string; confirmationMessage: string; emailConfirmation: boolean
}
type StaffForm = {
  enabled: boolean; heroImage: string
  intro: string; positions: string[]; refLevels: string[]; ageLabel: string
  confirmationTitle: string; confirmationMessage: string; emailConfirmation: boolean
}
type Forms = { player: PlayerForm; vendor: VendorForm; staff: StaffForm; registration: RegConfirmation }

const EMPTY: Forms = {
  player: {
    waiverTitle: 'Player Participation Waiver & Release of Liability', waiverText: DEFAULT_WAIVER,
    fields: { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false },
    confirmationTitle: "You're registered!",
    confirmationMessage: "Thanks for registering. We've received your information and signed waiver. We'll be in touch with event details — see you on the field!",
    emailConfirmation: true,
  },
  vendor: {
    disclaimer: "Vendors are not allowed to sell tournament merchandise unless receiving prior approval from the organizer. Items not pre-approved on this application must be removed from the booth or may result in denied future access. Products that do not fit the mission of the event or are deemed not family-friendly will not be allowed to be sold.",
    levels: ['Food Vendor', 'Merchandise Vendor', 'Bronze Sponsor', 'Silver Sponsor', 'Gold Sponsor'],
    paymentOptions: ['Check', 'Venmo', 'Zelle', 'Invoice me'],
    confirmationTitle: 'Vendor request received!',
    confirmationMessage: "Thanks! We've received your vendor request and will be in touch about next steps and payment.",
    emailConfirmation: true,
  },
  staff: {
    enabled: true, heroImage: '',
    intro: "We're looking for officials, scorekeepers, trainers, and event staff to help us run a great event. Tell us about yourself and we'll be in touch about open positions.",
    positions: ['Referee / Official', 'Scorekeeper', 'Field / Event staff', 'Athletic trainer / Medical'],
    refLevels: ['Level 1 / Local', 'Level 2', 'Level 3', 'Regional', 'National', 'Other'],
    ageLabel: 'I am at least 16 years old (or in high school or older)',
    confirmationTitle: 'Application received!',
    confirmationMessage: "Thanks for your interest in working our events! We've received your application and will reach out about open positions.",
    emailConfirmation: true,
  },
  registration: DEFAULT_REG_CONFIRMATION,
}

const FIELD_LABELS: { key: keyof PlayerForm['fields']; label: string; hint: string }[] = [
  { key: 'gender', label: 'Gender', hint: 'Female / Male select' },
  { key: 'grade', label: 'Player grade', hint: 'K–12 select' },
  { key: 'teamName', label: 'Team or club name', hint: 'Text field' },
  { key: 'parent2', label: 'Second parent', hint: 'Name, email, phone' },
  { key: 'hotelQuestion', label: 'Hotel / rental question', hint: 'Are you staying at a hotel?' },
  { key: 'newsletter', label: 'Newsletter opt-in', hint: 'Subscribe to updates' },
]

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

function FormsInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const sp = useSearchParams()
  const qOrg = sp.get('org') || ''
  const qName = sp.get('name') || ''
  const qSlug = sp.get('slug') || ''
  const apiQ = qOrg ? `?org=${encodeURIComponent(qOrg)}` : ''
  const [orgName, setOrgName] = useState(qName)
  const [slug, setSlug] = useState(qSlug)
  const [f, setF] = useState<Forms>(EMPTY)
  const [snap, setSnap] = useState<Forms>(EMPTY)
  const [subs, setSubs] = useState<any[]>([])
  const [open, setOpen] = useState<{ [k: string]: boolean }>({})
  const [editing, setEditing] = useState<{ [k: string]: boolean }>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    ;(async () => {
      try {
        if (!qOrg) { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) { setOrgName(o.name); setSlug(o.slug) } }
        const d = await fetch(`/api/org-forms${apiQ}`).then(r => r.ok ? r.json() : {})
        const p = d.player || {}; const vv = d.vendor || {}; const st = d.staff || {}
        const merged: Forms = {
          player: { ...EMPTY.player, ...p, fields: { ...EMPTY.player.fields, ...(p.fields || {}) } },
          vendor: { ...EMPTY.vendor, ...vv, levels: Array.isArray(vv.levels) ? vv.levels : EMPTY.vendor.levels, paymentOptions: Array.isArray(vv.paymentOptions) ? vv.paymentOptions : EMPTY.vendor.paymentOptions },
          staff: { ...EMPTY.staff, ...st, positions: Array.isArray(st.positions) ? st.positions : EMPTY.staff.positions, refLevels: Array.isArray(st.refLevels) ? st.refLevels : EMPTY.staff.refLevels },
          registration: { ...EMPTY.registration, ...(d.registration || {}) },
        }
        setF(merged); setSnap(merged)
        const sj = await fetch(`/api/org-forms/submit${apiQ}`).then(r => r.ok ? r.json() : { submissions: [] })
        setSubs(Array.isArray(sj.submissions) ? sj.submissions : [])
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  async function saveCard(key: string) {
    setSaving(key)
    try {
      const res = await fetch(`/api/org-forms${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      if (res.ok) { toast.success('Saved'); setSnap(f); setEditing(e => ({ ...e, [key]: false })) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving('') }
  }
  const startEdit = (key: string) => { setSnap(f); setEditing(e => ({ ...e, [key]: true })); setOpen(o => ({ ...o, [key]: true })) }
  const cancelEdit = (key: string) => { setF(snap); setEditing(e => ({ ...e, [key]: false })) }
  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }))
  const staffHero = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setF(v => ({ ...v, staff: { ...v.staff, heroImage: u } })); else toast.error('Upload failed') }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>
  const pf = f.player, vf = f.vendor, stf = f.staff, rf = f.registration
  const playerSubs = subs.filter(s => s.formType !== 'vendor' && s.formType !== 'staff')
  const vendorSubs = subs.filter(s => s.formType === 'vendor')
  const staffSubs = subs.filter(s => s.formType === 'staff')
  const playerPath = slug ? `/o/${slug}/register/player` : ''
  const vendorPath = slug ? `/o/${slug}/register/vendor` : ''
  const staffPath = slug ? `/o/${slug}/work` : ''
  const copy = (path: string) => { if (!path) return; navigator.clipboard?.writeText(`${window.location.origin}${path}`).then(() => toast.success('Link copied')).catch(() => toast.error('Copy failed')) }
  const enabledFields = FIELD_LABELS.filter(fl => pf.fields[fl.key]).map(fl => fl.label)

  function Header({ k, icon, title, desc, summary }: { k: string; icon: any; title: string; desc: string; summary: string }) {
    return (
      <button onClick={() => toggle(k)} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><h2 className="font-semibold text-slate-800">{title}</h2><span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{summary}</span></div>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
        <ChevronDown size={18} className={`text-slate-400 flex-shrink-0 transition-transform ${open[k] ? 'rotate-180' : ''}`} />
      </button>
    )
  }
  function LinkRow({ path }: { path: string }) {
    return path ? (
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
        <Link2 size={14} className="text-slate-400 flex-shrink-0" />
        <code className="text-xs text-slate-600 truncate flex-1">{path}</code>
        <a href={path} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ExternalLink size={12} /> View</a>
        <button onClick={() => copy(path)} className="text-xs font-medium text-teal-700 hover:text-teal-900 flex-shrink-0">Copy</button>
      </div>
    ) : null
  }
  function EditBar({ k }: { k: string }) {
    return editing[k] ? (
      <div className="flex items-center gap-2">
        <button onClick={() => cancelEdit(k)} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><X size={14} /> Cancel</button>
        <button onClick={() => saveCard(k)} disabled={saving === k} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"><Save size={14} /> {saving === k ? 'Saving…' : 'Save'}</button>
      </div>
    ) : (
      <button onClick={() => startEdit(k)} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><Pencil size={14} /> Edit</button>
    )
  }
  const ro = (s: string) => <div className="text-sm text-slate-700 whitespace-pre-line">{s || <span className="text-slate-400">—</span>}</div>

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Toaster position="top-right" />
      <div className="mb-6">
        <Link href="/dashboard/org" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ChevronLeft size={14} /> Your team</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Forms</h1>
        <p className="text-sm text-slate-500">Reusable forms for {orgName || 'your organization'}. New tournaments copy these as their starting point.</p>
      </div>

{/* REGISTRATION CONFIRMATION */}
      <section className="card mb-4 overflow-hidden">
        <Header k="reg" icon={<ClipboardList size={16} />} title="Registration Confirmation" desc="The letter teams see after registering — and the email they receive." summary={rf.enabled ? 'Email on' : 'Email off'} />
        {open.reg && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500 mb-3">Shown on the confirmation screen and emailed to the club contact. Use <code className="bg-slate-100 px-1 rounded">{'{club}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{tournament}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{dates}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{location}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{org}'}</code> — these fill in automatically. The teams, fees and links are added for you.</p>
            <div className="flex justify-end mb-3"><EditBar k="reg" /></div>
            {editing.reg ? (
              <RegConfirmationEditor mode="org" value={rf} onChange={patch => setF(v => ({ ...v, registration: { ...v.registration, ...patch } }))} />
            ) : (
              <div className="space-y-2">
                <div><div className={labelCls}>Welcome</div>{ro(rf.welcome)}</div>
                <div><div className={labelCls}>What&apos;s next</div>{ro(rf.nextSteps)}</div>
                <div><div className={labelCls}>Sign-off</div>{ro(rf.signoff)}</div>
                <div className="text-sm text-slate-600">Email confirmation: <span className="font-medium">{rf.enabled ? 'On' : 'Off'}</span></div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* PLAYER WAIVER */}
      <section className="card mb-4 overflow-hidden">
        <Header k="player" icon={<FileText size={16} />} title="Player Waiver" desc="Waiver + optional fields players complete to compete." summary={`${enabledFields.length} fields`} />
        {open.player && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <LinkRow path={playerPath} />
            <div className="flex justify-end mb-3"><EditBar k="player" /></div>
            {editing.player ? (
              <>
                <label className={labelCls}>Waiver title</label>
                <input className={inputCls} value={pf.waiverTitle} onChange={e => setF(v => ({ ...v, player: { ...v.player, waiverTitle: e.target.value } }))} />
                <label className={labelCls}>Waiver text</label>
                <MarkdownField value={pf.waiverText} onChange={val => setF(v => ({ ...v, player: { ...v.player, waiverText: val } }))} minHeight={240} mono placeholder="Waiver text…" />
                <p className="text-xs text-slate-400 mt-1">Supports Markdown (## headings, **bold**, - bullets).</p>
                <label className={labelCls}>Optional fields</label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {FIELD_LABELS.map(fl => (
                    <label key={fl.key} className="flex items-start gap-2 border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" className="mt-0.5 accent-teal-500" checked={pf.fields[fl.key]} onChange={e => setF(v => ({ ...v, player: { ...v.player, fields: { ...v.player.fields, [fl.key]: e.target.checked } } }))} />
                      <span><span className="text-sm text-slate-700 font-medium">{fl.label}</span><br /><span className="text-xs text-slate-400">{fl.hint}</span></span>
                    </label>
                  ))}
                </div>
                <label className={labelCls}>Confirmation title</label>
                <input className={inputCls} value={pf.confirmationTitle} onChange={e => setF(v => ({ ...v, player: { ...v.player, confirmationTitle: e.target.value } }))} />
                <label className={labelCls}>Confirmation message</label>
                <MarkdownField value={pf.confirmationMessage} onChange={val => setF(v => ({ ...v, player: { ...v.player, confirmationMessage: val } }))} minHeight={80} />
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={pf.emailConfirmation} onChange={e => setF(v => ({ ...v, player: { ...v.player, emailConfirmation: e.target.checked } }))} />
                  <span className="text-sm text-slate-700">Email a confirmation to the registrant</span>
                </label>
              </>
            ) : (
              <div className="space-y-3">
                <div><div className={labelCls}>Waiver title</div>{ro(pf.waiverTitle)}</div>
                <div><div className={labelCls}>Waiver text</div><div className="text-sm text-slate-600 whitespace-pre-line max-h-44 overflow-y-auto bg-slate-50 rounded-lg p-3 border border-slate-100">{pf.waiverText}</div></div>
                <div><div className={labelCls}>Optional fields</div><div className="flex flex-wrap gap-1.5">{enabledFields.length ? enabledFields.map(l => <span key={l} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-1">{l}</span>) : <span className="text-slate-400 text-sm">None</span>}</div></div>
                <div><div className={labelCls}>Confirmation</div>{ro(pf.confirmationTitle)}<div className="text-sm text-slate-500 mt-0.5">{pf.confirmationMessage}</div></div>
                <div className="text-sm text-slate-600">Email confirmation: <span className="font-medium">{pf.emailConfirmation ? 'On' : 'Off'}</span></div>
              </div>
            )}
            <div className="mt-5 pt-3 border-t border-slate-100 text-sm text-slate-500 inline-flex items-center gap-1.5"><Inbox size={15} className="text-slate-400" /> {playerSubs.length} submission{playerSubs.length === 1 ? '' : 's'}</div>
          </div>
        )}
      </section>

      {/* VENDOR REQUEST */}
      <section className="card mb-4 overflow-hidden">
        <Header k="vendor" icon={<ClipboardList size={16} />} title="Vendor request" desc="Vendors & sponsors apply to sell or sponsor at your events." summary={`${vf.levels.length} levels`} />
        {open.vendor && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <LinkRow path={vendorPath} />
            <div className="flex justify-end mb-3"><EditBar k="vendor" /></div>
            {editing.vendor ? (
              <>
                <label className={labelCls}>Vendor / sponsor levels (comma separated)</label>
                <input className={inputCls} value={vf.levels.join(', ')} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, levels: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} />
                <label className={labelCls}>Payment options (comma separated)</label>
                <input className={inputCls} value={vf.paymentOptions.join(', ')} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, paymentOptions: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} />
                <label className={labelCls}>Vendor disclaimer</label>
                <MarkdownField value={vf.disclaimer} onChange={val => setF(v => ({ ...v, vendor: { ...v.vendor, disclaimer: val } }))} minHeight={120} />
                <label className={labelCls}>Confirmation title</label>
                <input className={inputCls} value={vf.confirmationTitle} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, confirmationTitle: e.target.value } }))} />
                <label className={labelCls}>Confirmation message</label>
                <MarkdownField value={vf.confirmationMessage} onChange={val => setF(v => ({ ...v, vendor: { ...v.vendor, confirmationMessage: val } }))} minHeight={80} />
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={vf.emailConfirmation} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, emailConfirmation: e.target.checked } }))} />
                  <span className="text-sm text-slate-700">Email a confirmation to the vendor</span>
                </label>
              </>
            ) : (
              <div className="space-y-3">
                <div><div className={labelCls}>Vendor / sponsor levels</div><div className="flex flex-wrap gap-1.5">{vf.levels.map(l => <span key={l} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-1">{l}</span>)}</div></div>
                <div><div className={labelCls}>Payment options</div><div className="flex flex-wrap gap-1.5">{vf.paymentOptions.map(l => <span key={l} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">{l}</span>)}</div></div>
                <div><div className={labelCls}>Disclaimer</div><div className="text-sm text-slate-600 whitespace-pre-line max-h-32 overflow-y-auto bg-slate-50 rounded-lg p-3 border border-slate-100">{vf.disclaimer}</div></div>
                <div><div className={labelCls}>Confirmation</div>{ro(vf.confirmationTitle)}<div className="text-sm text-slate-500 mt-0.5">{vf.confirmationMessage}</div></div>
                <div className="text-sm text-slate-600">Email confirmation: <span className="font-medium">{vf.emailConfirmation ? 'On' : 'Off'}</span></div>
              </div>
            )}
            <div className="mt-5 pt-3 border-t border-slate-100 text-sm text-slate-500 inline-flex items-center gap-1.5"><Inbox size={15} className="text-slate-400" /> {vendorSubs.length} vendor request{vendorSubs.length === 1 ? '' : 's'}</div>
          </div>
        )}
      </section>

      {/* WORK AT OUR EVENT */}
      <section className="card mb-4 overflow-hidden">
        <Header k="staff" icon={<Users size={16} />} title="Work at our event" desc="Referees, scorekeepers, trainers & event staff apply to work your events." summary={stf.enabled === false ? 'Hidden' : `${stf.positions.length} roles`} />
        {open.staff && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <LinkRow path={staffPath} />
            <div className="flex justify-end mb-3"><EditBar k="staff" /></div>
            {editing.staff ? (
              <>
                <label className="flex items-start gap-2 cursor-pointer mb-1">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={stf.enabled !== false} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, enabled: e.target.checked } }))} />
                  <span className="text-sm text-slate-700">Show a &ldquo;Work With Us&rdquo; link on your public site</span>
                </label>
                <label className={labelCls}>Banner image</label>
                <div className="flex items-center gap-3 mb-1">
                  {stf.heroImage ? <img src={stf.heroImage} alt="" className="h-12 w-24 object-cover rounded-lg border border-slate-200" /> : <div className="h-12 w-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={16} /></div>}
                  <div>
                    <label className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer inline-block">Upload image<input type="file" accept="image/*" className="hidden" onChange={e => staffHero(e.target.files?.[0])} /></label>
                    {stf.heroImage && <button onClick={() => setF(v => ({ ...v, staff: { ...v.staff, heroImage: '' } }))} className="text-xs text-slate-400 hover:text-red-600 ml-2">Remove</button>}
                    <p className="text-[11px] text-slate-400 mt-1">Shown behind the page title on the public Work page.</p>
                  </div>
                </div>
                <label className={labelCls}>Intro text</label>
                <MarkdownField value={stf.intro} onChange={val => setF(v => ({ ...v, staff: { ...v.staff, intro: val } }))} minHeight={90} />
                <label className={labelCls}>Positions (comma separated)</label>
                <input className={inputCls} value={stf.positions.join(', ')} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, positions: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} />
                <label className={labelCls}>Officiating certification levels (comma separated)</label>
                <input className={inputCls} value={stf.refLevels.join(', ')} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, refLevels: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} />
                <p className="text-xs text-slate-400 mt-1">Shown (with a Boys / Girls / Both question) when an applicant selects a referee/official role.</p>
                <label className={labelCls}>Age confirmation (leave blank to hide)</label>
                <input className={inputCls} value={stf.ageLabel} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, ageLabel: e.target.value } }))} />
                <label className={labelCls}>Confirmation title</label>
                <input className={inputCls} value={stf.confirmationTitle} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, confirmationTitle: e.target.value } }))} />
                <label className={labelCls}>Confirmation message</label>
                <MarkdownField value={stf.confirmationMessage} onChange={val => setF(v => ({ ...v, staff: { ...v.staff, confirmationMessage: val } }))} minHeight={80} />
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={stf.emailConfirmation} onChange={e => setF(v => ({ ...v, staff: { ...v.staff, emailConfirmation: e.target.checked } }))} />
                  <span className="text-sm text-slate-700">Email a confirmation to the applicant</span>
                </label>
              </>
            ) : (
              <div className="space-y-3">
                <div><div className={labelCls}>Public link</div><div className="text-sm text-slate-600">{stf.enabled === false ? 'Hidden from site nav (form still works by direct link)' : 'Shown as “Work With Us”'}</div></div>
                <div><div className={labelCls}>Positions</div><div className="flex flex-wrap gap-1.5">{stf.positions.map(l => <span key={l} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-1">{l}</span>)}</div></div>
                <div><div className={labelCls}>Officiating levels</div><div className="flex flex-wrap gap-1.5">{stf.refLevels.map(l => <span key={l} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">{l}</span>)}</div></div>
                <div><div className={labelCls}>Intro</div>{ro(stf.intro)}</div>
                <div><div className={labelCls}>Confirmation</div>{ro(stf.confirmationTitle)}<div className="text-sm text-slate-500 mt-0.5">{stf.confirmationMessage}</div></div>
                <div className="text-sm text-slate-600">Email confirmation: <span className="font-medium">{stf.emailConfirmation ? 'On' : 'Off'}</span></div>
              </div>
            )}
            <div className="mt-5 pt-3 border-t border-slate-100 text-sm text-slate-500 inline-flex items-center gap-1.5"><Inbox size={15} className="text-slate-400" /> {staffSubs.length} application{staffSubs.length === 1 ? '' : 's'}</div>
          </div>
        )}
      </section>
    </div>
  )
}

export default function FormsPage() {
  return (
    <Suspense fallback={null}>
      <FormsInner />
    </Suspense>
  )
}
