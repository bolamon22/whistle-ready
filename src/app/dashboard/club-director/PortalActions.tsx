'use client'

// WHAT A CLUB DIRECTOR CAN DO ABOUT THEIR OWN REGISTRATION, from the portal.
//
// Bo, Oct 3 2026: clubs ask the office to move or remove a team (a request,
// never a delete), add a team themselves until the schedule is posted, and
// bring their teams to the organizer's next event without retyping them. Plus a
// "What's left" list so a director can see at a glance what the event still
// needs from them, starting with a box to tick once their team list is right
// (Oct 4).
//
// Client only. Nothing here may import a file that imports @/lib/db -- Prisma in
// a client graph took every photographer page down on Oct 3 2026. The pricing,
// status and name helpers used here have no imports of their own.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, CalendarDays, CalendarPlus, CheckCircle2, Circle, Clock, Plus, Square, X } from 'lucide-react'
import { calcFee, type RegPricing } from '@/lib/regPricing'
import { nameKey } from '@/lib/names'

export type PortalDivision = { name: string; full: boolean; label: string; directAdd: boolean }
export type PortalEvent = { name: string; ended: boolean; posted: boolean; pricing: RegPricing; divisions: PortalDivision[] }
export type PortalTeam = {
  id: string; teamName: string; division: string
  coachName: string; coachEmail: string; coachPhone: string; waitlisted?: boolean
}
export type PortalReg = {
  id: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  invoiceAmount: number; discountAmount: number; createdAt: string
  teams: PortalTeam[]; payments: { amount: number }[]
}
export type ConfirmState = { status: string; note: string; at: string }
/** What "register again" starts from: one registration and its teams. */
export type AgainSource = {
  id: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  teams: { id: string; teamName: string; division: string; coachName: string; coachEmail?: string }[]
}
export type OtherEvent = {
  id: string; name: string; startDate: string; endDate: string; location: string
  divisions: { name: string; full: boolean; label: string }[]; pricing: RegPricing
}

const money = (n: number) => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** "Oct 24" from a bare YYYY-MM-DD, without the UTC-midnight day slip. */
export function dayLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''))
  if (!m) return ''
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
/** "Oct 24–25, 2026" for an event's dates. */
export function eventDates(start: string, end?: string): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(start || ''))
  if (!a) return ''
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(end || ''))
  const first = dayLabel(start)
  if (!b || end === start) return `${first}, ${a[1]}`
  if (a[2] === b[2] && a[1] === b[1]) return `${first}–${+b[3]}, ${a[1]}`
  return `${first} – ${dayLabel(String(end))}, ${b[1]}`
}
const stamp = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const divisionHint = (d: { full: boolean; label: string }) => d.full ? 'full, waiting list' : d.label ? d.label.toLowerCase() : ''
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } }
  }
}

// ---------------------------------------------------------------------------
// Shell shared by the three dialogs
// ---------------------------------------------------------------------------

function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`relative w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-xl'} max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-7`}>
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{children}</p>
)
const fieldClass = 'w-full min-h-[44px] border border-slate-300 rounded-lg px-3 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400'
const areaClass = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y'
const primaryBtn = 'flex-1 min-h-[48px] rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white text-base font-bold transition-colors'
const quietBtn = 'inline-flex items-center min-h-[48px] px-4 text-sm font-semibold text-slate-600 hover:text-slate-900'

function Done({ title, body, onClose, tone = 'teal' }: { title: string; body: React.ReactNode; onClose: () => void; tone?: 'teal' | 'amber' }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-6 px-2">
      {tone === 'teal'
        ? <CheckCircle2 size={44} className="text-teal-600" />
        : <Clock size={44} className="text-amber-600" />}
      <h2 className="text-2xl font-extrabold text-slate-900">{title}</h2>
      <div className="max-w-md text-[15px] leading-relaxed text-slate-600">{body}</div>
      <button type="button" onClick={onClose}
        className="mt-1 inline-flex items-center min-h-[44px] px-5 rounded-full border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Back to your teams
      </button>
    </div>
  )
}

/** In staff view every form opens, so staff see exactly what the club sees, but
 *  the last step is the club's own (Bo, Oct 4 2026: "why can't they click
 *  register teams here?"). The routes refuse staff view as well. */
function StaffNote() {
  return (
    <p className="text-[13px] leading-snug text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
      <strong className="font-semibold">Staff view.</strong> You can fill this in to see how it works, but only the club can send it, from its own login. Nothing here is saved.
    </p>
  )
}

