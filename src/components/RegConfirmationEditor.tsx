'use client'
import MarkdownField from '@/components/MarkdownField'
import AiGenerateButton from '@/components/AiGenerateButton'
import type { RegConfirmation } from '@/lib/regConfirmation'

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

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

  return (
    <div className="space-y-1">
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
    </div>
  )
}
