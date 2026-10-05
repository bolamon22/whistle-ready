'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BedDouble, CalendarDays, Check, ChevronDown, ChevronUp, ClipboardList, Clock, Copy, CreditCard, ExternalLink, Eye, Globe, ImagePlus, LayoutGrid, List, Mail, Phone, Plus, RefreshCw, ShieldCheck, Trophy, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { compressImageFile } from '@/lib/imageCompress'
import {
  RequestChangeDialog, AddTeamDialog, RegisterAgainDialog, ConfirmTeamsDialog, AccountNote, StatusBar, OtherEventsCard, PortalPools, dayLabel, eventDates, poolLabel,
  DirectorsLine, AddDirectorDialog, SharedNameNote,
  type PortalEvent, type ConfirmState, type RequestKind, type LeftItem, type AgainSource, type PortalPool, type PortalDirector, type PortalInvite,
} from './PortalActions'
import { nameKey } from '@/lib/names'
import FamilyMessages from '@/components/FamilyMessages'
import type { FamilyMessage } from '@/lib/familyMessages'

interface Tournament { id: string; name: string; startDate: string; endDate?: string; logoUrl: string }
interface Waiver {
  id: string; playerName: string; team: string; club: string
  jersey: string | number | null; grade: string; parentName: string
  position: string; photoUrl: string; dob: string; parentPhone: string; parentEmail: string
  signed: boolean; submittedAt: string
}
interface CoachWaiver {
  id: string; name: string; club: string; team: string; role: string; division: string
  email: string; phone: string; signed: boolean; submittedAt: string
}
interface Registration {
  id: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; needsHotel: string; paymentMethod: string; clubLogoUrl: string
  invoiceAmount: number; discountAmount: number; discountNote: string; createdAt: string
  teams: {
    id: string; teamName: string; division: string; logoUrl?: string
    coachName: string; coachPhone: string; coachEmail: string; waitlisted?: boolean
  }[]
  payments: { amount: number; method: string; receivedAt: string }[]
  /** Where this registration stands with the office (lib/changeRequest). */
  confirm?: ConfirmState
  /** A bank transfer they sent that is still clearing (lib/pendingTransfers). */
  clearing?: { amount: number; startedAt: string } | null
  /** Who can open it in the portal, and open invites (lib/clubAccess, lib/clubInvites). */
  directors?: PortalDirector[]
  invites?: PortalInvite[]
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
    contactPhone: string; clubBasedIn: string; paymentMethod: string
    numTeams: number; needsHotel: string; teams: { id: string; teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string }[]
  }[]
  record: { wins: number; losses: number; ties: number; gamesPlayed: number }
  championshipWins: string[]
  finance: { invoiceTotal: number; paidTotal: number; balance: number; payments: { amount: number; method: string; receivedAt: string; clubName: string }[] }
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The viewer's own date as YYYY-MM-DD, comparable against the stored strings. */
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "19 days to go" beside the event name. Both ends are bare dates turned into day
// numbers, so the count is calendar days in the viewer's own zone and a daylight
// saving change can't make it 18.96. Nothing once the event is over.
const dayNum = (d?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN
}
const countdownLabel = (start?: string, end?: string) => {
  const s = dayNum(start), t = dayNum(todayLocal())
  if (isNaN(s) || isNaN(t)) return ''
  const e = isNaN(dayNum(end)) ? s : Math.max(s, dayNum(end))
  if (s - t > 1) return `${s - t} days to go`
  if (s - t === 1) return 'Tomorrow'
  return t <= e ? 'Game day' : ''
}

// WHICH EVENT THE PORTAL OPENS ON.
//
// The links route returns tournaments startDate DESC, and the picker took the first
// one -- so a director linked to Monster Mash (Oct 24) and the Fall Classic (Nov 7)
// landed on the Fall Classic in September and saw the wrong teams, waivers and
// balance. One of them emailed about it (Bo, Sep 24 2026).
//
// The event someone opens this portal for is the one they are about to play. So:
// the soonest event that has not finished yet, counting an event as current through
// its END date -- otherwise the portal would jump to the next one on the Sunday
// morning of a two-day weekend, which is the worst possible moment for it. If every
// linked event is over, the most recent one.
function nextUpTournament(list: Tournament[]): Tournament | undefined {
  if (!list.length) return undefined
  const today = todayLocal()
  const upcoming = list
    .filter(t => (t.endDate || t.startDate || '') >= today)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  if (upcoming.length) return upcoming[0]
  return [...list].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0]
}

// Two shapes reach this. A payment's receivedAt is a real timestamp and new Date()
// is right for it. A tournament's startDate is a naive string an organizer typed --
// "2026-10-24", no zone -- and new Date() reads THAT as UTC midnight, which prints
// as Oct 23 everywhere in the US. So a bare date is split and rebuilt in local time
// and stays the day that was typed; anything with a time on it is left alone.
const shortDate = (d: string) => {
  if (!d) return '—'
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d))
  const dt = bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// The stored value is a slug ('check', 'card'); clubs read the label.
const PAY_LABEL: Record<string, string> = {
  check: 'Check', card: 'Credit card', credit_card: 'Credit card', stripe: 'Credit card',
  ach: 'Bank transfer (ACH)', cash: 'Cash', paypal: 'PayPal', venmo: 'Venmo', invoice: 'Invoice',
  // 'zelle' is on the public registration form and was missing here, so every
  // Zelle club fell through to the bare capitalize fallback.
  zelle: 'Zelle',
}

// What a director may switch to, matching the public registration form and the
// whitelist in api/club-director/pay-method. Order puts the no-fee option first,
// the way the pay page does.
const PAY_CHOICES: { value: string; label: string }[] = [
  { value: 'ach',         label: 'Bank transfer (ACH) — no fee' },
  { value: 'credit_card', label: 'Credit card — 3% fee' },
  { value: 'paypal',      label: 'PayPal / Venmo — 3% fee' },
  { value: 'zelle',       label: 'Zelle — no fee' },
  { value: 'check',       label: 'Check' },
]
/** Methods that are actually settled on the pay page rather than by post or app. */
const PAY_ONLINE = new Set(['ach', 'credit_card', 'paypal'])
const payLabel = (m: string) => PAY_LABEL[String(m || '').toLowerCase()] || (m ? m[0].toUpperCase() + m.slice(1) : '—')

const initials = (n: string) =>
  String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'

const fileDate = (d: string) => { try { return new Date(d).toLocaleDateString() } catch { return '' } }

