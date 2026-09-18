'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronDown, FileText, ClipboardList, Save, ExternalLink, Link2, Inbox, Pencil, X, Users, ImagePlus } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import RegConfirmationEditor from '@/components/RegConfirmationEditor'
import PushToggle from '@/components/PushToggle'
import SampleCardEditor from '@/components/SampleCardEditor'
import { DEFAULT_REG_CONFIRMATION, type RegConfirmation } from '@/lib/regConfirmation'
import { isUntouchedLegacyLevels, DEFAULT_VENDOR_HERO, DEFAULT_HEADLINE, DEFAULT_SUBHEAD, DEFAULT_SPONSOR_BLURB, DEFAULT_SPONSOR_TIERS, DEFAULT_VENDOR_TYPES, DEFAULT_APPROVAL_NOTICE, DEFAULT_VENDOR_DISCLAIMER, DEFAULT_CONFIRMATION_TITLE, DEFAULT_CONFIRMATION_MESSAGE, priceLabel, type VendorType, type VendorInstructions, DEFAULT_WEB_ADDON } from '@/lib/vendorForm'

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
  fields: { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean; playerPass: boolean; position: boolean; homeTown: boolean }
  /** Player card: what the second (event / organization) QR code opens. */
  cardEventQr: 'event' | 'instagram' | 'facebook' | 'website' | 'custom'; cardEventLink: string; cardEventLabel: string
  cardTheme: 'classic' | 'brushed' | 'gold' | 'frost'
  /** The example card shown on the registration form — see PlayerCardSample. */
  cardSample: {
    playerName: string; clubName: string; teamName: string; division: string
    jersey: string; position: string; photoUrl: string; clubLogoUrl: string
    qrLink: string; qrLabel: string; qr2Link: string; qr2Label: string; code: string
  }
  confirmationTitle: string; confirmationMessage: string; emailConfirmation: boolean
}
type VendorForm = {
  // `levels` / `paymentOptions` are the pre-2026 shape. They're still read (an org that
  // customised its own level list keeps it) but nothing writes them any more: a vendor
  // now picks a TYPE carrying its own booth fee, and payment happens after approval.
  types: VendorType[]; approvalNotice: string; instructions: VendorInstructions
  heroImage: string; headline: string; subhead: string
  sponsorShow: boolean; sponsorBlurb: string; sponsorTiers: { name: string; price: number }[]; sponsorEmail: string
  webAddOn: { enabled: boolean; name: string; price: number; compareAt: number; note: string }
  notifyEmail: string
  disclaimer: string
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
    fields: { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false, playerPass: false, position: true, homeTown: true },
    cardEventQr: 'event', cardEventLink: '', cardEventLabel: '', cardTheme: 'classic',
    cardSample: { playerName: '', clubName: '', teamName: '', division: '', jersey: '', position: '', photoUrl: '', clubLogoUrl: '', qrLink: '', qrLabel: '', qr2Link: '', qr2Label: '', code: '' },
    confirmationTitle: "You're registered!",
    confirmationMessage: "Thanks for registering. We've received your information and signed waiver. We'll be in touch with event details — see you on the field!",
    emailConfirmation: true,
  },
  vendor: {
    types: DEFAULT_VENDOR_TYPES,
    heroImage: DEFAULT_VENDOR_HERO, headline: DEFAULT_HEADLINE, subhead: DEFAULT_SUBHEAD,
    sponsorShow: true, sponsorBlurb: DEFAULT_SPONSOR_BLURB, sponsorTiers: DEFAULT_SPONSOR_TIERS, sponsorEmail: '', notifyEmail: '',
    webAddOn: DEFAULT_WEB_ADDON,
    approvalNotice: DEFAULT_APPROVAL_NOTICE,
    instructions: { where: '', eventTimes: '', loadIn: '', loadOut: '', bring: '', contact: '' },
    disclaimer: DEFAULT_VENDOR_DISCLAIMER,
    confirmationTitle: DEFAULT_CONFIRMATION_TITLE,
    confirmationMessage: DEFAULT_CONFIRMATION_MESSAGE,
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
  { key: 'position', label: 'Position', hint: 'Attack / Midfield / Defense / Goalie / FOGO / LSM' },
  { key: 'teamName', label: 'Team or club name', hint: 'Text field' },
  { key: 'parent2', label: 'Second parent', hint: 'Name, email, phone' },
  { key: 'homeTown', label: 'Home town', hint: 'City + state the family travels from — what county sports-tourism grants are reported on. Prefills from the club.' },
  { key: 'hotelQuestion', label: 'Hotel / rental question', hint: 'Are you staying at a hotel?' },
  { key: 'newsletter', label: 'Newsletter opt-in', hint: 'Subscribe to updates' },
  { key: 'playerPass', label: 'Player pass', hint: 'Photo upload on tournament waivers + a credential card with a QR code for check-in; staff can print badges' },
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
  const [subCounts, setSubCounts] = useState<Record<string, number>>({})
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
          // Same migration the public pages do: stored types win, a legacy `levels`
          // list is carried across as types, and an org that never customised gets
          // the current defaults.
          vendor: { ...EMPTY.vendor, ...vv,
            types: Array.isArray(vv.types) && vv.types.length ? vv.types
              : Array.isArray(vv.levels) && vv.levels.length && !isUntouchedLegacyLevels(vv.levels)
                ? vv.levels.map((n: string) => ({ id: String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: String(n), price: 0, selling: !/sponsor/i.test(String(n)), closed: false, note: '' }))
                : EMPTY.vendor.types,
            instructions: { ...EMPTY.vendor.instructions, ...(vv.instructions || {}) },
            sponsorTiers: Array.isArray(vv.sponsorTiers) ? vv.sponsorTiers : EMPTY.vendor.sponsorTiers,
            webAddOn: { ...EMPTY.vendor.webAddOn, ...(vv.webAddOn || {}) } },
          staff: { ...EMPTY.staff, ...st, positions: Array.isArray(st.positions) ? st.positions : EMPTY.staff.positions, refLevels: Array.isArray(st.refLevels) ? st.refLevels : EMPTY.staff.refLevels },
          registration: { ...EMPTY.registration, ...(d.registration || {}) },
        }
        setF(merged); setSnap(merged)
        const sj = await fetch(`/api/org-forms/submit${apiQ}`).then(r => r.ok ? r.json() : { submissions: [], counts: {} })
        setSubs(Array.isArray(sj.submissions) ? sj.submissions : [])
        setSubCounts(sj.counts && typeof sj.counts === 'object' ? sj.counts : {})
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
  const vendorHero = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setF(v => ({ ...v, vendor: { ...v.vendor, heroImage: u } })); else toast.error('Upload failed') }
  const staffHero = async (f?: File | null) => { if (!f) return; const u = await uploadImage(f); if (u) setF(v => ({ ...v, staff: { ...v.staff, heroImage: u } })); else toast.error('Upload failed') }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>
  const pf = f.player, vf = f.vendor, stf = f.staff, rf = f.registration

  /** Patch one booth type in place, leaving the others alone. */
  const setVType = (i: number, patch: Partial<VendorType>) =>
    setF(v => ({ ...v, vendor: { ...v.vendor, types: v.vendor.types.map((t, j) => j === i ? { ...t, ...patch } : t) } }))
  // Counts come from the API now (submissions live in their own table); the list itself is no longer downloaded.
  const countOf = (t: string, fallback: any[]) => subCounts[t] ?? fallback.length
  const playerSubs = { length: countOf('player', subs.filter(s => s.formType !== 'vendor' && s.formType !== 'staff')) }
  const vendorSubs = { length: countOf('vendor', subs.filter(s => s.formType === 'vendor')) }
  const staffSubs = { length: countOf('staff', subs.filter(s => s.formType === 'staff')) }
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
            <PushToggle />
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
                {pf.fields.playerPass && (
                  <div className="mt-3 border border-teal-100 bg-teal-50/40 rounded-lg p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Player card · style</div>
                    <div className="grid sm:grid-cols-4 gap-2 mt-2">
                      {([['classic', 'Classic', 'White, navy, teal'], ['brushed', 'Brushed Steel', 'Silver metal, cyan glow'], ['gold', 'Gold Edition', 'Ivory + gold frame'], ['frost', 'Frost', 'Frosted glass, round photo']] as const).map(([id, label, hint]) => (
                        <label key={id} className={`flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer ${(pf.cardTheme || 'classic') === id ? 'border-teal-400 bg-white' : 'border-slate-200 hover:bg-white'}`}>
                          <input type="radio" name="cardTheme" className="mt-0.5 accent-teal-500" checked={(pf.cardTheme || 'classic') === id} onChange={() => setF(v => ({ ...v, player: { ...v.player, cardTheme: id } }))} />
                          <span><span className="text-sm text-slate-700 font-medium">{label}</span><br /><span className="text-xs text-slate-400">{hint}</span></span>
                        </label>
                      ))}
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-teal-700 mt-4">Player card · example shown on the form</div>
                    <p className="text-xs text-slate-500 mt-1">
                      The registration form opens on this card so families can see what they&rsquo;re making, then switches
                      to their own the moment they type a name. Fill it from a finished card, then edit anything.
                      Leave the name blank for a drawn stand-in.
                    </p>
                    <SampleCardEditor value={pf.cardSample} onChange={v => setF(x => ({ ...x, player: { ...x.player, cardSample: v } }))} />

                    <div className="text-xs font-semibold uppercase tracking-wide text-teal-700 mt-4">Player card · second QR code</div>
                    <p className="text-xs text-slate-500 mt-1">The card has two QR codes: the family's own link, and this one for you. Pick what it opens.</p>
                    <div className="grid sm:grid-cols-2 gap-2 mt-2">
                      <select className={inputCls} value={pf.cardEventQr || 'event'} onChange={e => setF(v => ({ ...v, player: { ...v.player, cardEventQr: e.target.value as PlayerForm['cardEventQr'] } }))}>
                        <option value="event">Tournament event page (on your site)</option>
                        <option value="instagram">Your Instagram (from Site settings)</option>
                        <option value="facebook">Your Facebook (from Site settings)</option>
                        <option value="website">Your website</option>
                        <option value="custom">Custom link</option>
                      </select>
                      <input className={inputCls} value={pf.cardEventLabel} onChange={e => setF(v => ({ ...v, player: { ...v.player, cardEventLabel: e.target.value } }))} placeholder="Caption under the code (optional), e.g. Follow us" />
                    </div>
                    {pf.cardEventQr === 'custom' && (
                      <input className={`${inputCls} mt-2`} value={pf.cardEventLink} onChange={e => setF(v => ({ ...v, player: { ...v.player, cardEventLink: e.target.value } }))} inputMode="url" placeholder="https://…" />
                    )}
                  </div>
                )}
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
                {pf.fields.playerPass && <div className="text-sm text-slate-600">Card style: <span className="font-medium">{({ classic: 'Classic', brushed: 'Brushed Steel', gold: 'Gold Edition', frost: 'Frost' } as Record<string, string>)[pf.cardTheme || 'classic']}</span></div>}
                {pf.fields.playerPass && <div className="text-sm text-slate-600">Card's second QR code: <span className="font-medium">{({ event: 'Tournament event page', instagram: 'Instagram', facebook: 'Facebook', website: 'Website', custom: pf.cardEventLink || 'Custom link' } as Record<string, string>)[pf.cardEventQr || 'event']}</span>{pf.cardEventLabel ? ` · “${pf.cardEventLabel}”` : ''}</div>}
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
        <Header k="vendor" icon={<ClipboardList size={16} />} title="Vendor request" desc="Vendors apply for a booth. You approve, then they pay." summary={`${vf.types.filter(t => !t.closed).length} open · ${vf.types.filter(t => t.closed).length} closed`} />
        {open.vendor && (
          <div className="px-4 pb-4 border-t border-slate-100 pt-4">
            <LinkRow path={vendorPath} />
            <div className="flex justify-end mb-3"><EditBar k="vendor" /></div>
            {editing.vendor ? (
              <>
                <label className={labelCls}>Header photo</label>
                <p className="text-xs text-slate-500 -mt-1 mb-2">Sits behind the headline. Defaults to a shot from your gallery with the vendor row in it — swap it once you have a proper booth photo.</p>
                <div className="flex items-center gap-3 mb-4">
                  {vf.heroImage ? <img src={vf.heroImage} alt="" className="h-14 w-28 object-cover rounded-lg border border-slate-200" /> : <div className="h-14 w-28 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><ImagePlus size={16} /></div>}
                  <div>
                    <label className="text-sm font-semibold text-teal-700 hover:text-teal-800 cursor-pointer">
                      Upload<input type="file" accept="image/*" className="hidden" onChange={e => vendorHero(e.target.files?.[0])} />
                    </label>
                    {vf.heroImage && <button type="button" onClick={() => setF(v => ({ ...v, vendor: { ...v.vendor, heroImage: '' } }))} className="text-xs text-slate-400 hover:text-red-600 ml-3">Remove</button>}
                  </div>
                </div>

                <label className={labelCls}>Headline</label>
                <input className={inputCls} value={vf.headline} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, headline: e.target.value } }))} />
                <label className={labelCls}>Sub-headline</label>
                <textarea className={`${inputCls} min-h-[60px]`} value={vf.subhead} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, subhead: e.target.value } }))} />

                <label className={labelCls}>Booth types</label>
                <p className="text-xs text-slate-500 -mt-1 mb-2">The fee is what an approved vendor is asked to pay. Set it to 0 and the form says &ldquo;confirmed on approval&rdquo; instead of showing a number.</p>
                <div className="space-y-2 mb-3">
                  {vf.types.map((t, i) => (
                    <div key={i} className={`rounded-xl border p-3 ${t.closed ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex gap-2">
                        <input className={`${inputCls} flex-1`} value={t.name} placeholder="Onsite vendor"
                          onChange={e => setVType(i, { name: e.target.value })} />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                          <input className={`${inputCls} pl-6 tabular-nums`} type="number" min={0} step={25} value={t.price || 0}
                            onChange={e => setVType(i, { price: Math.max(0, Number(e.target.value) || 0) })} />
                        </div>
                        <button type="button" onClick={() => setF(v => ({ ...v, vendor: { ...v.vendor, types: v.vendor.types.filter((_, j) => j !== i) } }))}
                          className="shrink-0 w-9 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Remove this type"><X size={15} className="mx-auto" /></button>
                      </div>
                      <input className={`${inputCls} mt-2`} value={t.note} placeholder="One line the applicant sees under the name"
                        onChange={e => setVType(i, { note: e.target.value })} />
                      <div className="flex flex-wrap gap-4 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                          <input type="checkbox" className="accent-teal-500" checked={t.selling} onChange={e => setVType(i, { selling: e.target.checked })} />
                          Sells product on site
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                          <input type="checkbox" className="accent-slate-500" checked={t.closed} onChange={e => setVType(i, { closed: e.target.checked })} />
                          Listed but closed
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="text-sm font-semibold text-teal-700 hover:text-teal-800 mb-4"
                  onClick={() => setF(v => ({ ...v, vendor: { ...v.vendor, types: [...v.vendor.types, { id: `type-${Date.now()}`, name: '', price: 0, selling: true, closed: false, note: '' }] } }))}>
                  + Add a booth type
                </button>

                <label className={labelCls}>Notify me at</label>
                <p className="text-xs text-slate-500 -mt-1 mb-1">Emailed the moment a vendor applies, so you aren&rsquo;t refreshing the requests page. Blank uses your org contact address.</p>
                <input className={inputCls} type="email" value={vf.notifyEmail} placeholder="you@yourorg.com"
                  onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, notifyEmail: e.target.value } }))} />

                <label className={labelCls}>Approval notice</label>
                <p className="text-xs text-slate-500 -mt-1 mb-1">Shown at the top of the form, so nobody assumes submitting reserves a spot.</p>
                <MarkdownField value={vf.approvalNotice} onChange={val => setF(v => ({ ...v, vendor: { ...v.vendor, approvalNotice: val } }))} minHeight={80} />

                <label className={labelCls}>Approved-vendor instructions</label>
                <p className="text-xs text-slate-500 -mt-1 mb-2">What an approved vendor is told. Anything left blank is simply left out — fill these in as each event firms up.</p>
                <div className="space-y-2 mb-4">
                  {([
                    ['where', 'Where to set up', 'Venue, which field, booth size, what you provide'],
                    ['eventTimes', 'Event times', 'Gates, first game, last game \u2014 and when booths should be staffed'],
                    ['loadIn', 'Load-in', 'Day, window, which gate, vehicle and tent-weight rules'],
                    ['loadOut', 'Load-out', 'When it starts, and that breaking down early is not OK'],
                    ['bring', 'What to bring', 'Tent, tables, weights, insurance certificate, trash bags'],
                    ['contact', 'Who to contact', 'Vendor coordinator name and event-day phone'],
                  ] as [keyof VendorInstructions, string, string][]).map(([k, label, ph]) => (
                    <div key={k}>
                      <div className="text-xs font-semibold text-slate-600 mb-1">{label}</div>
                      <textarea className={`${inputCls} min-h-[64px]`} value={vf.instructions[k]} placeholder={ph}
                        onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, instructions: { ...v.vendor.instructions, [k]: e.target.value } } }))} />
                    </div>
                  ))}
                </div>

                {/* The web-sponsorship add-on: a checkbox on the booth form rather than
                    a fifth booth type, so it composes with all of them and lands at the
                    moment someone has already decided to spend the booth fee. */}
                <label className="flex items-start gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={vf.webAddOn.enabled}
                    onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, webAddOn: { ...v.vendor.webAddOn, enabled: e.target.checked } } }))} />
                  <span className="text-sm font-semibold text-slate-700">Offer web sponsorship as a booth add-on</span>
                </label>
                {vf.webAddOn.enabled && (
                  <div className="pl-6 mb-4 space-y-2">
                    <div className="flex gap-2">
                      <input className={`${inputCls} flex-1`} value={vf.webAddOn.name} placeholder="Add featured web sponsor"
                        onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, webAddOn: { ...v.vendor.webAddOn, name: e.target.value } } }))} />
                      <input className={`${inputCls} w-24 tabular-nums`} type="number" min={0} step={25} value={vf.webAddOn.price} title="Add-on price"
                        onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, webAddOn: { ...v.vendor.webAddOn, price: Math.max(0, Number(e.target.value) || 0) } } }))} />
                      <input className={`${inputCls} w-24 tabular-nums`} type="number" min={0} step={25} value={vf.webAddOn.compareAt} title="What it costs on its own — shown struck through"
                        onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, webAddOn: { ...v.vendor.webAddOn, compareAt: Math.max(0, Number(e.target.value) || 0) } } }))} />
                    </div>
                    <textarea className={`${inputCls} min-h-[64px]`} value={vf.webAddOn.note}
                      onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, webAddOn: { ...v.vendor.webAddOn, note: e.target.value } } }))} />
                    <p className="text-xs text-slate-400">Price, then what it costs bought on its own (shown struck through so the saving is visible). Charged per event, like the booth.</p>
                  </div>
                )}

                <label className="flex items-start gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-teal-500" checked={vf.sponsorShow} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorShow: e.target.checked } }))} />
                  <span className="text-sm font-semibold text-slate-700">Show the sponsorship section</span>
                </label>
                {vf.sponsorShow && (
                  <div className="pl-6 mb-4 space-y-2">
                    <textarea className={`${inputCls} min-h-[70px]`} value={vf.sponsorBlurb} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorBlurb: e.target.value } }))} />
                    {vf.sponsorTiers.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <input className={`${inputCls} flex-1`} value={t.name} placeholder="Presenting sponsor"
                          onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorTiers: v.vendor.sponsorTiers.map((x, j) => j === i ? { ...x, name: e.target.value } : x) } }))} />
                        <input className={`${inputCls} w-28 tabular-nums`} type="number" min={0} step={50} value={t.price}
                          onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorTiers: v.vendor.sponsorTiers.map((x, j) => j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x) } }))} />
                        <button type="button" className="w-9 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorTiers: v.vendor.sponsorTiers.filter((_, j) => j !== i) } }))}><X size={15} className="mx-auto" /></button>
                      </div>
                    ))}
                    <button type="button" className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                      onClick={() => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorTiers: [...v.vendor.sponsorTiers, { name: '', price: 0 }] } }))}>+ Add a sponsorship level</button>
                    <input className={inputCls} value={vf.sponsorEmail} placeholder="Where deck requests go (defaults to your org contact email)"
                      onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, sponsorEmail: e.target.value } }))} />
                  </div>
                )}

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
                <div>
                  <div className={labelCls}>Booth types</div>
                  <div className="space-y-1">
                    {vf.types.map((t, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-3 text-sm border-b border-slate-50 py-1.5 last:border-0">
                        <span className={t.closed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}>{t.name || 'Untitled'}</span>
                        <span className="tabular-nums font-semibold text-slate-600 shrink-0">
                          {t.closed ? <span className="text-xs font-normal text-slate-400 no-underline">closed</span> : (priceLabel(t.price) || <span className="text-xs font-normal text-slate-400">on approval</span>)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div><div className={labelCls}>Approval notice</div><div className="text-sm text-slate-600">{vf.approvalNotice || <span className="text-slate-400">None</span>}</div></div>
                <div>
                  <div className={labelCls}>Approved-vendor instructions</div>
                  {(Object.keys(vf.instructions) as (keyof VendorInstructions)[]).filter(k => String(vf.instructions[k]).trim()).length === 0
                    ? <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Nothing filled in yet — approved vendors won&rsquo;t get setup details.</div>
                    : <div className="flex flex-wrap gap-1.5">{(Object.keys(vf.instructions) as (keyof VendorInstructions)[]).filter(k => String(vf.instructions[k]).trim()).map(k => <span key={k} className="text-xs bg-teal-50 text-teal-700 rounded-full px-2.5 py-1">{k}</span>)}</div>}
                </div>
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
