'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, FileText, Save, ClipboardList, ExternalLink, Link2, Inbox } from 'lucide-react'

const DEFAULT_WAIVER = `## 1. Acknowledgment of Risk
I understand that lacrosse is a high-intensity sport involving aggressive play and physical contact. I acknowledge that participation carries inherent risks, including but not limited to:
- Serious physical injury, permanent disability, or death.
- Head and neck injuries, including concussions, even when proper protective headgear is worn.
- Exposure to communicable diseases or illnesses.
I voluntarily and freely choose to incur these risks and assume full responsibility for my/my child's participation.

## 2. Medical Authorization & Responsibility
In the event of an injury or medical emergency, I hereby grant permission to the tournament organizers and their contracted athletic trainers or staff to facilitate medical treatment. I authorize transport to the nearest medical facility and treatment by hospital staff. I understand and agree that I am solely responsible for all costs associated with such medical treatment, including ambulance transport.

## 3. Release of Liability & Hold Harmless
I, for myself, my heirs, and my personal representatives, hereby release, waive, discharge, and hold harmless the tournament organizers, their owners, employees, coaches, volunteers, and the city and facility in which the event takes place from any and all liability, claims, or causes of action arising out of participation in this event. This includes, but is not limited to, claims arising from the ordinary negligence of the parties released above.

## 4. Media Release
I grant the tournament organizers the right to use photographs or video footage of me/my child taken during activities for promotional, social media, or marketing purposes without further compensation.

## 5. Electronic Signature & Verification
By submitting this form, I verify that I have read and understood this waiver in its entirety, that I am at least 18 years of age, that I am the participant or the legal parent/guardian of the minor participant registered, and that my typed name constitutes my legal electronic signature.`

