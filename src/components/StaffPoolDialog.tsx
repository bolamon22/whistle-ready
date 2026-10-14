'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, UserPlus, X, Link2, AlertTriangle } from 'lucide-react'
import { nameKey } from '@/lib/names'

// "Add to the Staff Pool" on Logins (Bo, Oct 14 2026). A login is staff through the
// Staff Pool record with the same email, and changing a role to Staff never made one:
// Steve Newell signed up to officiate as a Parent, Bo switched him to Staff, and he
// still wasn't on any staff list. This links a record he's already in under another
// email, or makes a new one. api/admin/users/staff-pool does the work.

export type StaffPoolLogin = { id: string; name: string; email: string; role: string }
type Rec = { id: string; name: string; email: string; jobs: string[]; gender: string; orgId: string | null; events: number; login: { name: string; role: string } | null }
type Data = { login: StaffPoolLogin & { orgId: string | null }; linked: Rec | null; workers: Rec[]; orgs: { id: string; name: string; staff: number }[]; defaultOrgId: string | null }

const JOBS = [
  { key: 'ref', label: 'Ref' }, { key: 'scorekeeper', label: 'Scorekeeper' },
  { key: 'athletic_trainer', label: 'Athletic trainer' }, { key: 'field_ops', label: 'Field ops' },
]
const JOB_LABEL: Record<string, string> = Object.fromEntries(JOBS.map(j => [j.key, j.label]))
const ROLE_LABEL: Record<string, string> = { '': 'no role', viewer: 'Viewer', parent: 'Parent', coach: 'Coach', club_director: 'Club Director', staff: 'Staff' }
// Roles the server raises to Staff (lib/staffLogin STAFF_PROMOTABLE; that file can't be imported here).
const RAISED = new Set(['', 'viewer', 'parent', 'coach', 'club_director'])

const pill = (on: boolean) => `h-9 px-3 rounded-full border text-sm font-semibold transition-colors ${on ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`

