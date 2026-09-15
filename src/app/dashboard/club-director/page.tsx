'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronUp, ClipboardList, ExternalLink, Eye, Globe, LayoutGrid, List, RefreshCw, Trophy, Users } from 'lucide-react'
import toast from 'react-hot-toast'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string }
interface Waiver {
  id: string; playerName: string; team: string; club: string
  jersey: string | number | null; grade: string; parentName: string
  position: string; photoUrl: string; parentPhone: string; parentEmail: string
  signed: boolean; submittedAt: string
}
interface Registration {
  id: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; needsHotel: string; paymentMethod: string; clubLogoUrl: string
  invoiceAmount: number; discountAmount: number; discountNote: string; createdAt: string
  teams: {
    id: string; teamName: string; division: string; logoUrl?: string
    coachName: string; coachPhone: string; coachEmail: string
  }[]
  payments: { amount: number; method: string; receivedAt: string }[]
}
interface PlayerReg {
  id: string; playerName: string; teamClubName: string; grade: string
  gender: string; jerseyNumber: string; waiverSignature: string; parentName: string; parentPhone: string
}
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean; isChampionship: boolean
}
interface HistoryEntry {
  tournament: { id: string; name: string; sport: string; startDate: string; endDate: string; location: string; logoUrl: string }
  clubs: string[]
  teams: { id: string; teamName: string; division: string; logoUrl?: string }[]
  registrations: {
    id: string; clubName: string; clubContact: string; contactEmail: string
    contactPhone: string; clubBasedIn: string; paymentMethod: string; notes: string
    numTeams: number; needsHotel: string; teams: { teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string }[]
  }[]
  record: { wins: number; losses: number; ties: number; gamesPlayed: number }
  championshipWins: string[]
  finance: { invoiceTotal: number; paidTotal: number; balance: number; payments: { amount: number; method: string; receivedAt: string; clubName: string }[] }
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const shortDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// The stored value is a slug ('check', 'card'); clubs read the label.
const PAY_LABEL: Record<string, string> = {
  check: 'Check', card: 'Credit card', credit_card: 'Credit card', stripe: 'Credit card',
  ach: 'Bank transfer (ACH)', cash: 'Cash', paypal: 'PayPal', venmo: 'Venmo', invoice: 'Invoice',
}
const payLabel = (m: string) => PAY_LABEL[String(m || '').toLowerCase()] || (m ? m[0].toUpperCase() + m.slice(1) : '—')

const initials = (n: string) =>
  String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'

const fileDate = (d: string) => { try { return new Date(d).toLocaleDateString() } catch { return '' } }

// A player card needs a block of color behind the initials when there is no
// photo. Hashed off the name so the same player keeps the same one, rather than
// re-rolling on every render.
const TONES = ['bg-rose-600', 'bg-violet-600', 'bg-teal-600', 'bg-indigo-600', 'bg-amber-600', 'bg-sky-600']
const avatarTone = (n: string) => {
  let h = 0
  for (const ch of String(n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

// Re-register modal
function ReregisterModal({ entry, tournaments, onClose }: {
  entry: HistoryEntry
  tournaments: Tournament[]
  onClose: () => void
}) {
  const reg = entry.registrations[0]
  const [targetTournament, setTargetTournament] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!targetTournament || !reg) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId: targetTournament,
          clubName: reg.clubName,
          clubContact: reg.clubContact,
          contactEmail: reg.contactEmail,
          contactPhone: reg.contactPhone,
          clubBasedIn: reg.clubBasedIn,
          paymentMethod: reg.paymentMethod,
          notes: reg.notes,
          numTeams: reg.numTeams,
          needsHotel: reg.needsHotel,
          teams: reg.teams.map(t => ({
            clubName: reg.clubName,
            teamName: t.teamName,
            division: t.division,
            coachName: t.coachName,
            coachPhone: t.coachPhone,
            coachEmail: t.coachEmail,
          })),
          invoiceAmount: 0,
          discountAmount: 0,
          discountNote: '',
        }),
      })
      if (res.ok) {
        toast.success('Re-registered successfully! The tournament admin will confirm your invoice.')
        onClose()
      } else {
        toast.error('Registration failed — please contact the tournament office.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const targetName = tournaments.find(t => t.id === targetTournament)?.name

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md z-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Re-Register</h2>
        <p className="text-sm text-gray-500 mb-4">
          Pre-filled from <span className="font-medium text-violet-700">{entry.tournament.name}</span> — pick the tournament you want to register for.
        </p>

        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-violet-600 uppercase mb-2">What will be copied</p>
          <p className="text-sm text-gray-700 font-medium">{reg?.clubName}</p>
          <p className="text-sm text-gray-500">{reg?.clubContact} · {reg?.contactEmail}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {reg?.teams.map((t, i) => (
              <span key={i} className="text-xs bg-white border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full">{t.teamName} · {t.division}</span>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Register for Tournament</label>
          <select value={targetTournament} onChange={e => setTargetTournament(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">Select tournament…</option>
            {tournaments.filter(t => t.id !== entry.tournament.id).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {targetTournament && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-800 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Invoice amount will be set to $0 — the tournament admin will confirm your pricing.</span>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={submit} disabled={!targetTournament || submitting}
            className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2 text-sm">
            {submitting ? 'Submitting…' : `Register for ${targetName ?? '…'}`}
          </button>
          <button onClick={onClose} className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ClubDirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selTournament, setSelTournament] = useState('')
  const [data, setData] = useState<{ clubs: string[]; registrations: Registration[]; playerRegs: PlayerReg[]; games: Game[]; teamNames: string[]; waivers?: Waiver[] } | null>(null)
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [playerView, setPlayerView] = useState<'cards' | 'list'>('cards')
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)
  const [linkClubs, setLinkClubs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'players' | 'schedule' | 'history'>('overview')
  const [noLinks, setNoLinks] = useState(false)
  const [perms, setPerms] = useState<Record<string, boolean>>({ cd_overview: true, cd_players: true, cd_schedule: true, cd_billing: true })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [reregEntry, setReregEntry] = useState<HistoryEntry | null>(null)
  // Staff (admin/director) can open a club director's own portal with ?userId=,
  // so a report like "my Overview shows no teams" is seen rather than guessed
  // (Bo, Sep 15 2026). Read from location instead of useSearchParams so the page
  // needs no Suspense boundary. Empty for a director viewing their own portal.
  const [viewUserId, setViewUserId] = useState('')
  const [viewingUser, setViewingUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    const vu = typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('userId') || '')
    setViewUserId(vu)
    const q = vu ? `?userId=${encodeURIComponent(vu)}` : ''
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch(`/api/club-director/links${q}`).then(r => r.json()),
      fetch(`/api/club-director/permissions${q}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([t, linkRes, p]) => {
      if (p && !p.error) setPerms(p)
      // /api/tournaments returns [] for anyone without an orgId, which is every
      // club director — they belong to a club, not to the organizing body. So the
      // picker is built from the linked tournaments the links route now returns,
      // and only falls back to the org list for a staff member viewing this page.
      const links = Array.isArray(linkRes) ? linkRes : (linkRes?.links ?? [])
      const linked: Tournament[] = (Array.isArray(linkRes) ? [] : (linkRes?.tournaments ?? []))
      if (!links || links.length === 0) { setNoLinks(true); setLoading(false); return }
      setLinkClubs([...new Set((links as { clubName: string }[]).map(l => l.clubName).filter(Boolean))])
      const list: Tournament[] = linked.length ? linked : (Array.isArray(t) ? t : [])
      setTournaments(list)
      const linkedIds = [...new Set((links as { tournamentId: string }[]).map(l => l.tournamentId))]
      const first = list.find(x => linkedIds.includes(x.id)) || list[0]
      if (!Array.isArray(linkRes) && linkRes?.viewing) setViewingUser(linkRes.viewing)
      if (first) { setSelTournament(first.id); loadData(first.id, vu) }
      setLoading(false)
    })
  }, [status])

  const loadData = async (tournamentId: string, uid = viewUserId) => {
    setDataLoading(true)
    const res = await fetch(`/api/club-director/data?tournamentId=${tournamentId}${uid ? `&userId=${encodeURIComponent(uid)}` : ''}`)
    const d = await res.json()
    setData(d)
    setDataLoading(false)
  }

  const loadHistory = async () => {
    if (history.length > 0) return
    setHistoryLoading(true)
    const res = await fetch(`/api/club-director/history${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`)
    const h = await res.json()
    setHistory(Array.isArray(h) ? h : [])
    setHistoryLoading(false)
  }

  const switchTab = (key: typeof tab) => {
    setTab(key)
    if (key === 'history') loadHistory()
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  if (noLinks) return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="bg-white border border-gray-200 rounded-2xl p-10">
        <div className="h-14 w-14 mx-auto mb-4 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
          <Users size={26} className="text-violet-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Welcome, {session?.user?.name}!</h1>
        <p className="text-gray-500">Your account hasn't been linked to a club yet.</p>
        <p className="text-sm text-gray-400 mt-2">Please contact your tournament administrator to get linked to your club.</p>
      </div>
    </div>
  )

  const selTournamentName = tournaments.find(t => t.id === selTournament)?.name || ''
  const waivers: Waiver[] = data?.waivers ?? []
  // Waivers land on the team whose name they carry. Normalized both sides
  // because the form writes "Club \u2014 Team" and people type inconsistently.
  const normName = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  // One grouping feeds BOTH the Overview table and the Players tab, so the count
  // on the summary row can never disagree with the names listed under a team.
  const teamRows = (data?.registrations ?? []).flatMap(r =>
    r.teams.map(t => ({
      key: t.id,
      regId: r.id,
      clubLogoUrl: r.clubLogoUrl,
      teamName: t.teamName,
      division: t.division,
      logoUrl: t.logoUrl,
      coachName: t.coachName,
      coachPhone: t.coachPhone,
      coachEmail: t.coachEmail,
      players: waivers.filter(w => normName(w.team) === normName(t.teamName)),
    }))
  )
  const claimed = new Set(teamRows.flatMap(r => r.players.map(p => p.id)))
  const unassignedWaivers = waivers.filter(w => !claimed.has(w.id))
  const totalPlayers = waivers.length || (data?.playerRegs.length ?? 0)
  const totalTeams = data?.registrations.reduce((s, r) => s + r.teams.length, 0) ?? 0
  const totalInvoiced = data?.registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0) ?? 0
  const totalPaid = data?.registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0) ?? 0
  const balance = totalInvoiced - totalPaid

  // Billing is gone as a tab — the invoice now sits under the teams it paid for,
  // on Overview. Schedule only appears once there is one: an empty tab during
  // the weeks before the draw just reads as broken (Bo, Sep 15 2026).
  const hasSchedule = (data?.games?.length ?? 0) > 0
  // cd_billing used to decide whether the Billing TAB appeared. With the invoice
  // folded into Overview it has to gate the money itself, or removing the tab
  // would quietly grant billing visibility to clubs that had it switched off.
  const showMoney = perms.cd_billing !== false
  const TABS: { key: typeof tab; label: string; Icon: typeof Users; perm?: string; when?: boolean }[] = [
    { key: 'overview',  label: 'Overview',           Icon: ClipboardList, perm: 'cd_overview' },
    { key: 'players',   label: 'Player waivers',     Icon: Users,         perm: 'cd_players'  },
    { key: 'schedule',  label: 'Schedule',           Icon: CalendarDays,  perm: 'cd_schedule', when: hasSchedule },
    { key: 'history',   label: 'History',            Icon: Trophy                             },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8">
      {reregEntry && (
        <ReregisterModal entry={reregEntry} tournaments={tournaments} onClose={() => setReregEntry(null)} />
      )}

      {viewUserId && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Eye size={16} className="shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold">Staff view.</strong> This is{' '}
            {viewingUser?.name ? `${viewingUser.name}’s` : 'this club director’s'} portal, exactly as they see it
            {viewingUser?.email ? ` (${viewingUser.email})` : ''}. Buttons that would act on their behalf are hidden.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Club director</p>
          <h1 className="text-2xl font-bold text-gray-800 mt-0.5">
            {(data?.clubs?.length ? data.clubs : linkClubs).join(', ') || 'Your club'}
          </h1>
          {selTournamentName && <p className="text-sm text-gray-500 mt-0.5">{selTournamentName}</p>}
        </div>
        {tab !== 'history' && (
          <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadData(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Stats — hide on History tab */}
      {tab !== 'history' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Teams', value: totalTeams, color: 'text-violet-600' },
            { label: 'Waivers filed', value: totalPlayers, color: 'text-blue-600' },
            ...(showMoney ? [
              { label: 'Invoiced', value: fmt(totalInvoiced), color: 'text-gray-800' },
              { label: 'Balance due', value: fmt(balance), color: balance > 0 ? 'text-red-600' : 'text-green-600' },
            ] : []),
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200 overflow-x-auto items-end">
        {TABS.filter(t => (!t.perm || perms[t.perm] !== false) && t.when !== false).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${tab === key ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} className="shrink-0" /> {label}
          </button>
        ))}
        <div className="flex-1" />
        {selTournament && (
          <a href={`/tournaments/${selTournament}/public`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-semibold text-rose-600 hover:text-rose-700 whitespace-nowrap border-b-2 border-transparent hover:border-rose-300 transition-colors flex items-center gap-1.5">
            <Globe size={15} className="shrink-0" /> Public view
          </a>
        )}
      </div>

      {/* History tab */}
      {tab === 'history' && (
        historyLoading ? <div className="text-center py-12 text-gray-400">Loading history…</div> : (
          history.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No tournament history yet.</div>
          ) : (
            <div className="space-y-5">
              {history.map((entry, i) => {
                const { tournament, record, championshipWins, teams } = entry
                const hasRecord = record.gamesPlayed > 0
                return (
                  <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    {/* Tournament header */}
                    <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-violet-50 to-white border-b border-gray-100">
                      {tournament.logoUrl && (
                        <img src={tournament.logoUrl} alt="" className="h-12 w-12 object-contain rounded-lg" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800">{tournament.name}</div>
                        <div className="text-xs text-gray-500">{tournament.startDate}{tournament.endDate && tournament.endDate !== tournament.startDate ? ` – ${tournament.endDate}` : ''} · {tournament.location}</div>
                      </div>
                      {!viewUserId && (
                        <button onClick={() => setReregEntry(entry)}
                          className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                          <RefreshCw size={12} className="shrink-0" /> Register again
                        </button>
                      )}
                    </div>

                    {/* Past events read as a record of what the club brought and
                        how it did. The old third column repeated last year's
                        invoice and payment lines, which is bookkeeping the club
                        has no use for a season later — current money lives on
                        Overview now (Bo, Sep 15 2026). */}
                    <div className="p-5 flex flex-col sm:flex-row gap-5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Teams brought ({teams.length})</p>
                        {teams.length === 0
                          ? <p className="text-sm text-gray-400">No teams recorded</p>
                          : (
                            <div className="space-y-1.5">
                              {teams.map((t, j) => (
                                <div key={j} className="flex items-center gap-2 min-w-0">
                                  {t.logoUrl && <img src={t.logoUrl} alt="" className="h-5 w-5 object-contain rounded flex-shrink-0" />}
                                  <span className="text-sm text-gray-700 truncate">{t.teamName}</span>
                                  <span className="text-xs text-gray-400 truncate">· {t.division}</span>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      <div className="sm:w-56 flex-shrink-0 border-t border-gray-100 pt-4 sm:border-t-0 sm:pt-0 sm:border-l sm:border-gray-100 sm:pl-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Record</p>
                        {hasRecord ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-gray-800">
                              {record.wins}–{record.losses}{record.ties > 0 ? `–${record.ties}` : ''}
                            </span>
                            <span className="text-xs text-gray-400">W–L{record.ties > 0 ? '–T' : ''}</span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No games recorded</p>
                        )}
                        {championshipWins.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {championshipWins.map((c, j) => (
                              <div key={j} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                                <Trophy size={12} className="shrink-0" /> {c}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )
      )}

      {/* All other tabs */}
      {tab !== 'history' && (
        dataLoading ? <div className="text-center py-12 text-gray-400">Loading…</div> : (
          <>
            {/* Overview — the whole club on one page.
                Mirrors the staff registration card Bo works from, minus what is
                staff-only: the internal merge notes, the Stripe payment refs, and
                every action button (payment, refund, merge, delete). A club
                director should be able to answer "what did we bring, who is
                coaching it, who still owes a waiver, and what do we owe" without
                changing tabs. */}
            {tab === 'overview' && (
              <div className="space-y-4">
                {data?.registrations.length === 0 && (
                  <div className="text-center py-12 text-gray-400">No registration on file for this event yet.</div>
                )}
                {data?.registrations.map(reg => {
                  const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
                  const due = reg.invoiceAmount - reg.discountAmount
                  const bal = due - paid
                  const rows = teamRows.filter(t => t.regId === reg.id)
                  const filed = rows.reduce((s, t) => s + t.players.length, 0)
                  const noneYet = rows.filter(t => t.players.length === 0).length
                  return (
                    <div key={reg.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

                      {/* Club + money */}
                      <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {reg.clubLogoUrl
                            ? <img src={reg.clubLogoUrl} alt="" className="h-11 w-11 rounded-lg object-contain bg-white border border-gray-200 flex-shrink-0" />
                            : <span className="h-11 w-11 rounded-lg bg-gray-100 border border-gray-200 text-gray-400 font-semibold flex items-center justify-center flex-shrink-0">{(reg.clubName || '?').charAt(0).toUpperCase()}</span>}
                          <div className="min-w-0">
                            <div className="font-bold text-gray-800 truncate">{reg.clubName}</div>
                            {reg.clubContact && <div className="text-sm text-gray-600 truncate">{reg.clubContact}</div>}
                            <div className="text-sm text-gray-500 truncate">{reg.contactEmail}{reg.contactPhone ? ` · ${reg.contactPhone}` : ''}</div>
                            <div className="text-xs text-gray-400 mt-0.5">Registered {shortDate(reg.createdAt)}</div>
                          </div>
                        </div>
                        {showMoney && (
                        <div className="flex items-center gap-5 text-sm flex-shrink-0 justify-between sm:justify-end border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Invoiced</div>
                            <div className="font-medium text-gray-700">{fmt(due)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Paid</div>
                            <div className="font-medium text-green-600">{fmt(paid)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Balance</div>
                            <div className={`font-semibold ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bal)}</div>
                          </div>
                        </div>
                        )}
                      </div>

                      {/* Registration facts */}
                      <div className="px-5 py-2.5 bg-gray-50 border-y border-gray-100 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                        {reg.clubBasedIn && <span className="text-gray-500">Based in: <span className="text-gray-700 font-medium">{reg.clubBasedIn}</span></span>}
                        <span className="text-gray-500">Hotel: <span className="text-gray-700 font-medium">{reg.needsHotel || 'No'}</span></span>
                        <span className="text-gray-500">Pay method: <span className="text-gray-700 font-medium">{payLabel(reg.paymentMethod)}</span></span>
                      </div>

                      {/* Teams — a real table on desktop, stacked rows on a phone,
                          from one set of markup so neither can drift. */}
                      <div className="hidden sm:grid grid-cols-12 gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <div className="col-span-3">Team</div>
                        <div className="col-span-3">Division</div>
                        <div className="col-span-1 text-center">Waivers</div>
                        <div className="col-span-2">Coach</div>
                        <div className="col-span-3">Contact</div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {rows.length === 0 && <div className="px-5 py-4 text-sm text-gray-400">No teams on this registration.</div>}
                        {rows.map(t => (
                          <div key={t.key} className="px-5 py-3 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-1 sm:items-center">
                            <div className="sm:col-span-3 flex items-center gap-2 min-w-0">
                              {t.logoUrl && <img src={t.logoUrl} alt="" className="h-5 w-5 object-contain rounded flex-shrink-0" />}
                              <span className="font-semibold text-gray-800 truncate">{t.teamName}</span>
                            </div>
                            <div className="sm:col-span-3 text-sm text-gray-600 truncate">{t.division}</div>
                            <div className="sm:col-span-1 sm:text-center">
                              <span className={`inline-flex items-center justify-center min-w-[1.75rem] text-xs font-semibold px-2 py-0.5 rounded-full ${t.players.length > 0 ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {t.players.length}
                              </span>
                              <span className="sm:hidden text-xs text-gray-400 ml-1.5">waiver{t.players.length === 1 ? '' : 's'} filed</span>
                            </div>
                            <div className="sm:col-span-2 text-sm text-gray-600 truncate">{t.coachName || '—'}</div>
                            {/* Phone over email rather than side by side: on one
                                line a club address breaks mid-word ("kpaglino@laxm
                                / aniax.com"). Truncated with the full value on
                                hover; the mailto still carries all of it. */}
                            <div className="sm:col-span-3 text-sm text-gray-500 min-w-0 leading-snug">
                              {t.coachPhone && <div><a href={`tel:${t.coachPhone}`} className="hover:text-violet-600">{t.coachPhone}</a></div>}
                              {t.coachEmail && <div className="truncate"><a href={`mailto:${t.coachEmail}`} title={t.coachEmail} className="hover:text-violet-600">{t.coachEmail}</a></div>}
                              {!t.coachPhone && !t.coachEmail && '—'}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Waiver standing — the same numbers the tournament staff see */}
                      <div className="px-5 py-3 border-t border-gray-100 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-gray-700"><span className="font-semibold">{filed}</span> waiver{filed === 1 ? '' : 's'} completed for {reg.clubName}</span>
                        {noneYet > 0 && <span className="text-amber-600">· {noneYet} team{noneYet === 1 ? '' : 's'} with none yet</span>}
                        {selTournament && (
                          <a href={`/tournaments/${selTournament}/player-waiver`} target="_blank" rel="noopener noreferrer"
                            className="ml-auto inline-flex items-center gap-1.5 text-violet-600 hover:text-violet-700 font-medium">
                            <ExternalLink size={13} className="shrink-0" /> Waiver form to send parents
                          </a>
                        )}
                      </div>

                      {/* Invoice & payments — folded in from the old Billing tab,
                          so the money sits with the teams it paid for. */}
                      {showMoney && (
                      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 className="font-semibold text-gray-800">Invoice &amp; payments</h3>
                          {bal <= 0 && due > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                              <Check size={12} className="shrink-0" /> Paid in full
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm mb-3">
                          <span className="text-gray-500">Invoice: <span className="font-medium text-gray-800">{fmt(reg.invoiceAmount)}</span></span>
                          {reg.discountAmount > 0 && (
                            <span className="text-gray-500">Discount: <span className="font-medium text-amber-600">-{fmt(reg.discountAmount)}</span>{reg.discountNote ? <span className="text-gray-400"> ({reg.discountNote})</span> : null}</span>
                          )}
                          <span className="text-gray-500">Paid: <span className="font-medium text-green-600">{fmt(paid)}</span></span>
                          <span className="text-gray-500">Balance: <span className={`font-semibold ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bal)}</span></span>
                        </div>
                        {reg.payments.length === 0
                          ? <p className="text-sm text-gray-400">No payments recorded yet.</p>
                          : (
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="hidden sm:grid grid-cols-12 gap-x-4 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                <div className="col-span-5">Date</div>
                                <div className="col-span-4">Method</div>
                                <div className="col-span-3 text-right">Amount</div>
                              </div>
                              <div className="divide-y divide-gray-100">
                                {reg.payments.map((p, i) => (
                                  <div key={i} className="px-4 py-2 grid grid-cols-2 sm:grid-cols-12 gap-x-4 text-sm">
                                    <div className="sm:col-span-5 text-gray-700">{shortDate(p.receivedAt)}</div>
                                    <div className="sm:col-span-4 text-gray-500 order-last sm:order-none col-span-2 sm:col-auto">{payLabel(p.method)}</div>
                                    <div className="sm:col-span-3 text-right font-medium text-green-600">{fmt(p.amount)}</div>
                                  </div>
                                ))}
                                <div className="px-4 py-2 grid grid-cols-2 sm:grid-cols-12 gap-x-4 text-sm bg-gray-50">
                                  <div className="sm:col-span-9 font-semibold text-gray-700">Balance due</div>
                                  <div className={`sm:col-span-3 text-right font-bold ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bal)}</div>
                                </div>
                              </div>
                            </div>
                          )}
                      </div>
                      )}
                    </div>
                  )
                })}

                {/* A waiver whose team name matches nothing on the registration
                    still counts in the club's total, so say so rather than let
                    the tile read 5 while the rows add to 4. This is real: one
                    Monster Mash waiver is filed under a club spelling that does
                    not match any registered team. */}
                {unassignedWaivers.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      {unassignedWaivers.length} waiver{unassignedWaivers.length === 1 ? '' : 's'} could not be matched to one of your teams
                      {' '}({unassignedWaivers.slice(0, 3).map(w => w.playerName).filter(Boolean).join(', ')}
                      {unassignedWaivers.length > 3 ? ', …' : ''}). They still count toward your club total — ask the tournament staff to correct the team on them.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Player waivers — cards or list.
                Grouped by team either way, because a club director chases
                waivers one team at a time ("who on Middle School Select still
                owes me one"), not by scrolling the whole club alphabetically.
                Counts match what staff see on the registrations page: both read
                the same submissions. */}
            {tab === 'players' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-500">
                    {waivers.length} waiver{waivers.length === 1 ? '' : 's'} filed across your {teamRows.length} team{teamRows.length === 1 ? '' : 's'}.
                    {teamRows.some(t => t.players.length === 0) && ' Tap a team to see who has filed.'}
                  </p>
                  {/* Cards to recognize a face, list to chase a parent. */}
                  <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white shrink-0">
                    {([['cards', 'Cards', LayoutGrid], ['list', 'List', List]] as const).map(([k, label, Ico]) => (
                      <button key={k} onClick={() => setPlayerView(k)} aria-pressed={playerView === k}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${playerView === k ? 'bg-violet-50 text-violet-700' : 'text-gray-500 hover:text-gray-700'} ${k === 'list' ? 'border-l border-gray-300' : ''}`}>
                        <Ico size={14} className="shrink-0" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {teamRows.map(row => {
                  const open = openTeam === row.key
                  return (
                    <div key={row.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <button onClick={() => { setOpenTeam(open ? null : row.key); setOpenPlayer(null) }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                        <span className="min-w-0">
                          <span className="font-semibold text-gray-800">{row.teamName}</span>
                          {row.division && <span className="text-gray-400 text-sm"> · {row.division}</span>}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.players.length ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {row.players.length} waiver{row.players.length === 1 ? '' : 's'}
                          </span>
                          {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                        </span>
                      </button>

                      {open && (
                        row.players.length === 0 ? (
                          <p className="px-4 pb-4 text-sm text-gray-400">
                            Nobody on this team has filed a waiver yet. Every player needs one before they step on a field.
                          </p>
                        ) : playerView === 'cards' ? (
                          <div className="border-t border-gray-100">
                            <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))' }}>
                              {row.players.map(w => {
                                const sel = openPlayer === w.id
                                return (
                                  <button key={w.id} type="button" onClick={() => setOpenPlayer(sel ? null : w.id)}
                                    className={`text-left border rounded-xl overflow-hidden transition-colors ${sel ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200 hover:border-violet-300'}`}>
                                    {/* Deliberately NOT the full keepsake card: no QR
                                        codes, no player id, no presented-by footer.
                                        A coach is checking a face against a name. */}
                                    <div className="bg-gray-900 px-2.5 py-1.5 flex items-center gap-1.5">
                                      {row.clubLogoUrl
                                        ? <img src={row.clubLogoUrl} alt="" className="h-5 w-5 rounded bg-white object-contain shrink-0" />
                                        : <span className="h-5 w-5 rounded bg-white text-gray-900 text-[8px] font-extrabold grid place-items-center shrink-0">{initials(row.teamName)}</span>}
                                      <span className="text-[10px] font-semibold text-gray-200 truncate">{row.teamName}</span>
                                    </div>
                                    <div className="flex gap-2.5 p-2.5">
                                      <span className={`h-[60px] w-[52px] rounded-lg grid place-items-center shrink-0 overflow-hidden text-white font-extrabold text-[17px] ${avatarTone(w.playerName)}`}>
                                        {w.photoUrl ? <img src={w.photoUrl} alt="" className="h-full w-full object-cover" /> : initials(w.playerName)}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block font-bold text-[13.5px] leading-tight text-gray-800 line-clamp-2 [overflow-wrap:anywhere]">{w.playerName || 'Player'}</span>
                                        {w.position && <span className="block text-[9.5px] font-bold uppercase tracking-widest text-teal-600 mt-0.5">{w.position}</span>}
                                        {w.jersey ? <span className="block text-[19px] font-extrabold text-gray-800 leading-none mt-1.5"><span className="text-[11px] text-gray-400">#</span>{w.jersey}</span> : null}
                                      </span>
                                    </div>
                                    <div className="border-t border-gray-100 bg-gray-50 px-2.5 py-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-teal-700">
                                      <Check size={12} className="shrink-0" /> Waiver on file
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                            {(() => {
                              const w = row.players.find(p => p.id === openPlayer)
                              if (!w) return null
                              return (
                                <div className="mx-4 mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                                    <span className="font-semibold text-gray-800">{w.playerName || 'Player'}</span>
                                    {w.jersey ? <span className="text-xs font-semibold text-gray-500">#{w.jersey}</span> : null}
                                    {w.position && <span className="text-xs font-semibold text-gray-500">· {w.position}</span>}
                                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                                      <Check size={12} className="shrink-0" /> Filed {fileDate(w.submittedAt)}
                                    </span>
                                  </div>
                                  <dl className="grid gap-x-5 gap-y-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))' }}>
                                    {([
                                      ['Team', `${row.teamName}${row.division ? ` · ${row.division}` : ''}`],
                                      ['Grade', w.grade],
                                      ['Parent', w.parentName],
                                      ['Parent phone', w.parentPhone],
                                      ['Parent email', w.parentEmail],
                                    ] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
                                      <div key={k} className="min-w-0">
                                        <dt className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
                                        <dd className="text-[13.5px] font-semibold text-gray-800 break-words mt-0.5">
                                          {k === 'Parent phone' ? <a href={`tel:${v}`} className="hover:text-violet-600">{v}</a>
                                            : k === 'Parent email' ? <a href={`mailto:${v}`} className="hover:text-violet-600">{v}</a>
                                            : v}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="border-t border-gray-100 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  {['Player', 'Grade', 'Jersey', 'Parent', 'Filed'].map(h => (
                                    <th key={h} className="text-left px-4 py-2 text-gray-500 font-semibold text-xs">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {row.players.map(w => (
                                  <tr key={w.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-800">{w.playerName || '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.grade || '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.jersey ? `#${w.jersey}` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.parentName || '—'}</td>
                                    <td className="px-4 py-2 text-gray-400 text-xs">{fileDate(w.submittedAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  )
                })}

                {unassignedWaivers.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">
                      {unassignedWaivers.length} waiver{unassignedWaivers.length === 1 ? '' : 's'} not matched to a team
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      {unassignedWaivers.map(w => w.playerName).filter(Boolean).join(', ')}
                      {' '}\u2014 filed under a team name that doesn\u2019t match your registration. They still count; ask the organizer to re-tag them.
                    </p>
                  </div>
                )}

                {teamRows.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center text-gray-400">No teams registered yet</div>
                )}
              </div>
            )}

            {/* Schedule */}
            {tab === 'schedule' && (
              <div className="space-y-2">
                {data?.games.length === 0 && <div className="text-center py-12 text-gray-400">No games scheduled yet.</div>}
                {data?.games.map(g => {
                  const myTeam = data.teamNames.includes(g.team1) ? g.team1 : g.team2
                  const opponent = myTeam === g.team1 ? g.team2 : g.team1
                  const myScore = myTeam === g.team1 ? g.score1 : g.score2
                  const oppScore = myTeam === g.team1 ? g.score2 : g.score1
                  const hasScore = myScore !== null && oppScore !== null
                  const won = hasScore && myScore! > oppScore!
                  const lost = hasScore && myScore! < oppScore!
                  // Find team logos
                  const myTeamData = data.registrations.flatMap(r => r.teams).find(t => t.teamName === myTeam)
                  return (
                    <div key={g.id} className={`bg-white border rounded-xl px-5 py-3 flex items-center gap-4 ${g.isChampionship ? 'border-amber-300 bg-amber-50' : won ? 'border-green-200' : lost ? 'border-red-200' : 'border-gray-200'}`}>
                      <div className="w-14 text-center flex-shrink-0">
                        <div className="text-xs text-gray-400">{g.date}</div>
                        <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
                        {g.isChampionship && <div className="text-xs text-amber-600 font-bold flex items-center justify-center gap-1"><Trophy size={11} className="shrink-0" /> Final</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 flex items-center gap-1.5">
                          {myTeamData?.logoUrl && <img src={myTeamData.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />}
                          <span className="text-violet-700 font-semibold">{myTeam}</span>
                          <span className="text-gray-400 mx-1">vs</span>
                          {opponent}
                        </div>
                        <div className="text-xs text-gray-400">{g.division} · {g.location} · Game #{g.gameNumber}</div>
                      </div>
                      {hasScore ? (
                        <div className={`text-lg font-bold ${won ? 'text-green-600' : lost ? 'text-red-600' : 'text-gray-600'}`}>
                          {myScore} – {oppScore}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Upcoming</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </>
        )
      )}
    </div>
  )
}