function NextSteps({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3.5">
      <Eyebrow>What happens next</Eyebrow>
      <ol className="mt-1.5 list-decimal pl-5 text-[13px] leading-relaxed text-slate-700 space-y-0.5">
        {steps.map(s => <li key={s}>{s}</li>)}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Request a change for a team (move, remove, anything else)
// ---------------------------------------------------------------------------

export type RequestKind = 'move' | 'remove' | 'other'

export function RequestChangeDialog({ tournamentId, eventName, reg, team, event, initialKind = 'move', staffView = false, onClose, onDone }: {
  tournamentId: string; eventName: string; reg: PortalReg; team: PortalTeam | null; event: PortalEvent | null
  initialKind?: RequestKind; staffView?: boolean; onClose: () => void; onDone: () => void
}) {
  const moveTargets = (event?.divisions ?? []).filter(d => team && nameKey(d.name) !== nameKey(team.division))
  const [kind, setKind] = useState<RequestKind>(team ? (initialKind === 'move' && !moveTargets.length ? 'other' : initialKind) : 'other')
  const [toDivision, setToDivision] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const target = moveTargets.find(d => d.name === toDivision)

  const options: { id: RequestKind; title: string; sub: string }[] = team ? [
    ...(moveTargets.length ? [{ id: 'move' as const, title: 'Move to a different division', sub: 'The office checks space in the new division and moves the team.' }] : []),
    { id: 'remove', title: 'Remove this team', sub: 'Teams are only taken off by the office, so nothing disappears by accident.' },
    { id: 'other', title: 'Something else', sub: 'A name change, a coach change, anything we should fix.' },
  ] : []

  const blocked = busy || staffView || (kind === 'move' && !toDivision) || (kind === 'other' && !note.trim())
  async function send() {
    if (blocked) return
    setBusy(true); setError('')
    const r = await postJson('/api/club-director/request', {
      tournamentId, registrationId: reg.id, kind, teamId: team?.id || '', toDivision, note,
    })
    setBusy(false)
    if (!r.ok) { setError(r.data?.error || 'Could not send that request'); return }
    setSent(true)
    onDone()
  }

  return (
    <Dialog title={team ? `Request a change for ${team.teamName}` : 'Ask the office for a change'} onClose={onClose}>
      {sent ? (
        <Done title="Request sent" onClose={onClose} body={
          <>It&rsquo;s on your registration as &ldquo;Change requested,&rdquo; and the tournament office has it by email. They&rsquo;ll make the change and update your invoice if it changes.</>
        } />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="pr-8">
            <Eyebrow>{eventName}</Eyebrow>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{team ? `Request a change for ${team.teamName}` : 'Ask the office for a change'}</h2>
            {team && <p className="mt-0.5 text-sm text-slate-500">{team.division || 'No division'}{team.coachName ? ` · Coach ${team.coachName}` : ''}</p>}
          </div>

          {options.length > 0 && (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2 text-sm font-medium text-slate-700">What does your club need?</legend>
              {options.map(o => (
                <label key={o.id} className={`flex gap-3 items-start min-h-[44px] px-3.5 py-3 rounded-2xl cursor-pointer border ${kind === o.id ? 'border-2 border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="radio" name="kind" checked={kind === o.id} onChange={() => { setKind(o.id); setError('') }} className="mt-0.5 h-[18px] w-[18px] accent-teal-500" />
                  <span>
                    <span className="block text-[15px] font-semibold text-slate-900">{o.title}</span>
                    <span className="block text-[13px] leading-snug text-slate-500">{o.sub}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {kind === 'move' && team && (
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Move to
                <select value={toDivision} onChange={e => setToDivision(e.target.value)} className={fieldClass}>
                  <option value="">Pick a division</option>
                  {moveTargets.map(d => <option key={d.name} value={d.name}>{d.name}{divisionHint(d) ? ` · ${divisionHint(d)}` : ''}</option>)}
                </select>
              </label>
              {target && (
                <p className="text-[13px] leading-relaxed text-slate-500">
                  {target.full
                    ? `${target.name} is full right now, so this move would put ${team.teamName} on its waiting list. The office will check with you before moving anything.`
                    : `${target.name} has room. The office will make the move and update your invoice if the price changes.`}
                </p>
              )}
            </div>
          )}

          {kind === 'remove' && (
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Why is this team coming out?
                <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={600}
                  placeholder="For example: not enough players for a second team" className={areaClass} />
              </label>
              <p className="text-[13px] leading-relaxed text-slate-500">Your team stays on the registration until the office removes it. If you&rsquo;ve already paid for it, the office will follow up about your balance.</p>
            </div>
          )}

          {kind === 'move' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Anything else we should know?
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={600} placeholder="Optional" className={areaClass} />
            </label>
          )}

          {kind === 'other' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">What do you need?
              <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} maxLength={600}
                placeholder={team ? `For example: rename ${team.teamName}, or a new coach` : 'Tell the office what to change'} className={areaClass} />
            </label>
          )}

          <NextSteps steps={[
            'Your request shows on your registration, and the tournament office gets an email.',
            'The office makes the change and updates your invoice.',
            'You check the updated list and confirm it.',
          ]} />

          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          {staffView && <StaffNote />}
          <div className="flex items-center gap-3">
            <button type="button" onClick={send} disabled={blocked} className={primaryBtn}>{busy ? 'Sending…' : 'Send request'}</button>
            <button type="button" onClick={onClose} className={quietBtn}>Cancel</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Add a team
// ---------------------------------------------------------------------------

export function AddTeamDialog({ tournamentId, eventName, reg, event, showMoney, staffView = false, onClose, onDone }: {
  tournamentId: string; eventName: string; reg: PortalReg; event: PortalEvent
  showMoney: boolean; staffView?: boolean; onClose: () => void; onDone: () => void
}) {
  const [teamName, setTeamName] = useState('')
  const [division, setDivision] = useState('')
  const [coachName, setCoachName] = useState('')
  const [coachEmail, setCoachEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Becomes true when the server says the schedule is posted, even if the data
  // this dialog opened with said otherwise.
  const [forceRequest, setForceRequest] = useState(false)
  const [done, setDone] = useState<null | { kind: 'added' | 'waitlist' | 'request'; invoice?: { was: number; now: number; heldBack: boolean } }>(null)

  const div = event.divisions.find(d => d.name === division) || null
  const asRequest = forceRequest || event.posted || (!!div && !div.directAdd)
  const paid = reg.payments.reduce((s, p) => s + p.amount, 0)

  // The same arithmetic the server does (api/club-director/teams): priced as of
  // the date they registered, and only when the invoice still matches the list.
  const preview = useMemo(() => {
    if (!div || asRequest) return null
    const asOf = String(reg.createdAt || '').slice(0, 10) || undefined
    const before = calcFee(reg.teams.map(t => ({ division: t.division, waitlisted: !!t.waitlisted })), event.pricing, asOf)
    const after = calcFee([...reg.teams.map(t => ({ division: t.division, waitlisted: !!t.waitlisted })), { division: div.name, waitlisted: div.full }], event.pricing, asOf)
    const unedited = Math.round(reg.invoiceAmount * 100) === Math.round(before * 100)
    return { unedited, after, delta: after - reg.invoiceAmount }
  }, [div, asRequest, reg, event.pricing])

  const blocked = busy || staffView || !teamName.trim() || !division
  async function submit() {
    if (blocked) return
    setBusy(true); setError('')
    const body = { tournamentId, registrationId: reg.id, teamName, division, coachName, coachEmail }
    if (asRequest) {
      const r = await postJson('/api/club-director/request', { ...body, kind: 'add' })
      setBusy(false)
      if (!r.ok) { setError(r.data?.error || 'Could not send that request'); return }
      setDone({ kind: 'request' }); onDone(); return
    }
    const r = await postJson('/api/club-director/teams', body)
    setBusy(false)
    if (r.status === 409 && r.data?.code === 'schedule_posted') {
      setForceRequest(true)
      setError(r.data.error || 'The schedule is posted, so this goes to the office as a request.')
      return
    }
    if (!r.ok) { setError(r.data?.error || 'Could not add that team'); return }
    setDone({ kind: r.data?.team?.waitlisted ? 'waitlist' : 'added', invoice: r.data?.invoice })
    onDone()
  }

  if (done) {
    const name = teamName.trim()
    return (
      <Dialog title="Add a team" onClose={onClose}>
        {done.kind === 'request' ? (
          <Done title="Request sent" onClose={onClose} body={<>The tournament office has your request to add {name} to {division}. It&rsquo;s on your registration as &ldquo;Change requested,&rdquo; and they&rsquo;ll update your invoice when they add it.</>} />
        ) : done.kind === 'waitlist' ? (
          <Done title="On the waiting list" tone="amber" onClose={onClose} body={<>{name} is on the {division} waiting list. Nothing is billed unless a spot opens, and the office will contact you as soon as one does.</>} />
        ) : (
          <Done title="Team added" onClose={onClose} body={<>
            {name} is on your registration in {division}.
            {showMoney && done.invoice && (done.invoice.heldBack
              ? ' The tournament office will update your invoice.'
              : done.invoice.now !== done.invoice.was ? ` Your invoice is now ${money(done.invoice.now)}.` : '')}
            {' '}The tournament office can see the change on your account.
          </>} />
        )}
      </Dialog>
    )
  }

  return (
    <Dialog title="Add a team" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="pr-8">
          <Eyebrow>{eventName}</Eyebrow>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Add a team</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
            {asRequest
              ? 'The tournament office adds it for you and updates your invoice.'
              : 'It goes straight onto your registration, and the tournament office sees it on your account.'}
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Team name <span className="text-red-600">*</span></span>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={120} autoFocus
            placeholder={`For example: ${reg.clubName.split(' ')[0] || 'Club'} 2032`} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          <span>Division <span className="text-red-600">*</span></span>
          <select value={division} onChange={e => { setDivision(e.target.value); setError('') }} className={fieldClass}>
            <option value="">Pick a division</option>
            {event.divisions.map(d => (
              <option key={d.name} value={d.name}>
                {d.name}{d.full ? ' · full, waiting list' : d.label ? ` · ${d.label.toLowerCase()}` : ''}{!d.directAdd && !event.posted ? ' · by request' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Head coach
            <input value={coachName} onChange={e => setCoachName(e.target.value)} maxLength={120} placeholder="Full name" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">Coach email
            <input type="email" value={coachEmail} onChange={e => setCoachEmail(e.target.value)} maxLength={160} placeholder="coach@yourclub.com" className={fieldClass} />
          </label>
        </div>

        {div && asRequest && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5 text-amber-900">
            <strong className="block text-[15px]">This goes to the office as a request</strong>
            <span className="block text-sm leading-relaxed">
              {event.posted ? 'The schedule is posted' : `The ${div.name} schedule is already being built`}, so the office adds new teams{div.full ? ' (to the waiting list, since it is full)' : ''} and updates your invoice.
            </span>
          </div>
        )}
        {div && !asRequest && div.full && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3.5 text-amber-900">
            <strong className="block text-[15px]">{div.name} is full</strong>
            <span className="block text-sm leading-relaxed">Your team joins the waiting list and isn&rsquo;t billed unless a spot opens. The office will contact you if one does.</span>
          </div>
        )}
        {div && !asRequest && !div.full && showMoney && preview && (
          <div className="rounded-2xl bg-teal-50 border border-teal-100 px-4 py-3.5 text-teal-800">
            {preview.unedited ? (
              <>
                <strong className="block text-[15px]">
                  {preview.delta > 0 ? `Adds ${money(preview.delta)} to your invoice` : preview.delta < 0 ? `Lowers your invoice by ${money(-preview.delta)}` : 'No change to your invoice'}
                </strong>
                <span className="block text-sm">New invoice {money(preview.after)} · Paid {money(paid)} · Balance due {money(Math.max(0, preview.after - reg.discountAmount - paid))}</span>
              </>
            ) : (
              <strong className="block text-[15px]">The tournament office will update your invoice for the new team.</strong>
            )}
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-slate-500">You can add teams yourself until the schedule is posted. After that, adding a team becomes a request to the office.</p>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        {staffView && <StaffNote />}
        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={blocked} className={primaryBtn}>
            {busy ? 'Saving…' : asRequest ? 'Send request' : div?.full ? 'Join the waiting list'
              : showMoney && preview?.unedited && preview.delta > 0 ? `Add team · ${money(preview.delta)}` : 'Add team'}
          </button>
          <button type="button" onClick={onClose} className={quietBtn}>Cancel</button>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Register teams for another event
// ---------------------------------------------------------------------------

/** One team on the form. `teamId` is the team it started from ('' for a new one). */
type AgainRow = { key: string; teamId: string; on: boolean; teamName: string; division: string; coachName: string; coachEmail: string; editCoach: boolean }

export function RegisterAgainDialog({ tournamentId, eventName, reg, initialEventId, showMoney, staffView = false, onClose, onRegistered }: {
  tournamentId: string; eventName: string; reg: AgainSource; initialEventId?: string; showMoney: boolean; staffView?: boolean
  onClose: () => void; onRegistered: (newTournamentId: string) => void
}) {
  const [events, setEvents] = useState<OtherEvent[] | null>(null)
  const [targetId, setTargetId] = useState(initialEventId || '')
  // Their current teams to start, each one renamable, plus any they add. Bo, Oct 4
  // 2026: it doesn't have to be the same teams; it is registering, pre-filled.
  const [rows, setRows] = useState<AgainRow[]>(() => reg.teams.map(t => ({
    key: t.id, teamId: t.id, on: true, teamName: t.teamName, division: '',
    coachName: t.coachName || '', coachEmail: t.coachEmail || '', editCoach: false,
  })))
  const setRow = (key: string, patch: Partial<AgainRow>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, {
    key: `new-${Date.now()}-${rs.length}`, teamId: '', on: true, teamName: '', division: '', coachName: '', coachEmail: '', editCoach: true,
  }])
  const [editContact, setEditContact] = useState(false)
  const [contact, setContact] = useState({ clubContact: reg.clubContact || '', contactEmail: reg.contactEmail || '', contactPhone: reg.contactPhone || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { tournamentId: string; tournamentName: string; invoiceAmount: number; contactEmail: string; teams: { teamName: string; division: string; waitlisted: boolean }[] }>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/club-director/events?tournamentId=${encodeURIComponent(tournamentId)}`)
      .then(r => r.json()).then(d => { if (live) setEvents(Array.isArray(d?.events) ? d.events : []) })
      .catch(() => { if (live) setEvents([]) })
    return () => { live = false }
  }, [tournamentId])

  const target = events?.find(e => e.id === targetId) || null
  // A team's division carries over when the new event offers one by the same
  // name; a new team keeps the one picked for it if the event offers that too.
  useEffect(() => {
    if (!target) return
    setRows(rs => rs.map(r => {
      const was = r.teamId ? reg.teams.find(t => t.id === r.teamId)?.division : r.division
      const same = target.divisions.find(d => nameKey(d.name) === nameKey(was))
      return { ...r, division: same?.name || '' }
    }))
  }, [target, reg.teams])

  const picked = rows.filter(r => r.on)
  const unnamed = picked.some(r => !r.teamName.trim())
  const missing = picked.filter(r => r.teamName.trim() && !r.division)
  const dupe = picked.find((r, i) => picked.findIndex(x => nameKey(x.teamName) === nameKey(r.teamName)) !== i)
  const badEmail = picked.find(r => r.coachEmail.trim() && !EMAIL.test(r.coachEmail.trim()))
  const fullAt = (div: string) => !!target?.divisions.find(d => d.name === div)?.full
  const total = target ? calcFee(picked.map(r => ({ division: r.division, waitlisted: fullAt(r.division) })), target.pricing) : 0
  const contactOk = contact.clubContact.trim() && contact.contactPhone.trim() && EMAIL.test(contact.contactEmail.trim())
  const blockedWhy = !target ? 'Pick the event first.'
    : !picked.length ? 'Add at least one team.'
    : unnamed ? 'Give every team a name.'
    : missing.length ? `Pick a ${target.name} division for ${missing.map(r => r.teamName.trim()).join(' and ')} first.`
    : dupe ? `Two teams are named ${dupe.teamName.trim()}. Give each team its own name.`
    : badEmail ? `Check the coach email for ${badEmail.teamName.trim()}.`
    : !contactOk ? 'Add a contact name, email and phone.' : ''

  async function submit() {
    if (blockedWhy || busy || staffView || !target) return
    setBusy(true); setError('')
    const r = await postJson('/api/club-director/register-again', {
      tournamentId, registrationId: reg.id, targetId: target.id,
      teams: picked.map(r => ({
        ...(r.teamId ? { teamId: r.teamId } : {}),
        teamName: r.teamName, division: r.division, coachName: r.coachName, coachEmail: r.coachEmail,
      })),
      contact,
    })
    setBusy(false)
    if (!r.ok) { setError(r.data?.error || 'Registration failed. Please contact the tournament office.'); return }
    setDone(r.data)
  }

  if (done) {
    const waiting = done.teams.filter(t => t.waitlisted)
    return (
      <Dialog title="Registered" onClose={onClose}>
        <div className="flex flex-col items-center text-center gap-3 py-6 px-2">
          <CheckCircle2 size={44} className="text-teal-600" />
          <h2 className="text-2xl font-extrabold text-slate-900">Your club is registered for {done.tournamentName}</h2>
          <p className="max-w-md text-[15px] leading-relaxed text-slate-600">
            {plural(done.teams.length, 'team')}{showMoney ? ` · invoice ${money(done.invoiceAmount)}` : ''}.
            {waiting.length > 0 && ` ${waiting.map(t => t.teamName).join(' and ')} ${waiting.length === 1 ? 'is' : 'are'} on the waiting list and not billed unless a spot opens.`}
            {' '}Your confirmation and payment link are on the way to {done.contactEmail}, and {done.tournamentName} is now in your portal.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            <button type="button" onClick={() => onRegistered(done.tournamentId)}
              className="inline-flex items-center min-h-[44px] px-5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">
              Open {done.tournamentName}
            </button>
            <button type="button" onClick={onClose}
              className="inline-flex items-center min-h-[44px] px-5 rounded-full border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title="Register teams for another event" onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <div className="pr-8">
          <Eyebrow>Register teams</Eyebrow>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900">{target ? `Register for ${target.name}` : 'Register for another event'}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-slate-500">Your {eventName} teams are filled in to start. Keep them as they are, rename one, change a coach, leave one out or add a new team.</p>
        </div>

        {events === null ? (
          <p className="text-sm text-slate-400 py-6 text-center">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">There&rsquo;s no other event open for registration right now that your club isn&rsquo;t already in.</p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            <section className="w-full lg:flex-1 min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5">
              {!initialEventId && (
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 mb-3">Event
                  <select value={targetId} onChange={e => setTargetId(e.target.value)} className={fieldClass}>
                    <option value="">Pick an event</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}{ev.startDate ? ` · ${eventDates(ev.startDate, ev.endDate)}` : ''}</option>)}
                  </select>
                </label>
              )}
              <h3 className="text-base font-bold text-slate-900">Your teams</h3>
              <div className="mt-2 divide-y divide-slate-200 border-t border-slate-200">
                {rows.map(r => {
                  const src = r.teamId ? reg.teams.find(t => t.id === r.teamId) || null : null
                  const flag = !!target && r.on && !!r.teamName.trim() && !r.division
                  const offered = !!src && !!target?.divisions.some(d => nameKey(d.name) === nameKey(src.division))
                  const renamed = !!src && !!r.teamName.trim() && nameKey(r.teamName) !== nameKey(src.teamName)
                  return (
                    <div key={r.key} className="py-3 flex gap-3 items-start">
                      <div className={`w-5 shrink-0 ${r.on ? 'pt-[35px]' : 'pt-0.5'}`}>
                        {src && (
                          <input type="checkbox" checked={r.on} onChange={() => setRow(r.key, { on: !r.on })}
                            aria-label={`Bring ${src.teamName}`} className="h-5 w-5 accent-teal-500" />
                        )}
                      </div>
                      {!r.on ? (
                        <p className="flex-1 min-w-0 text-[15px] text-slate-400"><span className="font-semibold">{src?.teamName}</span> · not coming</p>
                      ) : (
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">Team name
                              <input value={r.teamName} onChange={e => setRow(r.key, { teamName: e.target.value })} maxLength={120} autoFocus={!src}
                                placeholder={`For example: ${reg.clubName.split(' ')[0] || 'Club'} 2032`} className={fieldClass} />
                            </label>
                            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">{target ? `${target.name} division` : 'Division'}
                              <select value={r.division} disabled={!target} onChange={e => setRow(r.key, { division: e.target.value })}
                                className={`${fieldClass} ${flag ? 'border-2 border-amber-500' : ''}`}>
                                <option value="">Pick a division</option>
                                {(target?.divisions ?? []).map(d => <option key={d.name} value={d.name}>{d.name}{divisionHint(d) ? ` · ${divisionHint(d)}` : ''}</option>)}
                              </select>
                            </label>
                          </div>
                          {renamed && src && <span className="text-[12px] text-slate-500">Was {src.teamName} at {eventName}</span>}
                          {r.editCoach ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">Head coach
                                <input value={r.coachName} onChange={e => setRow(r.key, { coachName: e.target.value })} maxLength={120} placeholder="Full name" className={fieldClass} />
                              </label>
                              <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">Coach email
                                <input type="email" value={r.coachEmail} onChange={e => setRow(r.key, { coachEmail: e.target.value })} maxLength={160} placeholder="coach@yourclub.com" className={fieldClass} />
                              </label>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-slate-500">
                              <span className="min-w-0 break-words">{r.coachName ? `Coach ${r.coachName}` : 'No coach listed'}{r.coachEmail ? ` · ${r.coachEmail}` : ''}</span>
                              <button type="button" onClick={() => setRow(r.key, { editCoach: true })} className="min-h-[36px] font-semibold text-teal-700 hover:text-teal-800">Change coach</button>
                            </div>
                          )}
                          {!src && (
                            <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                              className="self-start min-h-[36px] text-[13px] font-semibold text-slate-500 hover:text-red-700">Remove this team</button>
                          )}
                          {flag && (
                            <span className="self-start text-[13px] leading-snug px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                              {src?.division && !offered ? `${src.division} isn’t offered at ${target?.name}. ` : ''}Pick the division this team will play in.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={addRow}
                className="mt-1 inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold text-teal-700 hover:text-teal-800">
                <Plus size={16} className="shrink-0" /> Add a team
              </button>
            </section>

            <aside className="w-full lg:w-80 flex flex-col gap-4">
              {target && (
                <div className="rounded-2xl border border-slate-200 px-4 py-3.5">
                  <p className="font-bold text-slate-900">{target.name}</p>
                  <p className="text-sm text-slate-500">{eventDates(target.startDate, target.endDate)}{target.location ? ` · ${target.location}` : ''}</p>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3.5">
                <div className="flex flex-col gap-0.5">
                  <Eyebrow>Contact</Eyebrow>
                  {editContact ? (
                    <div className="mt-1 flex flex-col gap-2">
                      <input value={contact.clubContact} onChange={e => setContact(c => ({ ...c, clubContact: e.target.value }))} placeholder="Contact name" className={fieldClass} />
                      <input type="email" value={contact.contactEmail} onChange={e => setContact(c => ({ ...c, contactEmail: e.target.value }))} placeholder="Email" className={fieldClass} />
                      <input type="tel" value={contact.contactPhone} onChange={e => setContact(c => ({ ...c, contactPhone: e.target.value }))} placeholder="Phone" className={fieldClass} />
                    </div>
                  ) : (
                    <>
                      <span className="text-[15px] font-semibold text-slate-900">{contact.clubContact || 'No contact name'}</span>
                      <span className="text-sm text-slate-500 break-words">{contact.contactEmail || 'No email'}{contact.contactPhone ? ` · ${contact.contactPhone}` : ''}</span>
                      <button type="button" onClick={() => setEditContact(true)} className="self-start min-h-[44px] text-sm font-semibold text-teal-700 hover:text-teal-800">Change contact</button>
                    </>
                  )}
                </div>
                {showMoney && target && (
                  <div className="flex items-baseline justify-between gap-3 pt-3.5 border-t border-slate-200">
                    <span className="text-sm text-slate-600">{plural(picked.length, 'team')} at the standard rate</span>
                    <span className="text-2xl font-extrabold text-teal-700">{money(total)}</span>
                  </div>
                )}
                <span className="text-[13px] leading-relaxed text-slate-500">Your confirmation and payment link arrive by email.{target?.divisions.some(d => d.full) ? ' Teams in a full division go on its waiting list and aren’t billed unless a spot opens.' : ''}</span>
                {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
                {staffView && <StaffNote />}
                <button type="button" onClick={submit} disabled={!!blockedWhy || busy || staffView} className={primaryBtn}>
                  {busy ? 'Registering…' : picked.length ? `Register ${plural(picked.length, 'team')}${showMoney && target && !blockedWhy ? ` · ${money(total)}` : ''}` : 'Register'}
                </button>
                {blockedWhy && <span className="text-[13px] text-amber-800">{blockedWhy}</span>}
              </div>
            </aside>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// The note on a registration: a request the office has, or a list to confirm
// ---------------------------------------------------------------------------

export function AccountNote({ confirm, onConfirm }: {
  confirm: ConfirmState | undefined; onConfirm: () => void
}) {
  if (!confirm) return null
  if (confirm.status === 'change_requested') {
    return (
      <section aria-label="Note on your registration" className="mx-5 mb-4 flex gap-3 items-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <Clock size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <strong className="font-bold">Change requested{confirm.at ? ` · ${stamp(confirm.at)}` : ''}</strong>
          <p className="whitespace-pre-line break-words">{confirm.note}</p>
          <p className="mt-1 text-amber-800">The tournament office will update your registration. Then you check the new list and confirm it.</p>
        </div>
      </section>
    )
  }
  if (confirm.status === 'awaiting') {
    return (
      <section aria-label="Note on your registration" className="mx-5 mb-4 flex flex-wrap gap-3 items-center justify-between rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-900">
        <span className="flex gap-3 items-start min-w-0 flex-1 basis-72">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span><strong className="font-bold">The office updated your teams.</strong> Check the list below, then confirm it.</span>
        </span>
        {/* Opens the team check, in staff view too; only its last step is the club's. */}
        <button type="button" onClick={onConfirm}
          className="min-h-[44px] px-4 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
          Confirm teams
        </button>
      </section>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Confirm the team list
// ---------------------------------------------------------------------------

/** The club's sign-off that every team name and division is right. Bo, Oct 4
 *  2026: tick the box on the team list, check the teams, and that is the club's
 *  verification. The route notes who confirmed and the list they saw. */
export function ConfirmTeamsDialog({ tournamentId, eventName, reg, staffView = false, onClose, onDone, onRequestChange }: {
  tournamentId: string; eventName: string; reg: PortalReg; staffView?: boolean
  onClose: () => void; onDone: () => void; onRequestChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function confirm() {
    if (busy || staffView) return
    setBusy(true); setError('')
    const r = await postJson('/api/club-director/confirm', {
      tournamentId, registrationId: reg.id,
      seen: reg.teams.map(t => ({ id: t.id, teamName: t.teamName, division: t.division })),
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.data?.error || 'Could not confirm your teams')
      if (r.status === 409) onDone()   // the list changed under them: show the new one
      return
    }
    setDone(true)
    onDone()
  }

  return (
    <Dialog title="Confirm your team list" onClose={onClose}>
      {done ? (
        <Done title="Teams confirmed" onClose={onClose} body={
          <>Thank you. The tournament office can see {reg.clubName}&rsquo;s team list is right. If something changes, use <strong>Move</strong> or <strong>Remove</strong> on that team.</>
        } />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="pr-8">
            <Eyebrow>{eventName}</Eyebrow>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Are these your teams?</h2>
            <p className="mt-0.5 text-sm text-slate-500">Check each team&rsquo;s name and division. The office builds the schedule from this list.</p>
          </div>
          <ul className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {reg.teams.map(t => (
              <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-900 break-words">{t.teamName}</span>
                  {t.coachName && <span className="block text-[13px] text-slate-500">Coach {t.coachName}</span>}
                </span>
                <span className="shrink-0 flex flex-col items-end gap-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[13px] font-semibold text-slate-700">{t.division || 'No division'}</span>
                  {t.waitlisted && <span className="text-[12px] font-semibold text-amber-700">Waiting list</span>}
                </span>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {staffView && <StaffNote />}
          <div className="flex flex-col gap-1">
            <button type="button" onClick={confirm} disabled={busy || staffView || !reg.teams.length} className={primaryBtn}>
              {busy ? 'Confirming…' : 'Everything’s right — confirm'}
            </button>
            <button type="button" onClick={onRequestChange} disabled={busy} className={`${quietBtn} self-center`}>
              Something&rsquo;s wrong — ask for a change
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// What's left: the status bar across the top of the portal
// ---------------------------------------------------------------------------

export type LeftItem = {
  key: string; title: string; detail: string; done: boolean; optional?: boolean
  /** A box the director ticks to do this step (confirming the team list). */
  check?: { onClick: () => void; disabled?: boolean; title?: string }
  /** primary: a filled button (confirm, pay) rather than a text link. */
  action?: { label: string; onClick?: () => void; href?: string; disabled?: boolean; title?: string; primary?: boolean }
}

// Tailwind only ships class names it can see written out in full.
const LG_COLS = ['lg:grid-cols-1', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4']

function StepMark({ item: i }: { item: LeftItem }) {
  if (i.done) return <CheckCircle2 size={20} aria-label="Done" className="shrink-0 text-teal-600" />
  if (i.check) {
    // A real box to tick: 20px to see, 44px to tap.
    return (
      <button type="button" role="checkbox" aria-checked="false" aria-label={i.title}
        onClick={i.check.onClick} disabled={i.check.disabled} title={i.check.title}
        className="shrink-0 -m-3 p-3 rounded-full text-teal-600 hover:text-teal-800 disabled:text-gray-300 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
        <Square size={20} strokeWidth={2.25} />
      </button>
    )
  }
  return <Circle size={20} aria-label="Still to do" className="shrink-0 text-gray-300" />
}

function StepAction({ a, inline = false }: { a: NonNullable<LeftItem['action']>; inline?: boolean }) {
  const cls = a.primary
    ? 'mt-2 inline-flex items-center min-h-[36px] px-3.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-bold disabled:bg-gray-300 disabled:cursor-not-allowed'
    : `${inline ? '' : 'mt-1 '}inline-flex items-center text-[13px] font-semibold text-teal-700 hover:text-teal-800 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed`
  return a.href
    ? <a href={a.href} target="_blank" rel="noreferrer" title={a.title} className={cls}>{a.label}</a>
    : <button type="button" onClick={a.onClick} disabled={a.disabled} title={a.title} className={cls}>{a.label}</button>
}

/** The questions a director logs in to answer, as a progress bar across the top
 *  of the portal: one segment per step, filled as each is done (Bo, Oct 5 2026:
 *  "a status bar across the top where they have what's left before October
 *  24th"). Optional steps sit under the bar and never hold it back. */
export function StatusBar({ title, readyTitle, items }: { title: string; readyTitle?: string; items: LeftItem[] }) {
  const steps = items.filter(i => !i.optional)
  if (!steps.length) return null
  const extras = items.filter(i => i.optional && !i.done)
  const done = steps.filter(i => i.done).length
  const ready = done === steps.length
  const bar = (i: LeftItem) => (i.done ? 'bg-teal-500' : 'bg-gray-200')
  return (
    <section aria-label={title} className="px-5 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold text-gray-900">{ready ? (readyTitle || 'All set') : title}</h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ready ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-800'}`}>
          {done} of {steps.length} done
        </span>
      </div>
      {/* On a phone the steps stack, so the bar is drawn on its own. On a wide
          screen each step carries its own segment and the bar lines up with them. */}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}
        aria-label={`${done} of ${steps.length} done`} className="lg:hidden mt-3 flex gap-1.5">
        {steps.map(i => <span key={i.key} className={`h-2 flex-1 rounded-full ${bar(i)}`} />)}
      </div>
      <ol className={`mt-4 grid grid-cols-1 sm:grid-cols-2 ${LG_COLS[Math.min(steps.length, 4)]} gap-x-5 gap-y-4`}>
        {steps.map(i => (
          <li key={i.key} className="min-w-0">
            <span aria-hidden="true" className={`hidden lg:block h-2 rounded-full mb-3.5 ${bar(i)}`} />
            <div className="flex gap-2.5 items-start">
              <StepMark item={i} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 leading-5">{i.title}</div>
                <div className="text-[13px] leading-snug text-gray-500">{i.detail}</div>
                {i.action && !i.done && <StepAction a={i.action} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {extras.map(e => (
        <div key={e.key} className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Optional</span>
          <span><span className="font-semibold text-gray-700">{e.title}</span> · {e.detail}</span>
          {e.action && <StepAction a={{ ...e.action, primary: false }} inline />}
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pools, once Teams & pools is public
// ---------------------------------------------------------------------------

export type PortalPool = { division: string; name: string; teams: string[] }

/** "Pool A" from a stored "A"; a name that already says Pool or Group stays. Same as the public page. */
export const poolLabel = (p: string) => { const t = (p || '').trim(); return /^(pool|group)\b/i.test(t) ? t : `Pool ${t}` }

/** The pools a club's teams are in, with everyone in them: the lists the public
 *  page shows once Teams & pools is on (Bo, Oct 4 2026). Their own teams are
 *  picked out. Games wait for Schedule & brackets. */
export function PortalPools({ pools, myTeams, scheduleLive }: {
  pools: PortalPool[]; myTeams: { teamName: string; division: string; waitlisted?: boolean }[]; scheduleLive: boolean
}) {
  const key = (division: string, team: string) => `${nameKey(division)}|${nameKey(team)}`
  const mine = new Set(myTeams.map(t => key(t.division, t.teamName)))
  const placed = new Set(pools.flatMap(p => p.teams.map(t => key(p.division, t))))
  const unplaced = myTeams.filter(t => !t.waitlisted && !placed.has(key(t.division, t.teamName)))
  return (
    <section className="flex flex-col gap-3">
      {!scheduleLive && (
        <div className="rounded-xl px-4 py-3 border bg-sky-50 border-sky-200 text-sm text-sky-800 flex items-center gap-2">
          <CalendarDays size={15} className="shrink-0" /> Pools are posted. Game times and fields are coming soon.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {pools.map(p => (
          <div key={`${p.division}|${p.name}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">{p.division}</span>
                <span className="block font-bold text-gray-800">{poolLabel(p.name)}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-500">{p.teams.length} team{p.teams.length === 1 ? '' : 's'}</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {[...p.teams].sort((a, b) => a.localeCompare(b)).map(t => (
                <li key={t} className={`px-4 py-2 text-sm break-words ${mine.has(key(p.division, t)) ? 'font-semibold text-violet-700' : 'text-gray-700'}`}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {unplaced.length > 0 && (
        <p className="text-sm text-gray-500">Not in a pool yet: {unplaced.map(t => t.teamName).join(', ')}.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// The organizer's other events, on Overview
// ---------------------------------------------------------------------------

export function OtherEventsCard({ tournamentId, teamCount, showMoney, onRegister }: {
  tournamentId: string; teamCount: number; showMoney: boolean; onRegister: (eventId: string) => void
}) {
  const [events, setEvents] = useState<OtherEvent[] | null>(null)
  useEffect(() => {
    let live = true
    setEvents(null)
    fetch(`/api/club-director/events?tournamentId=${encodeURIComponent(tournamentId)}`)
      .then(r => r.ok ? r.json() : { events: [] }).then(d => { if (live) setEvents(Array.isArray(d?.events) ? d.events : []) })
      .catch(() => { if (live) setEvents([]) })
    return () => { live = false }
  }, [tournamentId])
  if (!events || !events.length) return null
  const n = Math.max(1, teamCount)
  return (
    <section className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <h2 className="font-bold text-gray-800 flex items-center gap-2"><CalendarPlus size={17} className="text-teal-600" /> Bring your teams to another event</h2>
      <p className="mt-1 text-sm text-gray-500">Your teams are filled in to start. Keep them, rename them or add new ones, pick the divisions, and your club is registered.</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {events.map(ev => {
          const per = calcFee(Array.from({ length: n }, () => ({ division: '' })), ev.pricing) / n
          return (
            <div key={ev.id} className="rounded-2xl border border-gray-200 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-bold text-gray-800">{ev.name}</span>
                  <span className="block text-[13px] text-gray-500">{eventDates(ev.startDate, ev.endDate)}{ev.location ? ` · ${ev.location}` : ''}</span>
                </span>
                {showMoney && per > 0 && (
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-[13px] font-bold whitespace-nowrap">{money(per)} / team</span>
                )}
              </div>
              <button type="button" onClick={() => onRegister(ev.id)}
                className="min-h-[44px] rounded-full border border-teal-600 text-teal-700 hover:bg-teal-50 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <ArrowRightLeft size={15} /> Register teams
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Club directors: who can open a registration, and adding another one
//
// Access is per registration, by email (lib/clubAccess; Bo, Oct 4 2026). A club
// with two directors, or a new director taking over, gets the next person in
// here: the invite goes to their email and opens this registration in their own
// login (lib/clubInvites, api/club-director/directors).
// ---------------------------------------------------------------------------

export type PortalDirector = { name: string; email: string; you: boolean }
export type PortalInvite = { email: string; name: string; by: string; at: string }

/** The line on each registration card: its directors, open invites, Add a director. */
export function DirectorsLine({ directors, invites, onAdd, onCancel, staffView = false }: {
  directors: PortalDirector[]; invites: PortalInvite[]; onAdd: () => void; onCancel: (email: string) => void; staffView?: boolean
}) {
  return (
    <div className="px-5 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
      <span className="text-gray-500 mr-1">Club directors:</span>
      {directors.length === 0 && <span className="text-xs text-gray-400">none yet</span>}
      {directors.map(d => (
        <span key={d.email} title={d.email}
          className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 max-w-full truncate">
          {d.name || d.email}{d.you ? ' (you)' : ''}
        </span>
      ))}
      {invites.map(i => (
        <span key={i.email} title={`Invited by ${i.by}`}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800 max-w-full">
          <span className="truncate">{i.name || i.email}</span> · invited
          {!staffView && (
            <button type="button" onClick={() => onCancel(i.email)} aria-label={`Take back the invite to ${i.email}`}
              className="ml-0.5 -mr-1 p-0.5 rounded-full text-amber-700 hover:text-amber-900 hover:bg-amber-100">
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      <button type="button" onClick={onAdd}
        className="inline-flex items-center gap-1 min-h-[28px] text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline">
        <Plus size={13} className="shrink-0" /> Add a director
      </button>
    </div>
  )
}

export function AddDirectorDialog({ tournamentId, eventName, reg, staffView = false, onClose, onDone }: {
  tournamentId: string; eventName: string; reg: { id: string; clubName: string }; staffView?: boolean
  onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const ok = EMAIL.test(email.trim())

  async function send() {
    if (busy || staffView || !ok) return
    setBusy(true); setError('')
    const r = await postJson('/api/club-director/directors', { tournamentId, registrationId: reg.id, email: email.trim(), name: name.trim() })
    setBusy(false)
    if (!r.ok) { setError(r.data?.error || 'Could not send the invite'); return }
    setSentTo(email.trim().toLowerCase())
    onDone()
  }

  return (
    <Dialog title="Add a club director" onClose={onClose}>
      {sentTo ? (
        <Done title="Invite sent" onClose={onClose} body={
          <>We emailed <strong>{sentTo}</strong> a link to join {reg.clubName}&rsquo;s portal. It works once and expires in 14 days. Until then they show as <strong>invited</strong> on your Club directors line.</>
        } />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="pr-8">
            <Eyebrow>{eventName}</Eyebrow>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">Add a club director</h2>
            <p className="mt-0.5 text-sm text-slate-500">They get their own login for {reg.clubName} and see what you see here: teams, player waivers, invoice and schedule.</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Their name <span className="font-normal text-slate-400">(optional)</span></span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="off" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">Their email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.com" className={fieldClass} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {staffView && <StaffNote />}
          <NextSteps steps={[
            'They get an email with a link that works once.',
            'They choose a password, or sign in with the one they already have for that email.',
            `${reg.clubName} at ${eventName} opens in their portal.`,
          ]} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={send} disabled={busy || staffView || !ok} className={primaryBtn}>
              {busy ? 'Sending…' : 'Send invite'}
            </button>
            <button type="button" onClick={onClose} className={quietBtn}>Cancel</button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/** Why a club's waivers are missing: another registration at the event has the
 *  same club name, so a waiver under it could be either one's (lib/clubAccess). */
export function SharedNameNote({ clubs }: { clubs: string[] }) {
  if (!clubs.length) return null
  return (
    <p className="text-[13px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
      <strong className="font-semibold">Waivers under {clubs.join(', ')} are hidden for now.</strong>{' '}
      Another registration for this event uses the same club name, so a waiver filed under it could be theirs or yours.
      The tournament office has been told and will sort it out.
    </p>
  )
}
