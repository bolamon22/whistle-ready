'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { CalendarDays, ExternalLink, Search, Star, User, UserPlus } from 'lucide-react'
import ParentWaiverList, { type ParentWaiver } from '@/components/ParentWaiverList'
import { teamRefKey } from '@/lib/names'

interface Tournament { id: string; name: string; startDate: string; endDate?: string; logoUrl: string | null; location: string | null }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}
interface PlayerReg { id: string; playerName: string; teamClubName: string; tournamentId: string }

/**
 * A team one of this parent's players is on, from the waivers in their account.
 * The account follows it without anyone pressing Follow (Bo, Oct 9 2026: "will
 * they also be able to follow their teams with this account?"). Keyed by
 * (division, team) like every follow in the app, never the name alone: a club
 * often fields the same name in three divisions.
 */
type MyTeam = { key: string; tournamentId: string; eventName: string; eventDates: string; startDate: string; division: string; team: string; clubName: string; players: string[] }

const todayIso = () => new Date().toISOString().slice(0, 10)
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n
/** Minutes since midnight from "9:40 AM" or "09:40". Games sort by this, never by
 *  the clock text: "2:00 PM" sorts before "8:20 AM" as text (same as toMinutes in
 *  lib/scheduleDigest, kept here so this page doesn't pull that file in). */
const minutes = (time: string) => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(time || '').trim())
  if (!m) return 0
  let h = Number(m[1]); const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + Number(m[2])
}
/** "Sat 10/24" from a YYYY-MM-DD, split by hand: new Date('2026-10-24') is UTC midnight and prints Friday in US zones. */
const gameDay = (date: string) => {
  const [y, mo, d] = String(date || '').split('-').map(Number)
  return y && mo && d ? `${new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short' })} ${mo}/${d}` : String(date || '')
}
const fmtDay = (s: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''
}

