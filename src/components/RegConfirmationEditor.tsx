'use client'
import { useState } from 'react'
import { Eye, Pencil } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import AiGenerateButton from '@/components/AiGenerateButton'
import { resolveRegConfirmation, buildRegLetter, letterToEmailHtml, type RegConfirmation, type RegLetterData } from '@/lib/regConfirmation'

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

// Sample registration used by the live preview, so the email renders with real-
// looking teams, fees and buttons while the letter itself is being edited.
const SAMPLE: RegLetterData = {
  tournamentName: 'Sunshine Fall Classic 2026',
  orgName: 'Sunshine Events Group',
  dates: 'Nov 7–8, 2026',
  location: 'Stuart, FL',
  clubName: 'Example Lacrosse Club',
  contactName: 'Jordan Smith',
  teams: [
    { team: 'Example 2031 Blue', division: 'Boys 2031' },
    { team: 'Example 2029 White', division: 'Boys 2029' },
  ],
  amount: 2890,
  paymentMethod: 'card',
  paid: false,
  eventUrl: '#', gameDayUrl: '#', waiverUrl: '#', claimUrl: '#',
}

// Shared editor for the registration confirmation "response letter".
//  mode="org"        → the org-wide default (Forms library): includes the email
//                       on/off toggle; all fields edited directly.
//  mode="tournament" → a per-tournament override (Setup wizard): each field is
//                       optional; leaving it blank inherits the org default
//                       (shown as the placeholder). No email toggle (org-level).
export default function RegConfirmationEditor({
  value, onChange, mode = 'org', inherit,
}: {
  value: Partial<RegConfirmation>
  onChange: (patch: Partial<RegConfirmation>) => void
  mode?: 'org' | 'tournament'
  inherit?: RegConfirmation // org default, used as placeholders in tournament mode
}) {
  const v = value || {}
  const ph = (k: keyof RegConfirmation) => mode === 'tournament' ? String((inherit as any)?.[k] ?? '') : ''
  const tip = mode === 'tournament'

  // Live preview of the REAL email (same renderer production uses), fed with a
  // sample registration. Blank fields resolve exactly like they will at send
  // time: tournament overrides fall back to the org default, then to built-ins.
  const [showPreview, setShowPreview] = useState(false)
  const [samplePaid, setSamplePaid] = useState(false)
  const [sampleReturning, setSampleReturning] = useState(false)
  let previewHtml = ''
  if (showPreview) {
    try {
      const cfg = mode === 'tournament' ? resolveRegConfirmation(inherit, v) : resolveRegConfirmation(v, null)
      const data = { ...SAMPLE, paid: samplePaid, hasAccount: sampleReturning, loginUrl: '#' }
      previewHtml = letterToEmailHtml(buildRegLetter(cfg, data), data)
    } catch { previewHtml = '<p style="font-family:sans-serif;color:#b91c1c;padding:16px">Preview failed to render.</p>' }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={() => setShowPreview(p => !p)}
          className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          {showPreview ? <Pencil size={14} /> : <Eye size={14} />}
          {showPreview ? 'Hide preview' : 'Preview email'}
        </button>
        {showPreview && (
          <span className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input type="checkbox" className="accent-teal-500" checked={samplePaid} onChange={e => setSamplePaid(e.target.checked)} />
              Show as paid online
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <input type="checkbox" className="accent-teal-500" checked={sampleReturning} onChange={e => setSampleReturning(e.target.checked)} />
              Show as returning club
            </label>
          </span>
        )}
      </div>
      {showPreview && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100 p-2 sm:p-4 mb-2">
          <div className="text-[11px] text-slate-400 mb-2 text-center">Exactly what the club contact receives — sample club, two teams. Buttons are disabled in preview.</div>
          <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="w-full bg-white rounded-lg border border-slate-200" style={{ height: 820 }} />
        </div>
      )}
      {mode === 'org' && (
        <label className="inline-flex items-start gap-2 text-sm text-slate-600 mb-1">
          <input type="checkbox" className="mt-0.5 accent-teal-500" checked={v.enabled !== false} onChange={e => onChange({ enabled: e.target.checked })} />
          <span>Email a copy to the club contact</span>
        </label>
      )}
      <p className="text-xs text-slate-500 mb-1">Use <code className="bg-slate-100 px-1 rounded">{'{club}'}</code> <code className="bg-slate-100 px-1 rounded">{'{tournament}'}</code> <code className="bg-slate-100 px-1 rounded">{'{dates}'}</code> <code className="bg-slate-100 px-1 rounded">{'{location}'}</code> <code className="bg-slate-100 px-1 rounded">{'{org}'}</code> — they fill in automatically. Teams, fees and links are added for you.{tip ? ' Leave a field blank to use your org default.' : ''}</p>

      <div className={labelCls}>Email subject</div>
      <input className={inputCls} value={v.subject ?? ''} placeholder={ph('subject')} onChange={e => onChange({ subject: e.target.value })} />

      <div className={labelCls}>Welcome message</div>
      <MarkdownField value={v.welcome ?? ''} onChange={val => onChange({ welcome: val })} minHeight={90} placeholder={ph('welcome')} />
      <AiGenerateButton kind="reg-welcome" current={v.welcome ?? ''} onResult={t => onChange({ welcome: t })} />

      <div className={labelCls}>What&apos;s next</div>
      <MarkdownField value={v.nextSteps ?? ''} onChange={val => onChange({ nextSteps: val })} minHeight={90} placeholder={ph('nextSteps')} />
      <AiGenerateButton kind="reg-next" current={v.nextSteps ?? ''} onResult={t => onChange({ nextSteps: t })} />

      <div className={labelCls}>Sign-off</div>
      <MarkdownField value={v.signoff ?? ''} onChange={val => onChange({ signoff: val })} minHeight={60} placeholder={ph('signoff')} />

      <div className={labelCls}>Notify your team</div>
      <input className={inputCls} value={v.notifyEmails ?? ''} placeholder={ph('notifyEmails') || 'organizer@example.com, office@example.com'} onChange={e => onChange({ notifyEmails: e.target.value })} />
      <p className="text-xs text-slate-400 mt-1">Each new registration also sends an internal heads-up (contact info, teams, payment status) to these addresses — comma-separated — so someone can call the club director. Blank = your org contact email.</p>
    </div>
  )
}