// The waiver form stores dob as YYYY-MM-DD. Parsed as a Date that reads as UTC
// midnight and renders a day early west of Greenwich, so read the parts directly.
const dobDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''))
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`
  try { return d ? new Date(d).toLocaleDateString() : '' } catch { return '' }
}

// A player card needs a block of color behind the initials when there is no
// photo. Hashed off the name so the same player keeps the same one, rather than
// re-rolling on every render.
const TONES = ['bg-rose-600', 'bg-violet-600', 'bg-teal-600', 'bg-indigo-600', 'bg-amber-600', 'bg-sky-600']
const avatarTone = (n: string) => {
  let h = 0
  for (const ch of String(n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export default function ClubDirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selTournament, setSelTournament] = useState('')
  const [data, setData] = useState<{ clubs: string[]; sharedClubs?: string[]; registrations: Registration[]; playerRegs: PlayerReg[]; games: Game[]; pools?: PortalPool[]; teamNames: string[]; waivers?: Waiver[]; coachWaivers?: CoachWaiver[]; lock?: { locked: boolean; at: string; why: string }; payTo?: { zelleHandle: string; checkPayableTo: string; checkAddress: string } | null; event?: PortalEvent | null } | null>(null)
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [playerView, setPlayerView] = useState<'cards' | 'list'>('cards')
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)
  const [linkClubs, setLinkClubs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'players' | 'coaches' | 'schedule' | 'history'>('overview')
  // The same ready-written messages the checklist email links to, so a director
  // already in the portal doesn't have to go back to an email to find them
  // (Bo, Oct 4 2026). One source: /api/registrations/[id]/share.
  const [familyMsgs, setFamilyMsgs] = useState<FamilyMessage[]>([])
  const [noLinks, setNoLinks] = useState(false)
  const [perms, setPerms] = useState<Record<string, boolean>>({ cd_overview: true, cd_players: true, cd_schedule: true, cd_billing: true })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Staff (admin/director) can open a club director's own portal with ?userId=,
  // so a report like "my Overview shows no teams" is seen rather than guessed
  // (Bo, Sep 15 2026). Read from location instead of useSearchParams so the page
  // needs no Suspense boundary. Empty for a director viewing their own portal.
  const [viewUserId, setViewUserId] = useState('')
  const [viewingUser, setViewingUser] = useState<{ name: string; email: string } | null>(null)
  // Which player row is mid-move. Declared up here with the other hooks and NOT beside
  // moveWaiver further down: everything below this block sits after two early returns
  // (loading, and the not-linked-to-a-club screen), so a hook there runs on some renders
  // and not others. That is React error #310 -- "rendered more hooks than during the
  // previous render" -- and it took the whole club-director portal to a blank error page
  // the moment the page finished loading.
  const [moving, setMoving] = useState('')
  // Which team's coach is being reassigned, and the form behind it. Same reason as
  // `moving` for living up here: below the early returns these would be conditional hooks.
  const [coachEdit, setCoachEdit] = useState('')
  const [coachSaving, setCoachSaving] = useState(false)
  // HOOKS GO HERE, NOT BESIDE THE FUNCTION THAT USES THEM. This one was first
  // declared down next to savePayMethod, which is below `if (loading) return` and
  // `if (noLinks) return`. So the first render bailed out before reaching it and
  // the second did not, React counted a different number of hooks between the two,
  // and the whole portal died on "Minified React error #310" -- a blank page with
  // a client-side exception, for staff and directors alike (Sep 28 2026).
  const [payMethodSaving, setPayMethodSaving] = useState('')
  const [logoSaving, setLogoSaving] = useState('')
  const [coachForm, setCoachForm] = useState({ coachName: '', coachEmail: '', coachPhone: '' })
  // The portal's own dialogs (./PortalActions): a change request for one team,
  // adding a team, and registering for another event. Up here with the other
  // hooks for the same #310 reason as above.
  const [requestFor, setRequestFor] = useState<null | { regId: string; teamId: string; kind: RequestKind }>(null)
  const [addFor, setAddFor] = useState('')
  const [againFor, setAgainFor] = useState<null | { tournamentId: string; eventName: string; reg: AgainSource; eventId?: string }>(null)
  const [confirmFor, setConfirmFor] = useState('')
  const [directorFor, setDirectorFor] = useState('')

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
      const mine = list.filter(x => linkedIds.includes(x.id))
      const first = nextUpTournament(mine.length ? mine : list)
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
    // Best-effort: the portal is perfectly usable without the drafts, so a
    // failure here just leaves those blocks out rather than erroring the page.
    const regId = d?.registrations?.[0]?.id
    setFamilyMsgs([])
    if (regId) {
      try {
        const fm = await fetch(`/api/registrations/${regId}/share`).then(r => (r.ok ? r.json() : null))
        if (Array.isArray(fm?.messages)) setFamilyMsgs(fm.messages)
      } catch { /* no drafts this load */ }
    }
  }

  const loadHistory = async () => {
    if (history.length > 0) return
    setHistoryLoading(true)
    const res = await fetch(`/api/club-director/history${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`)
    const h = await res.json()
    setHistory(Array.isArray(h) ? h : [])
    setHistoryLoading(false)
  }

  // One message, at the foot of the tab that is already about that thing:
  // below the information, never above it (Bo, Oct 5 2026).
  const draftsFor = (key: 'waivers' | 'coaches' | 'hotel', heading: string) => {
    const picked = familyMsgs.filter(m => m.key === key)
    if (!picked.length) return null
    return (
      <div className="pt-3">
        <p className="text-[11px] font-bold tracking-wide text-slate-400 mb-2">{heading}</p>
        <FamilyMessages messages={picked} />
      </div>
    )
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

  const selTournamentRow = tournaments.find(t => t.id === selTournament)
  const selTournamentName = selTournamentRow?.name || ''
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
      waitlisted: !!t.waitlisted,
      players: waivers.filter(w => normName(w.team) === normName(t.teamName)),
    }))
  )
  const claimed = new Set(teamRows.flatMap(r => r.players.map(p => p.id)))
  const unassignedWaivers = waivers.filter(w => !claimed.has(w.id))

  // COACH WAIVERS, answered the way the question is actually asked: not "who signed"
  // but "which of my coaches still hasn't". So the list is driven by the coaches named
  // on the club's own registrations, with a signed waiver matched onto each one, rather
  // than by the pile of submissions.
  //
  // Email first -- it is the one identifier a coach types the same way twice. Name is
  // the fallback, because plenty of registrations carry a coach with no email at all.
  const coachWaivers: CoachWaiver[] = data?.coachWaivers ?? []
  const normEmail = (x: unknown) => String(x ?? '').trim().toLowerCase()
  const coachRows = teamRows.map(t => {
    const byEmail = t.coachEmail ? coachWaivers.find(c => normEmail(c.email) === normEmail(t.coachEmail)) : undefined
    const match = byEmail || (t.coachName ? coachWaivers.find(c => normName(c.name) === normName(t.coachName)) : undefined)
    return { key: t.key, teamId: t.key, teamName: t.teamName, division: t.division, coachName: t.coachName, coachEmail: t.coachEmail, coachPhone: t.coachPhone, waiver: match }
  })
  const matchedCoachIds = new Set(coachRows.map(r => r.waiver?.id).filter(Boolean) as string[])
  // Signed, but not matching any coach named on a registration -- an assistant, or a
  // head coach who changed since the club registered. Shown rather than hidden.
  const extraCoachWaivers = coachWaivers.filter(c => !matchedCoachIds.has(c.id))
  const coachesSigned = coachRows.filter(r => r.waiver).length

  // NAMING THE REAL COACH OF A TEAM.
  //
  // Directors register five teams in one sitting and put themselves on all five to
  // get through it, then the actual coaches file waivers that match nothing (Bo,
  // Sep 24 2026). Fixing it was an email to the organizer. Now it is a dropdown:
  // pick one of the coaches who already signed, or type someone who hasn't yet.
  // The match above is by email then name, so the row re-matches on the next load.
  const coachChoices = [...extraCoachWaivers, ...coachWaivers.filter(c => matchedCoachIds.has(c.id))]

  async function saveCoach(teamId: string, next: { coachName: string; coachEmail: string; coachPhone: string }) {
    if (!teamId || !selTournament || !next.coachName.trim()) return
    setCoachSaving(true)
    try {
      const res = await fetch(`/api/club-director/coach${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selTournament, teamId, ...next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not update that coach'); return }
      setCoachEdit('')
      await loadData(selTournament)
      toast.success(`${next.coachName} is now the coach of ${j?.teamName || 'that team'}`)
    } catch { toast.error('Could not update that coach') } finally { setCoachSaving(false) }
  }

  // Switching how this club intends to pay. What they picked during registration
  // was picked to get past the form, not decided -- and by the time they come back
  // to settle the invoice the treasurer has often changed their mind. Leaving it
  // frozen meant the staff page kept promising Bo a Zelle nobody was sending.
  // (payMethodSaving is declared with the other state at the top of the component,
  //  ABOVE the loading/noLinks early returns -- see the note there.)
  async function savePayMethod(registrationId: string, paymentMethod: string) {
    if (!registrationId || !selTournament || !paymentMethod) return
    setPayMethodSaving(registrationId)
    try {
      const res = await fetch(`/api/club-director/pay-method${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selTournament, registrationId, paymentMethod }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not change the payment method'); return }
      await loadData(selTournament)
      toast.success(PAY_ONLINE.has(paymentMethod)
        ? `Set to ${payLabel(paymentMethod)} — use the Pay button when you're ready`
        : `Set to ${payLabel(paymentMethod)} — we'll mark the invoice paid when it arrives`)
    } catch { toast.error('Could not change the payment method') } finally { setPayMethodSaving('') }
  }

  // The person holding the card is often not the person logged in -- a director
  // forwards it to their treasurer, and Bo texts it to a club that called him.
  // Built in the handler rather than at render time so it never touches window
  // during the server render.
  async function copyPayLink(registrationId: string) {
    const url = `${window.location.origin}/pay/${registrationId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Payment link copied')
    } catch {
      // Clipboard is blocked in some embedded and non-secure contexts; showing the
      // URL still lets someone copy it by hand rather than hitting a dead button.
      toast(url, { duration: 8000 })
    }
  }

  // The club's own crest. Before this the only route was emailing the file to Bo:
  // the portal drew a grey letter tile and offered nothing to click.
  async function saveClubLogo(registrationId: string, file: File | null) {
    if (!registrationId || !selTournament) return
    setLogoSaving(registrationId)
    try {
      // Compressed in the browser, because the data URL is stored in the row itself
      // -- an uncompressed phone photo would be several megabytes of database.
      const logoUrl = file ? await compressImageFile(file) : ''
      const res = await fetch(`/api/club-director/logo${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selTournament, registrationId, logoUrl, applyToTeams: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not save that logo'); return }
      await loadData(selTournament)
      if (!file) toast.success('Logo removed')
      else toast.success(j?.applied > 0
        ? `Logo saved and added to ${j.applied} team${j.applied === 1 ? '' : 's'}`
        : 'Logo saved')
    } catch (e: any) {
      toast.error(e?.message || 'Could not read that image')
    } finally { setLogoSaving('') }
  }

  function openCoachEdit(r: { teamId: string; coachName: string; coachEmail: string; coachPhone: string }) {
    setCoachForm({ coachName: r.coachName || '', coachEmail: r.coachEmail || '', coachPhone: r.coachPhone || '' })
    setCoachEdit(r.teamId)
  }

  // MOVING A PLAYER ONTO ONE OF MY OWN TEAMS.
  //
  // The panel used to end at "ask the organizer to re-tag them", which put a ten-second
  // fix on the organizer's desk on the week of an event. A director knows which team the
  // kid plays for; they just had no way to say so (Bo, Sep 18 2026).
  //
  // The server decides what is allowed -- see api/club-director/roster. This only asks.
  // A player not on any of my teams can be placed at any time, including mid-event,
  // because late registrations are normal and somebody mistyping a team on Saturday
  // morning should not need staff. A player already on one of my teams can only be moved
  // until the event's first game; after that the server says no and so does this.
  const lock = data?.lock
  const myTeamNames: string[] = (data?.registrations || []).flatMap(r => r.teams.map(t => t.teamName)).filter(Boolean)
  async function moveWaiver(waiverId: string, teamName: string, wasPlaced: boolean) {
    if (!teamName || !selTournament) return
    if (wasPlaced && lock?.locked) { alert(lock.why); return }
    setMoving(waiverId)
    try {
      const res = await fetch(`/api/club-director/roster${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selTournament, waiverId, teamName }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j?.error || 'Could not move that player'); return }
      await loadData(selTournament)
    } catch { alert('Could not move that player') } finally { setMoving('') }
  }

  /** The dropdown itself. `placed` is false for a waiver on none of my teams. */
  function TeamPicker({ w, placed }: { w: Waiver; placed: boolean }) {
    const frozen = placed && !!lock?.locked
    return (
      <select
        value=""
        disabled={frozen || moving === w.id}
        title={frozen ? lock?.why : undefined}
        onChange={e => { const v = e.target.value; e.currentTarget.value = ''; moveWaiver(w.id, v, placed) }}
        className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
      >
        <option value="">{moving === w.id ? 'Moving…' : frozen ? 'Rosters locked' : placed ? 'Move to…' : 'Put on a team…'}</option>
        {myTeamNames.filter(t => t !== w.team).map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    )
  }
  const totalPlayers = waivers.length || (data?.playerRegs.length ?? 0)
  const totalTeams = data?.registrations.reduce((s, r) => s + r.teams.length, 0) ?? 0
  const totalInvoiced = data?.registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0) ?? 0
  const totalPaid = data?.registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0) ?? 0
  // A bank transfer they already sent counts as paid here, marked as clearing
  // (lib/pendingTransfers). Showing the full balance while it settled is how
  // Calusa was left looking unpaid, one click away from paying twice (Oct 2 2026).
  const totalClearing = data?.registrations.reduce((s, r) => s + (r.clearing?.amount || 0), 0) ?? 0
  const balance = totalInvoiced - totalPaid - totalClearing
  // The single registration carrying the balance, when there is only one -- which
  // is the ordinary case, one club registering once for one event. That lets the
  // Balance due tile itself become the way in to paying, so a director who never
  // scrolls past the tiles still finds it. With two or more open balances there is
  // no single right destination, so the per-registration buttons below carry it.
  const unpaidRegs = data?.registrations.filter(r => (r.invoiceAmount - r.discountAmount) - r.payments.reduce((p, x) => p + x.amount, 0) - (r.clearing?.amount || 0) > 0) ?? []
  const soloUnpaidId = unpaidRegs.length === 1 ? unpaidRegs[0].id : ''

  // Billing is gone as a tab — the invoice now sits under the teams it paid for,
  // on Overview. Schedule only appears once there is one: an empty tab during
  // the weeks before the draw just reads as broken (Bo, Sep 15 2026).
  const hasSchedule = (data?.games?.length ?? 0) > 0
  // Pools come before the schedule: once Teams & pools is public the tab shows
  // the club's pools, and its games join them with Schedule & brackets (Bo, Oct
  // 4 2026). Both follow the public switches; see api/club-director/data.
  const portalPools = data?.pools ?? []
  const hasPools = portalPools.length > 0
  const poolOf = (division: string, team: string) => {
    const p = portalPools.find(x => nameKey(x.division) === nameKey(division) && x.teams.some(n => nameKey(n) === nameKey(team)))
    return p ? poolLabel(p.name) : ''
  }
  // cd_billing used to decide whether the Billing TAB appeared. With the invoice
  // folded into Overview it has to gate the money itself, or removing the tab
  // would quietly grant billing visibility to clubs that had it switched off.
  const showMoney = perms.cd_billing !== false
  const TABS: { key: typeof tab; label: string; Icon: typeof Users; perm?: string; when?: boolean }[] = [
    { key: 'overview',  label: 'Overview',           Icon: ClipboardList, perm: 'cd_overview' },
    { key: 'players',   label: 'Player waivers',     Icon: Users,         perm: 'cd_players'  },
    { key: 'coaches',   label: 'Coach waivers',      Icon: ShieldCheck,   perm: 'cd_players'  },
    { key: 'schedule',  label: hasSchedule ? 'Schedule' : 'Pools', Icon: hasSchedule ? CalendarDays : LayoutGrid, perm: 'cd_schedule', when: hasSchedule || hasPools },
    { key: 'history',   label: 'History',            Icon: Trophy                             },
  ]

  // CONFIRMING THE TEAM LIST from the portal (Bo, Oct 4 2026): the club ticks
  // the box on What's left, checks its teams in ConfirmTeamsDialog and confirms.
  // Same Teams confirmed status as the confirm-your-teams email; the portal's
  // route also notes who confirmed and the list they saw.

  // After registering for another event: pick up the new event in the picker
  // (the register-again route links it) and open it.
  async function openNewEvent(nextId: string) {
    try {
      const linkRes = await fetch(`/api/club-director/links${viewUserId ? `?userId=${encodeURIComponent(viewUserId)}` : ''}`).then(r => r.json())
      const linked: Tournament[] = Array.isArray(linkRes) ? [] : (linkRes?.tournaments ?? [])
      if (linked.length) setTournaments(linked)
    } catch { /* keep the list we have */ }
    setAgainFor(null)
    setHistory([])      // History rebuilds with the new event next time it opens
    setTab('overview')
    setSelTournament(nextId)
    loadData(nextId)
  }

  // Changing teams is for the club itself, at an event that isn't over. Staff
  // viewing the portal get the same buttons, and every form opens, so they see
  // exactly what the club sees. Hidden, the buttons read as missing (Bo, Oct 3
  // 2026); greyed out, they still raised "why can't they click register teams
  // here?" (Oct 4). Only each form's last step is off in staff view (the
  // dialogs' staffView, and the routes refuse it too); staff make real changes
  // on the registrations page.
  const portalEvent = data?.event ?? null
  const showChange = !!portalEvent && !portalEvent.ended
  const staffView = !!viewUserId

  // WHAT'S LEFT. The questions a director logs in to answer, in the order they
  // matter: is my team list right, do I owe anything, have my players and
  // coaches signed. All from data this page already has.
  const regs = data?.registrations ?? []

  // Take back an invite that hasn't been used (a typo, or the wrong person).
  const cancelInvite = async (registrationId: string, email: string) => {
    if (staffView) return
    const res = await fetch('/api/club-director/directors', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: selTournament, registrationId, email }),
    }).catch(() => null)
    if (res?.ok) { toast.success(`Invite to ${email} taken back`); loadData(selTournament) }
    else toast.error('Could not take that invite back. Try again.')
  }
  // The money step, built once: it is also the one step left after an event is
  // over, when a director with an unpaid invoice still needs the way to pay.
  const payItem: LeftItem | null = !(showMoney && totalInvoiced > 0) ? null : balance > 0
    ? { key: 'pay', title: 'Balance due', detail: `${fmt(balance)} · bank transfer has no fee, card runs 3%`, done: false,
        action: soloUnpaidId ? { label: `Pay ${fmt(balance)}`, href: `/pay/${soloUnpaidId}`, primary: true } : undefined }
    : totalClearing > 0
      ? { key: 'pay', title: 'Paid · bank transfer clearing', detail: `${fmt(totalClearing)} on its way · nothing more to pay`, done: true }
      : { key: 'pay', title: 'Paid in full', detail: `${fmt(totalPaid)} received`, done: true }
  const leftItems: LeftItem[] = []
  if (regs.length && portalEvent?.ended) {
    if (payItem && !payItem.done) leftItems.push(payItem)
  } else if (regs.length) {
    const requested = regs.some(r => r.confirm?.status === 'change_requested')
    const toConfirm = regs.find(r => r.confirm?.status !== 'confirmed' && r.confirm?.status !== 'change_requested')
    const lastConfirmed = regs.map(r => r.confirm?.status === 'confirmed' ? r.confirm.at : '').sort().pop() || ''
    leftItems.push(regs.every(r => r.confirm?.status === 'confirmed')
      ? { key: 'confirm', title: 'Teams confirmed', detail: lastConfirmed ? `Confirmed ${shortDate(lastConfirmed)}` : 'Your team list is confirmed', done: true }
      : requested && !toConfirm
        ? { key: 'confirm', title: 'Confirm your team list', detail: 'Change requested · the office is on it, then you confirm the new list', done: false }
        : { key: 'confirm', title: 'Confirm your team list', detail: `${totalTeams} team${totalTeams === 1 ? '' : 's'} · tick the box to check the names and divisions`, done: false,
            ...(toConfirm ? {
              check: { onClick: () => setConfirmFor(toConfirm.id), title: 'Check your teams and confirm them' },
              action: { label: 'Confirm teams', onClick: () => setConfirmFor(toConfirm.id), primary: true },
            } : {}) })
    if (payItem) leftItems.push(payItem)
    const teamsWithNone = teamRows.filter(t => t.players.length === 0).length
    const filedAll = teamRows.reduce((sum, t) => sum + t.players.length, 0)
    leftItems.push({ key: 'waivers', title: 'Player waivers', done: teamRows.length > 0 && teamsWithNone === 0,
      detail: teamsWithNone ? `${filedAll} filed · ${teamsWithNone} team${teamsWithNone === 1 ? '' : 's'} with none yet` : `${filedAll} filed · every team has started`,
      action: perms.cd_players !== false ? { label: 'See who has filed', onClick: () => switchTab('players') } : undefined })
    leftItems.push({ key: 'coaches', title: 'Coach waivers', done: coachRows.length > 0 && coachesSigned === coachRows.length,
      detail: `${coachesSigned} of ${coachRows.length} coach${coachRows.length === 1 ? '' : 'es'} filed`,
      action: perms.cd_players !== false ? { label: 'See which coaches', onClick: () => switchTab('coaches') } : undefined })
    const hasLogo = regs.some(r => !!r.clubLogoUrl)
    leftItems.push({ key: 'logo', title: 'Club logo', optional: true, done: hasLogo,
      detail: hasLogo ? 'On your teams' : 'Shows on your schedules and brackets',
      // The same file picker as the club card below; staff view has no picker.
      action: !hasLogo && !viewUserId ? { label: 'Add your logo', onClick: () => document.getElementById(`club-logo-${regs[0].id}`)?.click() } : undefined })
  }
  const upcoming = !!selTournamentRow?.startDate && selTournamentRow.startDate >= todayLocal()
  const leftTitle = upcoming ? `What's left before ${dayLabel(selTournamentRow!.startDate)}` : "What's left"
  const readyTitle = upcoming ? `You're all set for ${dayLabel(selTournamentRow!.startDate)}` : "You're all set"
  const showStatus = tab !== 'history' && leftItems.some(i => !i.optional)
  const clubTitle = (data?.clubs?.length ? data.clubs : linkClubs).join(', ') || 'Your club'
  const heroLogo = regs.find(r => r.clubLogoUrl)?.clubLogoUrl || ''
  const countdown = selTournamentRow ? countdownLabel(selTournamentRow.startDate, selTournamentRow.endDate) : ''

  return (
    <div className="max-w-5xl mx-auto py-8">
      {requestFor && (() => {
        const r = regs.find(x => x.id === requestFor.regId)
        if (!r) return null
        return (
          <RequestChangeDialog tournamentId={selTournament} eventName={selTournamentName} reg={r}
            team={r.teams.find(x => x.id === requestFor.teamId) || null} event={portalEvent}
            initialKind={requestFor.kind} staffView={staffView} onClose={() => setRequestFor(null)} onDone={() => loadData(selTournament)} />
        )
      })()}
      {addFor && portalEvent && (() => {
        const r = regs.find(x => x.id === addFor)
        if (!r) return null
        return (
          <AddTeamDialog tournamentId={selTournament} eventName={selTournamentName} reg={r} event={portalEvent}
            showMoney={showMoney} staffView={staffView} onClose={() => setAddFor('')} onDone={() => loadData(selTournament)} />
        )
      })()}
      {confirmFor && (() => {
        const r = regs.find(x => x.id === confirmFor)
        if (!r) return null
        return (
          <ConfirmTeamsDialog tournamentId={selTournament} eventName={selTournamentName} reg={r} staffView={staffView}
            onClose={() => setConfirmFor('')} onDone={() => loadData(selTournament)}
            onRequestChange={() => { setConfirmFor(''); setRequestFor({ regId: r.id, teamId: '', kind: 'other' }) }} />
        )
      })()}
      {directorFor && (() => {
        const r = regs.find(x => x.id === directorFor)
        if (!r) return null
        return (
          <AddDirectorDialog tournamentId={selTournament} eventName={selTournamentName} reg={r} staffView={staffView}
            onClose={() => setDirectorFor('')} onDone={() => loadData(selTournament)} />
        )
      })()}
      {againFor && (
        <RegisterAgainDialog tournamentId={againFor.tournamentId} eventName={againFor.eventName} reg={againFor.reg}
          initialEventId={againFor.eventId} showMoney={showMoney} staffView={staffView}
          onClose={() => setAgainFor(null)} onRegistered={openNewEvent} />
      )}

      {viewUserId && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Eye size={16} className="shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold">Staff view.</strong> This is{' '}
            {viewingUser?.name ? `${viewingUser.name}’s` : 'this club director’s'} portal, exactly as they see it
            {viewingUser?.email ? ` (${viewingUser.email})` : ''}. Their buttons open the same forms they see, so you can try them; the last step (send, register, confirm) is off here.
          </span>
        </div>
      )}

      {/* THE TOP OF THE PAGE: who, which event, how long until it starts, and a
          status bar of what is left before then (Bo, Oct 5 2026: "a status bar
          across the top where they have what's left before October 24th"). It
          replaces the four number tiles, which showed the same numbers without
          saying what to do about them; the balance and its Pay button are a step
          on the bar now. */}
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {heroLogo
              ? <img src={heroLogo} alt="" className="h-14 w-14 rounded-xl object-contain bg-white border border-gray-200 shrink-0" />
              : <span aria-hidden="true" className="h-14 w-14 rounded-xl bg-violet-600 text-white text-lg font-bold flex items-center justify-center shrink-0">{initials(clubTitle)}</span>}
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Club director</p>
              <h1 className="text-2xl font-extrabold text-gray-900 leading-tight break-words">{clubTitle}</h1>
              {selTournamentName && tab !== 'history' && (
                <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap text-sm">
                  {/* h-6 with w-auto, not a square box: these marks are wordmarks as often
                      as badges, and Monster Mash is 453x180 -- squaring it shrinks it to
                      nothing. */}
                  {selTournamentRow?.logoUrl && (
                    <img src={selTournamentRow.logoUrl} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
                  )}
                  <span className="font-medium text-gray-700">{selTournamentName}</span>
                  {selTournamentRow?.startDate && (
                    <span className="text-gray-400">· {eventDates(selTournamentRow.startDate, selTournamentRow.endDate)}</span>
                  )}
                  {countdown && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-bold whitespace-nowrap">
                      <Clock size={12} className="shrink-0" /> {countdown}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Only when there is a choice: one event in a dropdown is just a box. */}
          {tab !== 'history' && tournaments.length > 1 && (
            <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadData(e.target.value) }}
              aria-label="Event"
              className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500">
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.startDate ? ` — ${shortDate(t.startDate)}` : ''}</option>
              ))}
            </select>
          )}
        </div>
        {showStatus && (
          <div className="border-t border-gray-100 bg-gray-50/70">
            <StatusBar title={leftTitle} readyTitle={readyTitle} items={leftItems} />
          </div>
        )}
      </section>

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
                      {entry.registrations[0] && (
                        <button onClick={() => setAgainFor({ tournamentId: tournament.id, eventName: tournament.name, reg: entry.registrations[0] })}
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
                <SharedNameNote clubs={data?.sharedClubs || []} />
                {data?.registrations.map(reg => {
                  const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
                  const inFlight = reg.clearing?.amount || 0
                  const due = reg.invoiceAmount - reg.discountAmount
                  const bal = due - paid - inFlight
                  const rows = teamRows.filter(t => t.regId === reg.id)
                  const filed = rows.reduce((s, t) => s + t.players.length, 0)
                  const noneYet = rows.filter(t => t.players.length === 0).length
                  return (
                    <div key={reg.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

                      {/* Club + money */}
                      <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* THE TILE IS THE BUTTON. A club with no crest saw a grey
                              letter and nothing to click, so the only way to get a
                              logo on their teams was to email the file to Bo. The
                              picture itself is the target, with a written label under
                              the name as well -- an image you can click is not
                              obvious, least of all on a phone. Read-only in staff view
                              like every other write to a club's own record. */}
                          {(() => {
                            const busy = logoSaving === reg.id
                            const tile = reg.clubLogoUrl
                              ? <img src={reg.clubLogoUrl} alt="" className="h-11 w-11 rounded-lg object-contain bg-white border border-gray-200 flex-shrink-0" />
                              : <span className="h-11 w-11 rounded-lg bg-gray-100 border border-gray-200 text-gray-400 font-semibold flex items-center justify-center flex-shrink-0">{(reg.clubName || '?').charAt(0).toUpperCase()}</span>
                            if (viewUserId) return tile
                            return (
                              <label className={`relative group flex-shrink-0 ${busy ? 'opacity-50' : 'cursor-pointer'}`}
                                title={reg.clubLogoUrl ? 'Change your club logo' : 'Add your club logo'}>
                                <input type="file" accept="image/*" className="hidden" disabled={busy}
                                  onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) saveClubLogo(reg.id, f) }} />
                                {tile}
                                <span className="absolute inset-0 rounded-lg bg-black/45 text-white text-[10px] font-semibold
                                  flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  {busy ? '…' : reg.clubLogoUrl ? 'Change' : 'Add'}
                                </span>
                              </label>
                            )
                          })()}
                          <div className="min-w-0">
                            <div className="font-bold text-gray-800 truncate">{reg.clubName}</div>
                            {reg.clubContact && <div className="text-sm text-gray-600 truncate">{reg.clubContact}</div>}
                            <div className="text-sm text-gray-500 truncate">{reg.contactEmail}{reg.contactPhone ? ` · ${reg.contactPhone}` : ''}</div>
                            <div className="text-xs text-gray-400 mt-0.5">Registered {shortDate(reg.createdAt)}</div>
                            {!viewUserId && (
                              <div className="mt-1 flex items-center gap-2 text-xs">
                                <label className={`inline-flex items-center gap-1 font-semibold ${logoSaving === reg.id ? 'text-gray-400' : 'text-teal-700 hover:text-teal-800 cursor-pointer hover:underline'}`}>
                                  <input id={`club-logo-${reg.id}`} type="file" accept="image/*" className="hidden" disabled={logoSaving === reg.id}
                                    onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) saveClubLogo(reg.id, f) }} />
                                  <ImagePlus size={12} className="shrink-0" />
                                  {logoSaving === reg.id ? 'Saving\u2026' : reg.clubLogoUrl ? 'Change club logo' : 'Add your club logo'}
                                </label>
                                {reg.clubLogoUrl && logoSaving !== reg.id && (
                                  <button type="button" onClick={() => saveClubLogo(reg.id, null)}
                                    className="text-gray-400 hover:text-red-600">Remove</button>
                                )}
                                {!reg.clubLogoUrl && reg.teams.length > 0 && (
                                  <span className="text-gray-400">&mdash; goes on your {reg.teams.length} team{reg.teams.length === 1 ? '' : 's'} too</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* With one registration the status bar and the invoice below
                            already say all of this. A club with two keeps it, so each
                            card shows its own. */}
                        {showMoney && regs.length > 1 && (
                        <div className="flex items-center gap-5 text-sm flex-shrink-0 justify-between sm:justify-end border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Invoiced</div>
                            <div className="font-medium text-gray-700">{fmt(due)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Paid</div>
                            <div className="font-medium text-green-600">{fmt(paid + inFlight)}</div>
                            {inFlight > 0 && <div className="text-[11px] font-semibold text-amber-600">{fmt(inFlight)} clearing</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Balance</div>
                            <div className={`font-semibold ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bal)}</div>
                          </div>
                        </div>
                        )}
                      </div>

                      {/* A request the office has, or a changed list to confirm. */}
                      <AccountNote confirm={reg.confirm} onConfirm={() => setConfirmFor(reg.id)} />

                      {/* Registration facts */}
                      <div className="px-5 py-2.5 bg-gray-50 border-y border-gray-100 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                        {reg.clubBasedIn && <span className="text-gray-500">Based in: <span className="text-gray-700 font-medium">{reg.clubBasedIn}</span></span>}
                        <span className="text-gray-500">Hotel: <span className="text-gray-700 font-medium">{reg.needsHotel || 'No'}</span></span>
                        <span className="text-gray-500 flex items-center gap-1.5">
                          Pay method:
                          {viewUserId ? (
                            <span className="text-gray-700 font-medium">{payLabel(reg.paymentMethod)}</span>
                          ) : (
                            <select
                              value={PAY_CHOICES.some(c => c.value === reg.paymentMethod) ? reg.paymentMethod : ''}
                              disabled={payMethodSaving === reg.id}
                              onChange={e => { const v = e.target.value; if (v && v !== reg.paymentMethod) savePayMethod(reg.id, v) }}
                              className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-700 font-medium disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                            >
                              {/* A stored value outside the list (an old import, or 'cash'
                                  keyed in by staff) keeps its own entry rather than being
                                  silently rewritten to whatever sorts first. */}
                              {!PAY_CHOICES.some(c => c.value === reg.paymentMethod) && (
                                <option value="">{payLabel(reg.paymentMethod)}</option>
                              )}
                              {PAY_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          )}
                          {payMethodSaving === reg.id && <span className="text-xs text-gray-400">Saving…</span>}
                        </span>
                      </div>

                      {/* Who runs this registration in the portal, and adding another
                          director by email (lib/clubAccess; Bo, Oct 4 2026). */}
                      <DirectorsLine directors={reg.directors || []} invites={reg.invites || []} staffView={staffView}
                        onAdd={() => setDirectorFor(reg.id)} onCancel={email => cancelInvite(reg.id, email)} />

                      {/* Adding a team is the club's own call until the schedule is
                          posted; moving or removing one is always a request (Bo, Oct 3
                          2026). See ./PortalActions and api/club-director/teams. */}
                      {showChange && (
                        <div className="px-5 py-2.5 flex items-center justify-between gap-3 border-b border-gray-100">
                          <span className="text-sm font-semibold text-gray-800">Your teams</span>
                          <button type="button" onClick={() => setAddFor(reg.id)}
                            className="inline-flex items-center gap-1.5 min-h-[36px] text-sm font-semibold px-3.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white">
                            <Plus size={15} className="shrink-0" /> Add a team
                          </button>
                        </div>
                      )}

                      {/* Teams — a real table on desktop, stacked rows on a phone,
                          from one set of markup so neither can drift. */}
                      <div className="hidden sm:grid grid-cols-12 gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <div className="col-span-3">Team</div>
                        <div className={showChange ? 'col-span-2' : 'col-span-3'}>Division</div>
                        <div className="col-span-1 text-center">Waivers</div>
                        <div className="col-span-2">Coach</div>
                        <div className={showChange ? 'col-span-2' : 'col-span-3'}>Contact</div>
                        {showChange && <div className="col-span-2 text-right">Changes</div>}
                      </div>
                      <div className="divide-y divide-gray-100">
                        {rows.length === 0 && <div className="px-5 py-4 text-sm text-gray-400">No teams on this registration.</div>}
                        {rows.map(t => (
                          <div key={t.key} className="px-5 py-3 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-1 sm:items-center">
                            <div className="sm:col-span-3 flex items-center gap-2 min-w-0">
                              {t.logoUrl && <img src={t.logoUrl} alt="" className="h-5 w-5 object-contain rounded flex-shrink-0" />}
                              <span className="font-semibold text-gray-800 truncate">{t.teamName}</span>
                            </div>
                            <div className={`${showChange ? 'sm:col-span-2' : 'sm:col-span-3'} text-sm text-gray-600 min-w-0`}>
                              <span className="block truncate">{t.division}</span>
                              {poolOf(t.division, t.teamName) && (
                                <span className="inline-block mt-0.5 mr-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{poolOf(t.division, t.teamName)}</span>
                              )}
                              {t.waitlisted && (
                                <span title="This division is full. The team is not billed unless a spot opens."
                                  className="inline-block mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Waiting list</span>
                              )}
                            </div>
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
                            <div className={`${showChange ? 'sm:col-span-2' : 'sm:col-span-3'} text-sm text-gray-500 min-w-0 leading-snug`}>
                              {t.coachPhone && <div><a href={`tel:${t.coachPhone}`} className="hover:text-violet-600">{t.coachPhone}</a></div>}
                              {t.coachEmail && <div className="truncate"><a href={`mailto:${t.coachEmail}`} title={t.coachEmail} className="hover:text-violet-600">{t.coachEmail}</a></div>}
                              {!t.coachPhone && !t.coachEmail && '—'}
                            </div>
                            {showChange && (
                              <div className="sm:col-span-2 flex sm:justify-end gap-1.5 pt-1.5 sm:pt-0">
                                {(portalEvent?.divisions.length ?? 0) > 1 && (
                                  <button type="button" onClick={() => setRequestFor({ regId: reg.id, teamId: t.key, kind: 'move' })}
                                    title="Ask the office to move this team to another division"
                                    className="min-h-[32px] px-3 rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800">Move</button>
                                )}
                                <button type="button" onClick={() => setRequestFor({ regId: reg.id, teamId: t.key, kind: 'remove' })}
                                  title="Ask the office to remove this team"
                                  className="min-h-[32px] px-3 rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800">Remove</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {showChange && (
                        <p className="px-5 py-2.5 border-t border-gray-100 text-xs leading-relaxed text-gray-500">
                          Moving a team to another division or removing one goes to the tournament office as a request.{' '}
                          {portalEvent?.posted ? 'The schedule is posted, so adding a team is a request now too.' : 'You can add a team yourself until the schedule is posted.'}
                        </p>
                      )}

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
                          {bal <= 0 && due > 0 && (inFlight > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                              title="Your bank transfer is on its way. Bank transfers take a few business days to clear.">
                              <Check size={12} className="shrink-0" /> Paid · transfer clearing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
                              <Check size={12} className="shrink-0" /> Paid in full
                            </span>
                          ))}
                          {/* WHERE DO I PAY? Directors were logging in, seeing a red
                              balance, and having to email Bo to ask how to settle it --
                              the pay page existed all along but the only way in was the
                              link buried in a reminder email (Bo, Sep 28 2026).
                              THIS ONE WORKS IN STAFF VIEW TOO. It was greyed out at first,
                              on the reading that paying is acting on the director's behalf.
                              That was wrong: opening a payment page charges nothing, and
                              clubs ring Bo to read him a card over the phone, which is the
                              tournament collecting its own invoice. The rule the banner
                              describes is about writing to a club's record, not about Bo
                              taking a payment he is owed. */}
                          {bal > 0 && (
                            <span className="flex items-center gap-1.5 shrink-0">
                              <a href={`/pay/${reg.id}`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white">
                                <CreditCard size={13} className="shrink-0" /> Pay {fmt(bal)}
                              </a>
                              <button type="button" onClick={() => copyPayLink(reg.id)}
                                title="Copy this club's payment link"
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">
                                <Copy size={12} className="shrink-0" /> Copy link
                              </button>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm mb-3">
                          <span className="text-gray-500">Invoice: <span className="font-medium text-gray-800">{fmt(reg.invoiceAmount)}</span></span>
                          {reg.discountAmount > 0 && (
                            <span className="text-gray-500">Discount: <span className="font-medium text-amber-600">-{fmt(reg.discountAmount)}</span>{reg.discountNote ? <span className="text-gray-400"> ({reg.discountNote})</span> : null}</span>
                          )}
                          <span className="text-gray-500">Paid: <span className="font-medium text-green-600">{fmt(paid)}</span></span>
                          {inFlight > 0 && (
                            <span className="text-gray-500">Clearing: <span className="font-medium text-amber-600">{fmt(inFlight)}</span></span>
                          )}
                          <span className="text-gray-500">Balance: <span className={`font-semibold ${bal > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bal)}</span></span>
                        </div>
                        {inFlight > 0 && reg.clearing && (
                          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                            Your bank transfer of <span className="font-semibold">{fmt(inFlight)}</span>, sent {shortDate(reg.clearing.startedAt)}, is on its way.
                            It counts as paid while it clears, which takes a few business days.{bal <= 0 ? ' There\u2019s nothing more to pay.' : ''}
                          </p>
                        )}
                        {/* Having changed their method, a director needs to know what
                            it now asks of them. Online methods are settled on the pay
                            page; Zelle and check are settled by hand, and the details
                            for those otherwise live only in an email sent weeks ago. */}
                        {bal > 0 && reg.paymentMethod === 'zelle' && (
                          <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 mb-3">
                            Send <span className="font-semibold">{fmt(bal)}</span> by Zelle to{' '}
                            <span className="font-semibold">{data?.payTo?.zelleHandle || 'the tournament'}</span>
                            {' '}with &ldquo;{reg.clubName}&rdquo; in the memo. We&apos;ll mark the invoice paid when it arrives.
                          </p>
                        )}
                        {bal > 0 && reg.paymentMethod === 'check' && (
                          <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 mb-3">
                            Mail a check for <span className="font-semibold">{fmt(bal)}</span> payable to{' '}
                            <span className="font-semibold">{data?.payTo?.checkPayableTo || 'the tournament'}</span>
                            {data?.payTo?.checkAddress ? <>, to:<br /><span className="text-gray-700">{data.payTo.checkAddress}</span></> : null}
                          </p>
                        )}
                        {reg.payments.length === 0 && !inFlight
                          ? <p className="text-sm text-gray-400">
                              No payments recorded yet.{bal > 0 ? ' You can switch methods above at any time — the Pay button takes card, bank transfer and PayPal.' : ''}
                            </p>
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
                                {inFlight > 0 && reg.clearing && (
                                  <div className="px-4 py-2 grid grid-cols-2 sm:grid-cols-12 gap-x-4 text-sm bg-amber-50/60">
                                    <div className="sm:col-span-5 text-gray-700">{shortDate(reg.clearing.startedAt)}</div>
                                    <div className="sm:col-span-4 text-amber-700 order-last sm:order-none col-span-2 sm:col-auto">Bank transfer (ACH) · clearing</div>
                                    <div className="sm:col-span-3 text-right font-medium text-amber-700">{fmt(inFlight)}</div>
                                  </div>
                                )}
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

                {/* Hotels last: an add-on, not every club stays over, and it sat above
                    the club's own teams and invoice (Bo, Oct 5 2026: "definitely put
                    the hotel information below all the club information"). Folded to
                    one line, and opened to start only for a club that answered Yes or
                    Maybe to the hotel question when it registered. */}
                {(() => {
                  const hotel = familyMsgs.filter(m => m.key === 'hotel')
                  if (!hotel.length) return null
                  const wantsRooms = regs.some(r => /^(yes|maybe)$/i.test(String(r.needsHotel || '').trim()))
                  return (
                    <details className="group" open={wantsRooms || undefined}>
                      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-gray-300 group-open:mb-3">
                        <span className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                          <BedDouble size={19} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800">Hotel rooms for your families</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Optional</span>
                          </span>
                          <span className="block text-[13px] text-gray-500">Only if your club is staying over. A message with the booking link, ready to send.</span>
                        </span>
                        <ChevronDown size={18} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <FamilyMessages messages={hotel} />
                    </details>
                  )
                })()}

                {regs[0] && selTournament && (
                  <OtherEventsCard tournamentId={selTournament} teamCount={totalTeams} showMoney={showMoney}
                    onRegister={eventId => setAgainFor({ tournamentId: selTournament, eventName: selTournamentName, reg: regs[0], eventId })} />
                )}
              </div>
            )}

            {tab === 'coaches' && (
              <div className="space-y-3">
                <SharedNameNote clubs={data?.sharedClubs || []} />
                <p className="text-sm text-gray-500">
                  {coachesSigned} of {coachRows.length} team coach{coachRows.length === 1 ? '' : 'es'} {coachesSigned === 1 ? 'has' : 'have'} filed a waiver.
                  {coachesSigned < coachRows.length && ' The ones still outstanding are marked below.'}
                </p>

                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {coachRows.length === 0 && (
                    <p className="p-5 text-sm text-gray-400">No teams registered for this event yet.</p>
                  )}
                  {coachRows.map(r => (
                    <div key={r.key}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <span className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${r.waiver ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {r.waiver ? <Check size={15} /> : <X size={15} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-gray-800 truncate">{r.coachName || <span className="font-normal text-gray-400">No coach named on the registration</span>}</span>
                          <span className="block text-xs text-gray-500 truncate">{r.teamName}{r.division ? ` · ${r.division}` : ''}{r.waiver?.role ? ` · ${r.waiver.role}` : ''}</span>
                        </span>
                        <span className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                          {r.coachEmail && <a href={`mailto:${r.coachEmail}`} className="flex items-center gap-1 hover:text-violet-600"><Mail size={12} /> {r.coachEmail}</a>}
                          {r.coachPhone && <a href={`tel:${r.coachPhone}`} className="flex items-center gap-1 hover:text-violet-600"><Phone size={12} /> {r.coachPhone}</a>}
                        </span>
                        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${r.waiver ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {r.waiver ? 'Waiver on file' : 'Not filed'}
                        </span>
                        <button
                          type="button"
                          onClick={() => (coachEdit === r.teamId ? setCoachEdit('') : openCoachEdit(r))}
                          className="shrink-0 text-xs font-semibold text-violet-600 hover:text-violet-700 px-2 py-1 rounded-lg hover:bg-violet-50"
                        >
                          {coachEdit === r.teamId ? 'Cancel' : 'Change coach'}
                        </button>
                      </div>

                      {coachEdit === r.teamId && (
                        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Who coaches {r.teamName}?</p>

                          {coachChoices.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {coachChoices.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={coachSaving}
                                  onClick={() => saveCoach(r.teamId, { coachName: c.name, coachEmail: c.email, coachPhone: c.phone })}
                                  className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
                                >
                                  <Check size={12} className="text-emerald-600 shrink-0" />
                                  <span className="font-medium text-gray-800">{c.name || 'Unnamed'}</span>
                                  {c.role && <span className="text-gray-400">{c.role}</span>}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-end gap-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-gray-500">Name</span>
                              <input
                                value={coachForm.coachName}
                                onChange={e => setCoachForm(f => ({ ...f, coachName: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-gray-500">Email</span>
                              <input
                                type="email"
                                value={coachForm.coachEmail}
                                onChange={e => setCoachForm(f => ({ ...f, coachEmail: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-gray-500">Phone</span>
                              <input
                                value={coachForm.coachPhone}
                                onChange={e => setCoachForm(f => ({ ...f, coachPhone: e.target.value }))}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-violet-400"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={coachSaving || !coachForm.coachName.trim()}
                              onClick={() => saveCoach(r.teamId, coachForm)}
                              className="bg-violet-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-violet-700 disabled:bg-gray-300"
                            >
                              {coachSaving ? 'Saving…' : 'Save'}
                            </button>
                          </div>

                          <p className="text-[11px] text-gray-400 mt-2">
                            Coaches who already signed are listed above — picking one matches their waiver to this team. Anyone you type in instead will match as soon as they sign.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {extraCoachWaivers.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Also filed</p>
                    <p className="text-xs text-gray-500 mb-3">Signed for your club, but not matching a coach named on a registration — an assistant, or a coach who changed since you registered. Use <span className="font-medium text-violet-600">Change coach</span> on a team above to put one of them on it.</p>
                    <div className="space-y-1.5">
                      {extraCoachWaivers.map(c => (
                        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                          <Check size={14} className="text-emerald-600 shrink-0" />
                          <span className="font-medium text-gray-800">{c.name || 'Unnamed'}</span>
                          <span className="text-xs text-gray-500">{[c.team, c.division, c.role].filter(Boolean).join(' · ')}</span>
                          {c.email && <a href={`mailto:${c.email}`} className="text-xs text-gray-400 hover:text-violet-600">{c.email}</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* The letter comes after the list. Directors open this tab to see
                    who has filed, and a full message above it pushed that out of
                    sight (Bo, Oct 5 2026). */}
                {draftsFor('coaches', 'READY TO SEND YOUR COACHES')}
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
                <SharedNameNote clubs={data?.sharedClubs || []} />
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
                                    // h-full + flex column: a two-line name made one card taller
                                    // than its neighbours, because a grid item that is a <button>
                                    // does not stretch on its own. The footer pins to mt-auto so
                                    // every "Waiver on file" line sits on the same baseline.
                                    className={`h-full flex flex-col text-left border rounded-xl overflow-hidden transition-colors ${sel ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200 hover:border-violet-300'}`}>
                                    {/* Deliberately NOT the full keepsake card: no QR
                                        codes, no player id, no presented-by footer.
                                        A coach is checking a face against a name. */}
                                    <div className="bg-gray-900 px-2.5 py-1.5 flex items-center gap-1.5">
                                      {row.clubLogoUrl
                                        ? <img src={row.clubLogoUrl} alt="" className="h-5 w-5 rounded bg-white object-contain shrink-0" />
                                        : <span className="h-5 w-5 rounded bg-white text-gray-900 text-[8px] font-extrabold grid place-items-center shrink-0">{initials(row.teamName)}</span>}
                                      <span className="text-[10px] font-semibold text-gray-200 truncate">{row.teamName}</span>
                                    </div>
                                    {/* Name across the full card, not beside the
                                        avatar. Sharing the row left it about 100px,
                                        and a real surname ("Kourkoumelis") broke
                                        mid-word into an orphan letter. It also scans
                                        better: a coach reads down a column of names. */}
                                    <div className="p-2.5 flex flex-col gap-2">
                                      <span className="block font-bold text-[13.5px] leading-tight text-gray-800 line-clamp-2 [overflow-wrap:anywhere]">{w.playerName || 'Player'}</span>
                                      <span className="flex gap-2.5 items-center">
                                        <span className={`h-[52px] w-[46px] rounded-lg grid place-items-center shrink-0 overflow-hidden text-white font-extrabold text-[15px] ${avatarTone(w.playerName)}`}>
                                          {w.photoUrl ? <img src={w.photoUrl} alt="" className="h-full w-full object-cover" /> : initials(w.playerName)}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          {w.position && <span className="block text-[9.5px] font-bold uppercase tracking-widest text-teal-600 truncate">{w.position}</span>}
                                          <span className="flex items-baseline gap-1.5 mt-0.5">
                                            {w.jersey ? <span className="text-[19px] font-extrabold text-gray-800 leading-none"><span className="text-[11px] text-gray-400">#</span>{w.jersey}</span> : null}
                                            {w.grade && <span className="text-[10.5px] font-semibold text-gray-400 leading-none">Gr {w.grade}</span>}
                                          </span>
                                        </span>
                                      </span>
                                    </div>
                                    <div className="mt-auto border-t border-gray-100 bg-gray-50 px-2.5 py-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-teal-700">
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
                                      ['Date of birth', dobDate(w.dob)],
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
                                  {['Player', 'DOB', 'Grade', 'Jersey', 'Parent', 'Filed', ''].map(h => (
                                    <th key={h} className="text-left px-4 py-2 text-gray-500 font-semibold text-xs">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {row.players.map(w => (
                                  <tr key={w.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-800">{w.playerName || '—'}</td>
                                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dobDate(w.dob) || '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.grade || '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.jersey ? `#${w.jersey}` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-500">{w.parentName || '—'}</td>
                                    <td className="px-4 py-2 text-gray-400 text-xs">{fileDate(w.submittedAt)}</td>
                                    <td className="px-4 py-2 text-right"><TeamPicker w={w} placed /></td>
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
                      Filed under a team name that doesn&rsquo;t match your registration, so they are missing from the rosters
                      below. They still count toward your club total. Put each one on a team here &mdash; this stays open all
                      weekend, so a late registration can be fixed on the morning of.
                    </p>
                    <div className="mt-2.5 divide-y divide-amber-200/70 border-t border-amber-200/70">
                      {unassignedWaivers.map(w => (
                        <div key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-amber-900 truncate">{w.playerName || 'Player'}</div>
                            <div className="text-[11px] text-amber-700 truncate">
                              {[w.team ? `filed as \u201c${w.team}\u201d` : '', w.grade ? `Grade ${w.grade}` : '', dobDate(w.dob), w.parentName]
                                .filter(Boolean).join('  \u00b7  ')}
                            </div>
                          </div>
                          <TeamPicker w={w} placed={false} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lock?.why && (
                  <p className={`text-xs px-1 ${lock.locked ? 'text-amber-700' : 'text-gray-400'}`}>{lock.why}</p>
                )}

                {teamRows.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-8 text-center text-gray-400">No teams registered yet</div>
                )}

                {/* After the rosters, for the same reason as the coach letter. */}
                {draftsFor('waivers', 'READY TO SEND YOUR FAMILIES')}
              </div>
            )}

            {/* Schedule */}
            {tab === 'schedule' && (
              <div className="space-y-6">
              {hasSchedule && (
              <div className="space-y-2">
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
              {hasPools && data && (
                <PortalPools pools={portalPools} myTeams={data.registrations.flatMap(r => r.teams)} scheduleLive={hasSchedule} />
              )}
              </div>
            )}

          </>
        )
      )}
    </div>
  )
}