function jobsText(r: Rec) {
  const jobs = r.jobs.map(j => j === 'ref' && (r.gender === 'boys' || r.gender === 'girls') ? `Ref · ${r.gender}` : (JOB_LABEL[j] ?? j.replace(/_/g, ' ')))
  return [...jobs, r.events ? `${r.events} event${r.events === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
}

export default function StaffPoolDialog({ login, suggest, roleJustChanged, onClose, onDone }: {
  login: StaffPoolLogin
  /** A record with the same name (Logins' "staffMatch"), shown first. */
  suggest?: string
  /** Opened right after the role was changed to Staff. */
  roleJustChanged?: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState('')   // the record id waiting for "Link record"
  const [job, setJob] = useState('')
  const [gender, setGender] = useState('both')
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState('')   // 'link' | 'create' while saving
  const first = login.name.trim().split(/\s+/)[0] || login.name

  useEffect(() => {
    fetch(`/api/admin/users/staff-pool?userId=${encodeURIComponent(login.id)}`)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not load the Staff Pool'); return j as Data })
      .then(d => { setData(d); setOrgId(d.defaultOrgId ?? '') })
      .catch(e => setError(e.message || 'Could not load the Staff Pool'))
  }, [login.id])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  // Same name first, then same last name. Typing searches every record.
  const shown = useMemo(() => {
    if (!data) return []
    const t = q.trim().toLowerCase()
    if (t.length >= 2) return data.workers.filter(w => w.name.toLowerCase().includes(t) || w.email.includes(t)).slice(0, 8)
    const words = login.name.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const last = nameKey(words[words.length - 1] || '')
    const full = nameKey(login.name)
    const score = (w: Rec) => w.id === suggest || nameKey(w.name) === full ? 3
      : last && nameKey(w.name.trim().split(/\s+/).pop() || '') === last ? 2 : 0
    return data.workers.map(w => ({ w, s: score(w) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.w.name.localeCompare(b.w.name)).slice(0, 5).map(x => x.w)
  }, [data, q, login.name, suggest])

  async function send(body: Record<string, unknown>) {
    setBusy(String(body.action)); setError('')
    const res = await fetch('/api/admin/users/staff-pool', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: login.id, ...body }),
    }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy('')
    if (!res?.ok) { setError(j.error || 'Could not save. Try again.'); return }
    const raised = j.role && j.role !== login.role ? ` Their login is ${ROLE_LABEL[j.role] ?? j.role} now.` : ''
    onDone(body.action === 'link' ? `Linked ${login.name} to ${j.name || 'their'} Staff Pool record.${raised}` : `${login.name} is in the Staff Pool.${raised}`)
  }

  const raise = RAISED.has(login.role)
  const orgName = (id: string | null) => data?.orgs.find(o => o.id === id)?.name ?? ''
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Add ${login.name} to the Staff Pool`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {roleJustChanged && <p className="text-xs font-bold text-teal-700 mb-1">Role saved. One more step:</p>}
            <h2 className="text-lg font-bold text-gray-800">Add {first} to the Staff Pool</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"><X size={16} /></button>
        </div>
        <p className="text-sm text-gray-600 mt-1.5 leading-snug">
          Logins and Staff Pool records are matched by email. No record has <b className="font-semibold text-gray-800 break-words">{login.email}</b>, so {first} isn&apos;t on staff lists, event rosters or Auto-assign.
        </p>
        {raise && <p className="text-xs text-gray-500 mt-2">Their login changes from {ROLE_LABEL[login.role] ?? login.role} to Staff when you save.</p>}

        {!data && !error && <p className="text-sm text-gray-400 py-8 text-center">Loading the Staff Pool…</p>}
        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {data?.linked && (
          <div className="mt-4 rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5 text-sm text-teal-900">
            Already in the Staff Pool as <b>{data.linked.name}</b>. <Link href={`/staff/${data.linked.id}`} className="underline font-semibold">Open their staff record</Link>
          </div>
        )}

        {data && !data.linked && (
          <>
            <h3 className="mt-5 text-sm font-bold text-gray-800">Already in the Staff Pool under another email?</h3>
            <div className="relative mt-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="search" value={q} onChange={e => { setQ(e.target.value); setConfirm('') }} placeholder="Search the Staff Pool by name or email"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div className="mt-2 space-y-1.5">
              {shown.length === 0 && (
                <p className="text-xs text-gray-400 px-1">{q.trim().length >= 2 ? 'No one in the Staff Pool matches.' : `No one in the Staff Pool shares ${first}'s last name. Search above, or add them below.`}</p>
              )}
              {shown.map(w => (
                <div key={w.id} className={`rounded-xl border px-3 py-2 ${confirm === w.id ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{w.name} <span className="font-normal text-gray-500">{jobsText(w) && `· ${jobsText(w)}`}</span></p>
                      <p className="text-xs text-gray-500 truncate">{w.email || 'No email'}{data.orgs.length > 1 && w.orgId ? ` · ${orgName(w.orgId)}` : ''}</p>
                    </div>
                    {confirm !== w.id && (
                      <button type="button" onClick={() => setConfirm(w.id)} disabled={!!busy}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 hover:border-sky-400 px-2.5 py-1.5 rounded-lg">
                        <Link2 size={13} />Link
                      </button>
                    )}
                  </div>
                  {confirm === w.id && (
                    <div className="mt-2 text-xs text-amber-900 leading-snug space-y-2">
                      <p>Link {w.name}&apos;s record to this login? {w.email ? <>Its email changes from <b className="break-words">{w.email}</b> to <b className="break-words">{login.email}</b></> : <>It gets the email <b className="break-words">{login.email}</b></>}, so staff emails go there too.</p>
                      {w.login && (
                        <p className="flex gap-1.5"><AlertTriangle size={14} className="shrink-0 text-amber-600" /><span>{w.email} is also a login ({w.login.name}, {ROLE_LABEL[w.login.role] ?? w.login.role}). That login won&apos;t match this record anymore.</span></p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => send({ action: 'link', workerId: w.id })} disabled={!!busy}
                          className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-1.5">{busy === 'link' ? 'Linking…' : 'Link record'}</button>
                        <button type="button" onClick={() => setConfirm('')} className="border border-gray-300 bg-white text-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 my-5"><span className="h-px flex-1 bg-gray-200" /><span className="text-xs font-semibold text-gray-400">or</span><span className="h-px flex-1 bg-gray-200" /></div>

            <h3 className="text-sm font-bold text-gray-800">New to the Staff Pool</h3>
            <p className="text-xs text-gray-500 mt-0.5">A new record with {first}&apos;s name and login email. Phone, pay and certification can be added on their staff record.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Job">
              {JOBS.map(j => <button key={j.key} type="button" aria-pressed={job === j.key} className={pill(job === j.key)} onClick={() => setJob(j.key)}>{j.label}</button>)}
            </div>
            {job === 'ref' && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Refs">
                <span className="text-xs text-gray-500 mr-1">Refs</span>
                {['boys', 'girls', 'both'].map(g => <button key={g} type="button" aria-pressed={gender === g} className={pill(gender === g)} onClick={() => setGender(g)}>{g[0].toUpperCase() + g.slice(1)}</button>)}
              </div>
            )}
            {data.orgs.length > 1 && (
              <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                Organization
                <select value={orgId} onChange={e => setOrgId(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  {data.orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" disabled={!job || !!busy} onClick={() => send({ action: 'create', job, gender, orgId: orgId || null })}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 disabled:bg-gray-300 text-white font-semibold rounded-xl py-2.5 text-sm">
              <UserPlus size={16} />{busy === 'create' ? 'Adding…' : job ? `Add ${first} to the Staff Pool` : 'Pick a job to add them'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
