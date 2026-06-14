'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'

interface Tournament { id: string; name: string; startDate: string; endDate: string; logoUrl: string }
interface Club {
  id: string; clubName: string; contactName: string; contactEmail: string
  numTeams: number; divisions: string[]; registered: boolean
}

const DEFAULT_SUBJECT = `{{tournamentName}} — Registration Now Open`
const DEFAULT_BODY = `Hi {{contactName}},

We hope you had a great experience at our last event! We are excited to invite {{clubName}} back for {{tournamentName}}, taking place on {{dates}}.

Last year, your club brought {{lastYearTeams}} team(s) competing in: {{lastYearDivisions}}.

We would love to see you back on the field. Registration is now open — click the link below to secure your spot before divisions fill up.

{{registerUrl}}

Please don't hesitate to reach out with any questions.

Best regards,
Bo Lamon
Whistle Ready`

function applyVars(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), template)
}

export default function ReturningTeamsPage({ params }: { params: { id: string } }) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [thisTournament, setThisTournament] = useState<Tournament | null>(null)
  const [sourceId, setSourceId] = useState('')
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'registered' | 'not-registered'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Email template state
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [showTemplate, setShowTemplate] = useState(false)
  const [previewClub, setPreviewClub] = useState<Club | null>(null)

  useEffect(() => {
    fetch('/api/tournaments').then(r => r.json()).then((all: Tournament[]) => {
      setTournaments(all.filter(t => t.id !== params.id))
    })
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setThisTournament(t)
      // Pre-fill tournament name in subject
      setSubject(`Registration is open for ${t.name}`)
    })
  }, [params.id])

  function getVars(club?: Club) {
    const fmtDate = (d: string) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
    const dateStr = thisTournament?.startDate
      ? thisTournament.endDate && thisTournament.endDate !== thisTournament.startDate
        ? `${fmtDate(thisTournament.startDate)} – ${fmtDate(thisTournament.endDate)}`
        : fmtDate(thisTournament.startDate)
      : 'TBD'
    return {
      clubName: club?.clubName ?? '[Club Name]',
      contactName: club?.contactName ?? '[Contact Name]',
      tournamentName: thisTournament?.name ?? '[Tournament]',
      dates: dateStr,
      registerUrl: `${typeof window !== 'undefined' ? window.location.origin : 'https://whistleready.app'}/tournaments/${params.id}/register`,
      lastYearTeams: String(club?.numTeams ?? '—'),
      lastYearDivisions: club?.divisions?.join(', ') ?? '—',
    }
  }

  async function loadComparison(fromId: string) {
    if (!fromId) { setClubs([]); return }
    setLoading(true); setSelected(new Set())
    const res = await fetch(`/api/tournaments/${params.id}/returning-teams?from=${fromId}`)
    const data = await res.json()
    setClubs(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function toggleSelect(clubName: string) {
    setSelected(prev => { const s = new Set(prev); s.has(clubName) ? s.delete(clubName) : s.add(clubName); return s })
  }

  function selectAllUnregistered() {
    setSelected(new Set(clubs.filter(c => !c.registered).map(c => c.clubName)))
  }

  async function sendInvites() {
    const toSend = clubs.filter(c => selected.has(c.clubName) && !c.registered)
    if (!toSend.length) { toast.error('No unregistered clubs selected'); return }
    setSending(true)
    const res = await fetch(`/api/tournaments/${params.id}/returning-teams/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clubs: toSend.map(c => ({ clubName: c.clubName, contactEmail: c.contactEmail, contactName: c.contactName, numTeams: c.numTeams, divisions: c.divisions })),
        subjectTemplate: subject,
        bodyTemplate: body,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success(`Sent ${data.sent} invite${data.sent !== 1 ? 's' : ''}${data.errors?.length ? ` (${data.errors.length} failed)` : ''}`)
      setSelected(new Set())
    } else toast.error('Failed to send invites')
    setSending(false)
  }

  const filtered = clubs.filter(c => filter === 'all' ? true : filter === 'registered' ? c.registered : !c.registered)
  const unregisteredCount = clubs.filter(c => !c.registered).length
  const registeredCount = clubs.filter(c => c.registered).length
  const selectedUnregistered = clubs.filter(c => selected.has(c.clubName) && !c.registered)
  const previewVars = getVars(previewClub ?? clubs.find(c => !c.registered))

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Toaster />
      <TournamentNav id={params.id} name={thisTournament?.name ?? ''} logoUrl={thisTournament?.logoUrl ?? ''} />

      <div className="max-w-4xl mx-auto px-6 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Returning Teams</h1>
            <p className="text-sm text-slate-500 mt-0.5">Compare registrations from a previous tournament and invite clubs back</p>
          </div>
          <Link href={`/tournaments/${params.id}/registrations`} className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors">
            ← Registrations
          </Link>
        </div>

        {/* Source picker */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Compare against which tournament?</label>
          <select className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            value={sourceId} onChange={e => { setSourceId(e.target.value); loadComparison(e.target.value) }}>
            <option value="">— Select a previous tournament —</option>
            {tournaments.sort((a, b) => b.startDate.localeCompare(a.startDate)).map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.startDate ? ` (${t.startDate})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Email template editor */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 overflow-hidden">
          <button onClick={() => setShowTemplate(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="text-base">✉️</span>
              <span className="text-sm font-semibold text-slate-700">Invite Email Template</span>
              <span className="text-xs text-slate-400 font-normal">— edit before sending</span>
            </div>
            <span className="text-slate-400 text-sm">{showTemplate ? '▲' : '▼'}</span>
          </button>

          {showTemplate && (
            <div className="border-t border-slate-100 p-5 space-y-4">
              {/* Variables reference */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Available variables: </span>
                {['{{contactName}}','{{clubName}}','{{tournamentName}}','{{dates}}','{{registerUrl}}','{{lastYearTeams}}','{{lastYearDivisions}}'].map(v => (
                  <code key={v} className="bg-white border border-slate-200 rounded px-1.5 py-0.5 mx-0.5 text-teal-700">{v}</code>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Editor */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={subject} onChange={e => setSubject(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Body</label>
                    <textarea rows={12} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y font-mono"
                      value={body} onChange={e => setBody(e.target.value)} />
                  </div>
                  <button onClick={() => { setSubject(DEFAULT_SUBJECT); setBody(DEFAULT_BODY) }}
                    className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">Reset to default</button>
                </div>

                {/* Preview */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">Preview</label>
                    {clubs.filter(c => !c.registered).length > 0 && (
                      <select className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none"
                        value={previewClub?.clubName ?? ''}
                        onChange={e => setPreviewClub(clubs.find(c => c.clubName === e.target.value) ?? null)}>
                        <option value="">Sample club</option>
                        {clubs.filter(c => !c.registered).map(c => <option key={c.clubName} value={c.clubName}>{c.clubName}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 text-sm space-y-3">
                    <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Subject</div>
                    <div className="font-semibold text-slate-800 text-sm">{applyVars(subject, previewVars)}</div>
                    <div className="border-t border-slate-200 pt-3">
                      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Body</div>
                      <div className="text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">{applyVars(body, previewVars)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading && <div className="text-center py-16 text-slate-400">Loading…</div>}

        {!loading && sourceId && clubs.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            No team registrations found in that tournament.
          </div>
        )}

        {!loading && clubs.length > 0 && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-sm flex-1">
                <span className="font-semibold text-slate-800">{clubs.length} clubs</span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-600 font-semibold">✓ {registeredCount} back</span>
                <span className="text-slate-300">·</span>
                <span className="text-amber-600 font-semibold">✗ {unregisteredCount} not yet</span>
              </div>
              <div className="flex items-center gap-2">
                {(['all', 'registered', 'not-registered'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                    {f === 'all' ? 'All' : f === 'registered' ? '✓ Registered' : '✗ Not Yet'}
                  </button>
                ))}
              </div>
            </div>

            {unregisteredCount > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-4 flex items-center gap-3 flex-wrap">
                <button onClick={selectAllUnregistered} className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2">
                  Select all {unregisteredCount} unregistered
                </button>
                {selected.size > 0 && <span className="text-xs text-slate-500">{selected.size} selected ({selectedUnregistered.length} unregistered)</span>}
                <div className="flex-1" />
                <button onClick={sendInvites} disabled={selectedUnregistered.length === 0 || sending}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  {sending ? 'Sending…' : `✉ Send Invite${selectedUnregistered.length !== 1 ? 's' : ''} (${selectedUnregistered.length})`}
                </button>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-4 py-3" />
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Club</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Divisions</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Teams</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(club => (
                    <tr key={club.id} className={`hover:bg-slate-50 transition-colors ${club.registered ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        {!club.registered && (
                          <input type="checkbox" className="w-4 h-4 accent-teal-600 cursor-pointer"
                            checked={selected.has(club.clubName)} onChange={() => toggleSelect(club.clubName)} />
                        )}
                      </td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-800">{club.clubName}</div></td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{club.contactName}</div>
                        <div className="text-slate-400 text-xs">{club.contactEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {club.divisions.slice(0, 3).map(d => (
                            <span key={d} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{d}</span>
                          ))}
                          {club.divisions.length > 3 && <span className="text-[11px] text-slate-400">+{club.divisions.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{club.numTeams}</td>
                      <td className="px-4 py-3">
                        {club.registered
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ Registered</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Not yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