type PlayerForm = {
  waiverTitle: string
  waiverText: string
  fields: { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean }
  confirmationTitle: string
  confirmationMessage: string
  emailConfirmation: boolean
}
type VendorForm = {
  disclaimer: string
  levels: string[]
  paymentOptions: string[]
  confirmationTitle: string
  confirmationMessage: string
  emailConfirmation: boolean
}
type Forms = { player: PlayerForm; vendor: VendorForm }
const EMPTY: Forms = {
  player: {
    waiverTitle: 'Player Participation Waiver & Release of Liability',
    waiverText: DEFAULT_WAIVER,
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
}

const FIELD_LABELS: { key: keyof PlayerForm['fields']; label: string; hint: string }[] = [
  { key: 'gender', label: 'Gender', hint: 'Female / Male select' },
  { key: 'grade', label: 'Player grade', hint: 'K–12 select' },
  { key: 'teamName', label: 'Team or club name', hint: 'Text field' },
  { key: 'parent2', label: 'Second parent', hint: 'Name, email, phone' },
  { key: 'hotelQuestion', label: 'Hotel / rental question', hint: 'Are you staying at a hotel?' },
  { key: 'newsletter', label: 'Newsletter opt-in', hint: 'Subscribe to updates' },
]

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
  const [subs, setSubs] = useState<any[]>([])
  const [showSubs, setShowSubs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    ;(async () => {
      try {
        if (!qOrg) { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) { setOrgName(o.name); setSlug(o.slug) } }
        const d = await fetch(`/api/org-forms${apiQ}`).then(r => r.ok ? r.json() : {})
        const p = d.player || {}
        const vv = d.vendor || {}
        setF({
          player: { ...EMPTY.player, ...p, fields: { ...EMPTY.player.fields, ...(p.fields || {}) } },
          vendor: { ...EMPTY.vendor, ...vv, levels: Array.isArray(vv.levels) ? vv.levels : EMPTY.vendor.levels, paymentOptions: Array.isArray(vv.paymentOptions) ? vv.paymentOptions : EMPTY.vendor.paymentOptions },
        })
        const sj = await fetch(`/api/org-forms/submit${apiQ}`).then(r => r.ok ? r.json() : { submissions: [] })
        setSubs(Array.isArray(sj.submissions) ? sj.submissions : [])
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/org-forms${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
      if (res.ok) toast.success('Forms saved')
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  const formPath = slug ? `/o/${slug}/register/player` : ''
  const copyLink = () => {
    if (!formPath) { toast.error('No link yet'); return }
    const url = `${window.location.origin}${formPath}`
    navigator.clipboard?.writeText(url).then(() => toast.success('Link copied')).catch(() => toast.error('Copy failed'))
  }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>
  const pf = f.player
  const vf = f.vendor
  const playerSubs = subs.filter(s => s.formType !== 'vendor')
  const vendorSubs = subs.filter(s => s.formType === 'vendor')
  const vendorPath = slug ? `/o/${slug}/register/vendor` : ''
  const copyVendorLink = () => { if (!vendorPath) return; navigator.clipboard?.writeText(`${window.location.origin}${vendorPath}`).then(() => toast.success('Link copied')).catch(() => toast.error('Copy failed')) }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/dashboard/org" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ChevronLeft size={14} /> Your team</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Forms</h1>
          <p className="text-sm text-slate-500">Reusable forms for {orgName || 'your organization'}. New tournaments copy these as their starting point.</p>
        </div>
        <button onClick={save} disabled={saving} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
      </div>

      {/* Player Registration & Waiver */}
      <section className="card p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><FileText size={16} /></span>
          <h2 className="font-semibold text-slate-800">Player Waiver</h2>
          {formPath && <a href={formPath} target="_blank" rel="noreferrer" className="ml-auto text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> View form</a>}
        </div>
        <p className="text-xs text-slate-400 mb-4">The waiver and optional fields players complete to compete.</p>

        {/* Public link */}
        {formPath && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
            <Link2 size={14} className="text-slate-400 flex-shrink-0" />
            <code className="text-xs text-slate-600 truncate flex-1">{formPath}</code>
            <button onClick={copyLink} className="text-xs font-medium text-teal-700 hover:text-teal-900 flex-shrink-0">Copy link</button>
          </div>
        )}

        <label className="label">Waiver title</label>
        <input className="input" value={pf.waiverTitle} onChange={e => setF(v => ({ ...v, player: { ...v.player, waiverTitle: e.target.value } }))} />

        <label className="label mt-3">Waiver text</label>
        <textarea className="input min-h-[260px] font-mono text-xs leading-relaxed" value={pf.waiverText} onChange={e => setF(v => ({ ...v, player: { ...v.player, waiverText: e.target.value } }))} />
        <p className="text-xs text-slate-400 mt-1">Supports Markdown (## headings, **bold**, - bullets).</p>

        <h3 className="text-sm font-semibold text-slate-700 mt-5 mb-2">Optional fields</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {FIELD_LABELS.map(fl => (
            <label key={fl.key} className="flex items-start gap-2 border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 accent-teal-500" checked={pf.fields[fl.key]} onChange={e => setF(v => ({ ...v, player: { ...v.player, fields: { ...v.player.fields, [fl.key]: e.target.checked } } }))} />
              <span><span className="text-sm text-slate-700 font-medium">{fl.label}</span><br /><span className="text-xs text-slate-400">{fl.hint}</span></span>
            </label>
          ))}
        </div>

        {/* Confirmation & email */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">After submitting</h3>
          <label className="label">Confirmation title</label>
          <input className="input" value={pf.confirmationTitle} onChange={e => setF(v => ({ ...v, player: { ...v.player, confirmationTitle: e.target.value } }))} placeholder="You're registered!" />
          <label className="label mt-3">Confirmation message</label>
          <textarea className="input min-h-[90px]" value={pf.confirmationMessage} onChange={e => setF(v => ({ ...v, player: { ...v.player, confirmationMessage: e.target.value } }))} placeholder="Shown on the thank-you screen and in the confirmation email." />
          <p className="text-xs text-slate-400 mt-1">Supports Markdown. Shown on the success screen and emailed to the registrant.</p>
          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-teal-500" checked={pf.emailConfirmation} onChange={e => setF(v => ({ ...v, player: { ...v.player, emailConfirmation: e.target.checked } }))} />
            <span className="text-sm text-slate-700">Email a confirmation to the registrant <span className="text-xs text-slate-400">(sent to the player or parent email)</span></span>
          </label>
        </div>

        {/* Submissions */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button onClick={() => setShowSubs(s => !s)} className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5">
            <Inbox size={15} className="text-slate-400" /> {playerSubs.length} submission{playerSubs.length === 1 ? '' : 's'} {playerSubs.length > 0 && <span className="text-teal-700">· {showSubs ? 'hide' : 'view'}</span>}
          </button>
          {showSubs && playerSubs.length > 0 && (
            <div className="mt-3 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {playerSubs.slice().reverse().map((s, i) => (
                <div key={s.id || i} className="px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">{s.data?.playerName || 'Player'}</span>
                    <span className="text-xs text-slate-400">{new Date(s.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-slate-500">{[s.data?.teamName, s.data?.grade && `Grade ${s.data.grade}`, s.data?.parentEmail].filter(Boolean).join(' · ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Vendor request */}
      <section className="card p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><ClipboardList size={16} /></span>
          <h2 className="font-semibold text-slate-800">Vendor request</h2>
          {vendorPath && <a href={vendorPath} target="_blank" rel="noreferrer" className="ml-auto text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><ExternalLink size={14} /> View form</a>}
        </div>
        <p className="text-xs text-slate-400 mb-4">Vendors &amp; sponsors apply to sell or sponsor at your events.</p>

        {vendorPath && (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
            <Link2 size={14} className="text-slate-400 flex-shrink-0" />
            <code className="text-xs text-slate-600 truncate flex-1">{vendorPath}</code>
            <button onClick={copyVendorLink} className="text-xs font-medium text-teal-700 hover:text-teal-900 flex-shrink-0">Copy link</button>
          </div>
        )}

        <label className="label">Vendor / sponsor levels <span className="text-slate-400 font-normal">(comma separated)</span></label>
        <input className="input" value={vf.levels.join(', ')} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, levels: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} placeholder="Food Vendor, Bronze Sponsor, Gold Sponsor" />

        <label className="label mt-3">Payment options <span className="text-slate-400 font-normal">(comma separated)</span></label>
        <input className="input" value={vf.paymentOptions.join(', ')} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, paymentOptions: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } }))} placeholder="Check, Venmo, Zelle, Invoice me" />

        <label className="label mt-3">Vendor disclaimer</label>
        <textarea className="input min-h-[120px]" value={vf.disclaimer} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, disclaimer: e.target.value } }))} />
        <p className="text-xs text-slate-400 mt-1">Supports Markdown. Vendors must agree to this before submitting.</p>

        <div className="mt-5 pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">After submitting</h3>
          <label className="label">Confirmation title</label>
          <input className="input" value={vf.confirmationTitle} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, confirmationTitle: e.target.value } }))} />
          <label className="label mt-3">Confirmation message</label>
          <textarea className="input min-h-[80px]" value={vf.confirmationMessage} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, confirmationMessage: e.target.value } }))} />
          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-teal-500" checked={vf.emailConfirmation} onChange={e => setF(v => ({ ...v, vendor: { ...v.vendor, emailConfirmation: e.target.checked } }))} />
            <span className="text-sm text-slate-700">Email a confirmation to the vendor <span className="text-xs text-slate-400">(sent to the contact email)</span></span>
          </label>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100">
          <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5"><Inbox size={15} className="text-slate-400" /> {vendorSubs.length} vendor request{vendorSubs.length === 1 ? '' : 's'}</span>
        </div>
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