export default function ParentDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([])
  const [followed, setFollowed] = useState<string[]>([])
  const [teamFollows, setTeamFollows] = useState<{tournamentId: string; teamName: string}[]>([])
  const [linkedPlayers, setLinkedPlayers] = useState<PlayerReg[]>([])
  const [waivers, setWaivers] = useState<ParentWaiver[]>([])   // waivers put in this account at the end of the waiver
  const [games, setGames] = useState<Record<string, Game[]>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schedule' | 'teams' | 'players' | 'discover'>('schedule')
  const [selTournament, setSelTournament] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)   // Schedule: just their players' games, when they have a team at this event

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      // The public event list (the same one /find shows). This read /api/tournaments,
      // which only lists events for logins tied to an organization; parent accounts
      // never are, so Discover and Schedule came up empty for every parent.
      fetch('/api/public/tournaments').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/parent/follows').then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{ tournaments?: string[]; teams?: { tournamentId: string; teamName: string }[]; players?: PlayerReg[] } | null>,
      fetch('/api/parent/waivers').then(r => r.ok ? r.json() : { waivers: [] }).catch(() => ({ waivers: [] })),
    ]).then(([t, f, w]) => {
      setAllTournaments(Array.isArray(t) ? t : [])
      const fol: string[] = Array.isArray(f?.tournaments) ? f.tournaments : []
      setFollowed(fol)
      setTeamFollows(Array.isArray(f?.teams) ? f.teams : [])
      setLinkedPlayers(Array.isArray(f?.players) ? f.players : [])
      const mine: ParentWaiver[] = Array.isArray(w?.waivers) ? w.waivers : []
      setWaivers(mine)
      // ?tab=players is where "Open my account" on the waiver lands. Otherwise a
      // parent with players and nothing followed starts on My Players.
      let asked = ''
      try { asked = new URLSearchParams(window.location.search).get('tab') || '' } catch {}
      if (['schedule', 'teams', 'players', 'discover'].includes(asked)) setTab(asked as typeof tab)
      else if (mine.length && !fol.length) setTab('players')
      // The Schedule opens on the soonest event one of their players is in (the
      // list comes back upcoming first), else the first event they follow.
      const first = mine.find(x => !x.past && x.tournamentId)?.tournamentId || fol[0]
      if (first) { setSelTournament(first); loadGames(first) }
      setLoading(false)
    })
  }, [status])

  const loadGames = async (tournamentId: string) => {
    if (games[tournamentId]) return
    // The public view: what the event's public schedule shows, and nothing before it's published.
    const g = await fetch(`/api/tournaments/${tournamentId}/games?view=public`).then(r => r.ok ? r.json() : []).catch(() => [])
    setGames(prev => ({ ...prev, [tournamentId]: Array.isArray(g) ? g : [] }))
  }

  const followTournament = async (id: string) => {
    await fetch('/api/parent/follows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tournament', tournamentId: id }) })
    setFollowed(prev => [...prev, id])
    loadGames(id)
    toast.success('Tournament followed!')
  }

  const unfollowTournament = async (id: string) => {
    await fetch('/api/parent/follows', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tournament', tournamentId: id }) })
    setFollowed(prev => prev.filter(f => f !== id))
    toast.success('Unfollowed.')
  }

  const openGames = (tournamentId: string) => {
    setSelTournament(tournamentId); setOnlyMine(true); loadGames(tournamentId); setTab('schedule')
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  // Their players' teams, one per (event, division, team), upcoming events only.
  const teamMap = new Map<string, MyTeam>()
  for (const w of waivers) {
    if (w.past || !w.tournamentId || !w.division || !w.team) continue
    const key = `${w.tournamentId}|${teamRefKey(w.division, w.team)}`
    const cur = teamMap.get(key)
    if (cur) { if (!cur.players.includes(w.playerName)) cur.players.push(w.playerName); continue }
    teamMap.set(key, { key, tournamentId: w.tournamentId, eventName: w.eventName, eventDates: w.eventDates, startDate: w.startDate, division: w.division, team: w.team, clubName: w.clubName, players: [w.playerName] })
  }
  const myTeams = Array.from(teamMap.values())

  // Schedule: their players' events first, then the events they follow.
  const byId = new Map(allTournaments.map(t => [t.id, t]))
  const scheduleEvents: Tournament[] = []
  for (const id of Array.from(new Set([...myTeams.map(m => m.tournamentId), ...followed]))) {
    const t = byId.get(id)
    if (t) { scheduleEvents.push(t); continue }
    const m = myTeams.find(x => x.tournamentId === id)
    if (m) scheduleEvents.push({ id, name: m.eventName, startDate: m.startDate, logoUrl: null, location: null })
  }
  const mineHere = myTeams.filter(m => m.tournamentId === selTournament)
  const mineByKey = new Map(mineHere.map(m => [teamRefKey(m.division, m.team), m]))
  const whose = (g: Game) => mineByKey.get(teamRefKey(g.division, g.team1)) || mineByKey.get(teamRefKey(g.division, g.team2))
  const loaded = games[selTournament]
  const allGames = (loaded || []).filter(g => !g.isCanceled)
    .sort((a, b) => a.date !== b.date ? (a.date < b.date ? -1 : 1) : minutes(a.startTime) - minutes(b.startTime))
  const myGames = allGames.filter(g => whose(g))
  const showingMine = onlyMine && mineHere.length > 0
  const displayGames = showingMine ? myGames : allGames
  const followedTeamNames = teamFollows.filter(f => f.tournamentId === selTournament).map(f => f.teamName)
  // Brothers and sisters: a waiver for each upcoming event already in the account,
  // opened with the family's details filled in (WaiverPrefillBar, ?sibling=1).
  const siblingEvents: { id: string; name: string }[] = []
  for (const w of waivers) if (!w.past && w.tournamentId && !siblingEvents.some(e => e.id === w.tournamentId)) siblingEvents.push({ id: w.tournamentId, name: w.eventName })
  const today = todayIso()
  const upcoming = allTournaments
    .filter(t => String(t.endDate || t.startDate || '').slice(0, 10) >= today)
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')))

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Toaster />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {session?.user?.name}</h1>
        <p className="text-gray-500 text-sm mt-0.5">Parent Dashboard</p>
      </div>

      {/* Tabs */}
      {/* Four across on a phone: equal widths, icons from sm up. Teal and lucide
          icons per the design standard (this page used to have its own colors and emoji). */}
      <div className="flex sm:gap-2 mb-5 border-b border-gray-200">
        {([['schedule', 'Schedule', CalendarDays], ['teams', 'My Teams', Star], ['players', 'My Players', User], ['discover', 'Discover', Search]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-1 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-teal-500 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} className="hidden sm:block" />{label}
          </button>
        ))}
      </div>

      {/* Schedule tab */}
      {tab === 'schedule' && (
        <div data-testid="parent-schedule">
          {scheduleEvents.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CalendarDays size={36} className="mx-auto mb-3 text-gray-300" />
              <p>No events here yet.</p>
              <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed">Your player&rsquo;s events show up here once their waiver is in your account. You can also follow any event.</p>
              <button onClick={() => setTab('discover')} className="mt-3 text-teal-700 hover:underline text-sm">Discover tournaments →</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {scheduleEvents.map(t => (
                  <button key={t.id} onClick={() => { setSelTournament(t.id); loadGames(t.id) }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selTournament === t.id ? 'bg-teal-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 inline mr-1 rounded" />}
                    {t.name}
                  </button>
                ))}
              </div>
              {mineHere.length > 0 && (
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <p className="text-sm text-gray-500 min-w-0">
                    {mineHere.map(m => `${[m.clubName, m.team].filter(Boolean).join(' ')} (${m.division})`).join(', ')}
                  </p>
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold shrink-0" role="group" aria-label="Which games">
                    <button onClick={() => setOnlyMine(true)} aria-pressed={showingMine}
                      className={`px-3 py-1.5 rounded-md ${showingMine ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}>My teams&rsquo; games</button>
                    <button onClick={() => setOnlyMine(false)} aria-pressed={!showingMine}
                      className={`px-3 py-1.5 rounded-md ${!showingMine ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}>All games</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {displayGames.map(g => {
                  const m = whose(g)
                  const isFollowed = !m && (followedTeamNames.includes(g.team1) || followedTeamNames.includes(g.team2))
                  return (
                    <div key={g.id} data-testid="parent-game" className={`bg-white border rounded-xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 ${m || isFollowed ? 'border-teal-200 bg-teal-50' : 'border-gray-200'}`}>
                      <div className="text-center w-16 flex-shrink-0">
                        <div className="text-xs text-gray-400 whitespace-nowrap">{gameDay(g.date)}</div>
                        <div className="text-sm font-semibold text-gray-700 whitespace-nowrap">{g.startTime}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800">{g.team1} <span className="text-gray-400">vs</span> {g.team2}</div>
                        <div className="text-xs text-gray-400">{[g.division, g.location].filter(Boolean).join(' · ')}</div>
                      </div>
                      {(g.score1 !== null && g.score2 !== null) && (
                        <div className="text-sm font-bold text-gray-700">{g.score1} – {g.score2}</div>
                      )}
                      {m && <span className="inline-flex items-center gap-1 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full whitespace-nowrap"><Star size={11} /> {m.players.map(firstName).join(' & ')}</span>}
                      {isFollowed && <span className="inline-flex items-center gap-1 text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full"><Star size={11} /> Following</span>}
                    </div>
                  )
                })}
                {!loaded && selTournament && <div className="text-center py-8 text-gray-400">Loading games…</div>}
                {loaded && allGames.length === 0 && <div className="text-center py-8 text-gray-400">No games posted for this event yet.</div>}
                {loaded && showingMine && allGames.length > 0 && myGames.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    None of the posted games list your team yet.
                    <button onClick={() => setOnlyMine(false)} className="block mx-auto mt-2 text-teal-700 hover:underline text-sm">Show all games</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Teams tab */}
      {tab === 'teams' && (
        <div data-testid="parent-teams">
          {myTeams.length === 0 && teamFollows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Star size={36} className="mx-auto mb-3 text-gray-300" />
              <p>No teams yet.</p>
              <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed">Your player&rsquo;s team shows up here once their waiver is in your account.</p>
            </div>
          ) : (
            <>
              {myTeams.length > 0 && (
                <>
                  <p className="text-sm text-gray-500 mb-4">Your players&rsquo; teams, from their waivers.</p>
                  <div className="space-y-2">
                    {myTeams.map(m => (
                      <div key={m.key} data-testid="my-team" className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800">{[m.clubName, m.team].filter(Boolean).join(' · ')}</div>
                          <div className="text-sm text-gray-500 mt-0.5">{m.division} · {m.eventName}{m.eventDates && <span className="text-gray-400"> · {m.eventDates}</span>}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{m.players.join(', ')}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={`/tournaments/${m.tournamentId}/public`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                            <ExternalLink size={13} /> Event page
                          </a>
                          <button onClick={() => openGames(m.tournamentId)} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg">
                            <CalendarDays size={13} /> Games
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3 leading-relaxed">For phone alerts when the schedule comes out or a game ends, open the event page and tap <span className="font-semibold">Follow</span> on the team.</p>
                </>
              )}
              {teamFollows.length > 0 && (
                <div className={myTeams.length ? 'mt-8' : ''}>
                  {myTeams.length > 0 && <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Other teams you follow</h2>}
                  <div className="space-y-2">
                    {teamFollows.map((f, i) => {
                      const t = allTournaments.find(t => t.id === f.tournamentId)
                      return (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-800">{f.teamName}</div>
                            <div className="text-xs text-gray-400">{t?.name}</div>
                          </div>
                          <button onClick={async () => {
                            await fetch('/api/parent/follows', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'team', tournamentId: f.tournamentId, teamName: f.teamName }) })
                            setTeamFollows(prev => prev.filter(x => !(x.tournamentId === f.tournamentId && x.teamName === f.teamName)))
                            toast.success('Unfollowed.')
                          }} className="text-xs text-red-400 hover:text-red-600">Unfollow</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && (
        <div>
          {waivers.length === 0 && linkedPlayers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <User size={36} className="mx-auto mb-3 text-gray-300" />
              <p>No players in your account yet.</p>
              <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed">When you fill out a player waiver, create a password at the end. Your player shows up here, and you can update their details any time.</p>
            </div>
          ) : (
            <>
              {waivers.length > 0 && (
                <>
                  <p className="text-sm text-gray-500 mb-4">Your players&rsquo; waivers. Update a jersey number, phone number or emergency contact any time before the event.</p>
                  <ParentWaiverList waivers={waivers} onChange={setWaivers} />
                  {siblingEvents.length > 0 && (
                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 px-5 py-4" data-testid="add-sibling">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700"><UserPlus size={16} className="text-teal-600" /> Signing up a brother or sister?</div>
                      <p className="text-xs text-gray-500 mt-1">Their waiver opens with your family&rsquo;s details filled in, and it goes into this account too.</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {siblingEvents.map(e => (
                          <a key={e.id} href={`/tournaments/${e.id}/player-waiver?sibling=1`} className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-3 py-1.5 rounded-lg">{e.name || 'Player waiver'}</a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {linkedPlayers.length > 0 && (
                <div className={waivers.length ? 'mt-8' : ''}>
                  {waivers.length > 0 && <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Linked registrations</h2>}
                  <div className="space-y-2">
                    {linkedPlayers.map(p => (
                      <div key={p.id} className="bg-white border border-gray-200 rounded-xl px-5 py-3">
                        <div className="font-medium text-gray-800">{p.playerName}</div>
                        <div className="text-xs text-gray-400">{p.teamClubName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Discover tab */}
      {tab === 'discover' && (
        <div data-testid="parent-discover">
          <p className="text-sm text-gray-500 mb-4">Follow an event to see its schedule here.</p>
          {upcoming.length === 0 && <div className="text-center py-12 text-gray-400">No upcoming events listed yet.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upcoming.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="logo" className="w-12 h-12 object-contain rounded-xl border border-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 font-bold text-lg flex items-center justify-center flex-shrink-0">{t.name[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{t.name}</div>
                  <div className="text-xs text-gray-400">{[t.location, fmtDay(t.startDate) || 'TBD'].filter(Boolean).join(' · ')}</div>
                </div>
                {followed.includes(t.id) ? (
                  <button onClick={() => unfollowTournament(t.id)} className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Unfollow</button>
                ) : (
                  <button onClick={() => followTournament(t.id)} className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg">Follow</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
