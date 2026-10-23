'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PublicChirp from '@/components/PublicChirp'
import Link from 'next/link'
import { Clock, MapPin, Navigation, AlertTriangle, Megaphone, Map, Calendar, ChevronRight, CalendarDays, ScrollText, Search, FileSignature, Trophy, LogIn, X, Share, Users } from 'lucide-react'
import type { Game } from '@/lib/standings'
import { time12 } from '@/lib/time12'
import { GD_AUTO_OFF, gdTeamKey, type GameDayInfo } from '@/components/GameDayGate'

// The Game day screen (Bo, Oct 23 2026; lib/gameDay). A phone opens here during an
// event: find your team once (remembered on this phone, no login), then every visit
// starts on that team's next game, directions, field map and its games with scores.
// Player waiver stays one tap away because families are still signing them on site.

type T = { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string }
type MyTeam = { name: string; division: string }

const PLACEHOLDER = /^(seed\s|w-b\d|l-b\d|bracket\b|winner\b|loser\b|tbd$|tba$|bye$)/i

function startMs(date: string, t: string): number | null {
  if (!date || !t) return null
  let str = t.trim().toUpperCase(); let ap: string | null = null
  if (str.endsWith('AM')) { ap = 'AM'; str = str.slice(0, -2).trim() } else if (str.endsWith('PM')) { ap = 'PM'; str = str.slice(0, -2).trim() }
  const p = str.split(':'); let h = parseInt(p[0]) || 0; const m = parseInt(p[1]) || 0
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
  const dt = new Date(date + 'T00:00:00'); dt.setHours(h, m, 0, 0); return dt.getTime()
}
const fmtDay = (d: string) => { if (!d) return ''; const dt = new Date(d.slice(0, 10) + 'T12:00:00'); return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
const fmtShort = (d: string) => { if (!d) return ''; const dt = new Date(d.slice(0, 10) + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function fmtRange(a: string, b: string): string {
  if (!a) return ''
  if (!b || b.slice(0, 10) === a.slice(0, 10)) return fmtShort(a)
  const da = new Date(a.slice(0, 10) + 'T12:00:00'), db = new Date(b.slice(0, 10) + 'T12:00:00')
  return da.getMonth() === db.getMonth() ? `${fmtShort(a)}–${db.getDate()}` : `${fmtShort(a)}–${fmtShort(b)}`
}
function countdownLabel(ms: number | null, nowMs: number): string {
  if (ms === null) return ''
  const diff = ms - nowMs
  if (diff <= 0 && diff > -2 * 3600 * 1000) return 'Live now'
  if (diff <= 0) return ''
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  if (h < 24) return `in ${h}h${m ? ` ${m}m` : ''}`
  const days = Math.round(h / 24)
  return `in ${days} day${days > 1 ? 's' : ''}`
}
const store = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string | null) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { } },
}

export default function TodayPage() {
  const params = useParams() as any
  const id = String(params?.id || '')
  const [t, setT] = useState<T | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loaded, setLoaded] = useState(false)
  const [ann, setAnn] = useState<any | null>(null)
  const [info, setInfo] = useState<GameDayInfo | null>(null)
  const [team, setTeam] = useState<MyTeam | null>(null)
  const [q, setQ] = useState('')
  const [autoOn, setAutoOn] = useState(true)
  const [tip, setTip] = useState(false)
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (!id) return
    try { const m = JSON.parse(store.get(gdTeamKey(id)) || 'null'); if (m?.name) setTeam({ name: String(m.name), division: String(m.division || '') }) } catch { }
    setAutoOn(store.get(GD_AUTO_OFF) !== '1')
    let standalone = false
    try { standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true } catch { }
    setTip(!standalone && store.get('gd-tip-hidden') !== '1')
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => d && setT(d)).catch(() => { })
    fetch(`/api/tournaments/${id}/games?view=public`).then(r => r.ok ? r.json() : []).then(g => setGames(Array.isArray(g) ? g : [])).catch(() => { }).finally(() => setLoaded(true))
    fetch(`/api/tournaments/${id}/announcements`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.announcements) && d.announcements.length) setAnn(d.announcements[0]) }).catch(() => { })
    fetch(`/api/tournaments/${id}/game-day`).then(r => r.ok ? r.json() : null).then(d => d && setInfo(d)).catch(() => { })
    fetch('/api/auth/session').then(r => r.ok ? r.json() : null).then(s => setRole(String(s?.user?.role || ''))).catch(() => { })
  }, [id])

  const live = useMemo(() => games.filter(g => !g.isCanceled), [games])
  const teams = useMemo(() => {
    const seen: Record<string, MyTeam> = {}
    live.forEach(g => [g.team1, g.team2].forEach(n => {
      const name = (n || '').trim()
      if (!name || PLACEHOLDER.test(name)) return
      seen[`${g.division}|${name}`] = { name, division: g.division }
    }))
    return Object.values(seen).sort((a, b) => a.name.localeCompare(b.name) || a.division.localeCompare(b.division))
  }, [live])
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return teams.filter(x => x.name.toLowerCase().includes(s) || x.division.toLowerCase().includes(s)).slice(0, 12)
  }, [q, teams])

  const myGames = useMemo(() => !team ? [] : live
    .filter(g => g.division === team.division && (g.team1 === team.name || g.team2 === team.name))
    .map(g => ({ g, ms: startMs(g.date, g.startTime) }))
    .sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0)), [live, team])
  const next = myGames.find(x => (x.g.score1 == null || x.g.score2 == null) && x.ms !== null && x.ms > now - 2 * 3600 * 1000) || null
  const byDay = useMemo(() => {
    const out: { day: string; rows: typeof myGames }[] = []
    myGames.forEach(x => { const last = out[out.length - 1]; if (last && last.day === x.g.date) last.rows.push(x); else out.push({ day: x.g.date, rows: [x] }) })
    return out
  }, [myGames])
  const record = useMemo(() => {
    let w = 0, l = 0, tie = 0
    myGames.forEach(({ g }) => {
      if (g.score1 == null || g.score2 == null || g.isChampionship) return
      const mine = g.team1 === team?.name ? g.score1 : g.score2, theirs = g.team1 === team?.name ? g.score2 : g.score1
      if (mine > theirs) w++; else if (mine < theirs) l++; else tie++
    })
    return w + l + tie ? `${w}-${l}${tie ? `-${tie}` : ''}` : ''
  }, [myGames, team])

  const pick = (m: MyTeam | null) => { setTeam(m); setQ(''); store.set(gdTeamKey(id), m ? JSON.stringify(m) : null); try { window.scrollTo({ top: 0 }) } catch { } }
  const toggleAuto = () => { const on = !autoOn; setAutoOn(on); store.set(GD_AUTO_OFF, on ? null : '1') }
  const setMode = async (on: boolean) => {
    setBusy(true)
    try { const r = await fetch(`/api/tournaments/${id}/game-day`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }); if (r.ok) { const d = await r.json(); setInfo(i => ({ ...(i || { active: false }), off: d.off, active: !d.off && !!i?.inWindow })) } } catch { }
    setBusy(false)
  }

  const venue = t?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}` : `/tournaments/${id}/event?full=1#locations`
  const fieldMap = `/tournaments/${id}/event?full=1#locations`
  const schedHref = team ? `/tournaments/${id}/public?division=${encodeURIComponent(team.division)}&team=${encodeURIComponent(team.name)}&tab=schedule` : `/tournaments/${id}/public`
  const standHref = team ? `/tournaments/${id}/public?division=${encodeURIComponent(team.division)}&tab=standings` : `/tournaments/${id}/public`
  const tiles = [
    { icon: <FileSignature size={21} />, label: 'Player waiver', href: `/tournaments/${id}/player-waiver`, hot: true },
    { icon: <Calendar size={21} />, label: 'Full schedule', href: schedHref },
    { icon: <Trophy size={21} />, label: 'Standings', href: standHref },
    { icon: <Navigation size={21} />, label: 'Directions', href: venue },
    { icon: <Map size={21} />, label: 'Field map', href: fieldMap },
    { icon: <ScrollText size={21} />, label: 'Rules', href: `/tournaments/${id}/rules` },
  ]
  const staffRole = role === 'admin' || role === 'director'
  const nextEvent = info?.next

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <div className="max-w-md mx-auto">
        <div className="relative overflow-hidden bg-[#0b1f3a] text-white" data-testid="gd-header">
          {/* The event page's hero photo under a light navy wash: clearly visible (Bo), with
              enough shade and a text shadow to keep the white text readable. */}
          {info?.heroImage && <div className="absolute inset-0 bg-center bg-cover opacity-95" style={{ backgroundImage: `url(${info.heroImage})` }} aria-hidden />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1f3a]/35 via-[#0b1f3a]/45 to-[#0b1f3a]/80" aria-hidden />
          <div className="relative px-5 pt-5 pb-5 [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between mb-3 gap-2">
            <span className="text-teal-300 text-[11px] font-semibold tracking-[0.12em]">GAME DAY</span>
            <div className="flex items-center gap-1.5">
              <Link href="/login" data-testid="gd-login" className="text-[12px] text-slate-200 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white/10"><LogIn size={12} /> Log in</Link>
              <Link href={`/tournaments/${id}/event?full=1`} data-testid="gd-full-site" className="text-[12px] text-slate-200 border border-white/20 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white/10">Full site <ChevronRight size={12} /></Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {t?.logoUrl && <img src={t.logoUrl} alt="" className="w-11 h-11 rounded-lg object-contain bg-white/95 p-1 shrink-0" />}
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold leading-tight">{t?.name || 'Loading…'}</h1>
              {t && <div className="text-slate-300 text-xs mt-0.5 inline-flex items-center gap-1"><CalendarDays size={12} /> {fmtRange(t.startDate, t.endDate)}</div>}
            </div>
          </div>
          {!team && nextEvent && (
            <Link href={`/tournaments/${nextEvent.id}/event?full=1`} data-testid="gd-next-event" className="block mt-3 text-[12px] text-slate-300">
              Looking for the next one? <span className="text-teal-200 font-semibold">{nextEvent.name} · {fmtRange(nextEvent.startDate, nextEvent.endDate)}</span>
            </Link>
          )}
          </div>
        </div>

        <div className="p-3.5 space-y-3">
          {ann && (
            <div className={`flex gap-2.5 items-start rounded-xl px-3 py-2.5 border ${ann.urgent ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              {ann.urgent ? <AlertTriangle size={17} className="text-amber-600 mt-0.5 shrink-0" /> : <Megaphone size={16} className="text-teal-600 mt-0.5 shrink-0" />}
              <div className={`text-[12.5px] leading-snug ${ann.urgent ? 'text-amber-800' : 'text-slate-700'}`}>{ann.text}</div>
            </div>
          )}

          {!team ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4" data-testid="gd-find-team">
              <div className="text-[15px] font-bold text-slate-900">Find your team</div>
              <div className="text-xs text-slate-500 mt-0.5">We&apos;ll remember it on this phone. No login needed.</div>
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Club or team name" aria-label="Search for your team"
                  className="w-full min-h-[44px] pl-9 pr-9 rounded-xl border border-slate-200 bg-slate-50 text-[15px] focus:outline-none focus:ring-2 focus:ring-teal-400" />
                {q && <button onClick={() => setQ('')} aria-label="Clear" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 p-1"><X size={16} /></button>}
              </div>
              {matches.length > 0 && (
                <div className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {matches.map(m => (
                    <button key={`${m.division}|${m.name}`} onClick={() => pick(m)} className="w-full text-left px-3 py-2.5 min-h-[48px] hover:bg-slate-50 flex items-center gap-2">
                      <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900 truncate">{m.name}</div><div className="text-xs text-slate-500">{m.division}</div></div>
                      <ChevronRight size={15} className="text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {q.trim().length >= 2 && !matches.length && loaded && <div className="mt-3 text-sm text-slate-500">No team matches &ldquo;{q.trim()}&rdquo;. Try your club&apos;s name.</div>}
              {loaded && !teams.length && <div className="mt-3 text-sm text-slate-500">The schedule hasn&apos;t been posted yet. Check back soon.</div>}
              <Link href={`/tournaments/${id}/public`} className="mt-3 text-teal-700 text-[13px] font-semibold inline-flex items-center gap-1">Just browsing? See the full schedule <ChevronRight size={13} /></Link>
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4" data-testid="gd-my-team">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-slate-400 text-[11px] font-semibold tracking-wide">YOUR TEAM</div>
                    <div className="text-[17px] font-bold text-slate-900 leading-tight">{team.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{team.division}{record ? ` · ${record}` : ''}</div>
                  </div>
                  <button onClick={() => pick(null)} className="text-teal-700 text-[13px] font-semibold px-1 py-1 shrink-0">Change</button>
                </div>
                {next ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-[11px] font-semibold tracking-wide">UP NEXT</span>
                      {countdownLabel(next.ms, now) && <span className="bg-teal-50 text-teal-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{countdownLabel(next.ms, now)}</span>}
                    </div>
                    <div className="text-[16px] font-bold text-slate-900">vs {next.g.team1 === team.name ? next.g.team2 : next.g.team1}</div>
                    <div className="flex gap-3.5 mt-1.5 text-sm text-slate-600 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Clock size={14} /> {fmtDay(next.g.date)} · {time12(next.g.startTime)}</span>
                      {next.g.location && <span className="inline-flex items-center gap-1"><MapPin size={14} /> {next.g.location}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <a href={venue} target={venue.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><Navigation size={15} /> Directions</a>
                      <Link href={fieldMap} className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><Map size={15} /> Field map</Link>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500">{myGames.length ? 'No more games scheduled. Check standings for bracket results.' : 'No games posted for this team yet.'}</div>
                )}
              </div>

              {byDay.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" data-testid="gd-team-games">
                  {byDay.map(d => (
                    <div key={d.day}>
                      <div className="px-4 py-2 bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{fmtDay(d.day)}</div>
                      {d.rows.map(({ g, ms }) => {
                        const opp = g.team1 === team.name ? g.team2 : g.team1
                        const scored = g.score1 != null && g.score2 != null
                        const mine = g.team1 === team.name ? g.score1 : g.score2, theirs = g.team1 === team.name ? g.score2 : g.score1
                        const res = scored ? ((mine as number) > (theirs as number) ? 'W' : (mine as number) < (theirs as number) ? 'L' : 'T') : ''
                        const isLive = !scored && countdownLabel(ms, now) === 'Live now'
                        return (
                          <div key={g.id} className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-3">
                            <div className="w-16 shrink-0 text-[13px] font-semibold text-slate-700">{time12(g.startTime)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-900 truncate">vs {opp}</div>
                              <div className="text-xs text-slate-500 truncate">{g.location}{g.isChampionship ? ' · Championship' : ''}</div>
                            </div>
                            {scored ? <span className={`text-sm font-bold shrink-0 ${res === 'W' ? 'text-teal-700' : res === 'L' ? 'text-slate-500' : 'text-slate-700'}`}>{res} {mine}-{theirs}</span>
                              : isLive ? <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full shrink-0">Live</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map((tile, i) => (
              <Link key={i} href={tile.href} className={`border rounded-2xl py-3.5 flex flex-col items-center gap-1.5 hover:bg-slate-50 ${tile.hot ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-white border-slate-200 text-slate-700'}`}>
                <span className="text-teal-600">{tile.icon}</span>
                <span className="text-[11.5px] text-center leading-tight">{tile.label}</span>
              </Link>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">Always open the schedule first</div>
              <div className="text-xs text-slate-500">On this phone, during the event.</div>
            </div>
            <button role="switch" aria-checked={autoOn} onClick={toggleAuto} data-testid="gd-auto"
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${autoOn ? 'bg-teal-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoOn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {tip && (
            <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 bg-white border border-slate-200 text-[12.5px] text-slate-600">
              <Share size={15} className="text-teal-600 mt-0.5 shrink-0" />
              <div className="flex-1">Keep this one tap away: tap Share, then <span className="font-semibold text-slate-800">Add to Home Screen</span>.</div>
              <button onClick={() => { setTip(false); store.set('gd-tip-hidden', '1') }} aria-label="Hide tip" className="text-slate-400 p-0.5"><X size={14} /></button>
            </div>
          )}

          {staffRole && info && (
            <div className="rounded-xl px-3 py-2.5 bg-slate-200/60 text-[12.5px] text-slate-700 flex items-center gap-2" data-testid="gd-staff-switch">
              <Users size={14} className="text-slate-500 shrink-0" />
              <div className="flex-1">Staff: phones {info.off ? 'are not' : info.inWindow ? 'are' : 'will be'} sent here {info.inWindow || info.off ? '' : `from ${fmtShort(info.from || '')}`}</div>
              <button disabled={busy} onClick={() => setMode(!!info.off)} className="font-semibold text-teal-700 disabled:opacity-50">{info.off ? 'Turn on' : 'Turn off'}</button>
            </div>
          )}

          <div className="text-center pt-1">
            <Link href={`/tournaments/${id}/event?full=1`} className="text-teal-700 text-[12.5px] font-semibold inline-flex items-center gap-1">Full event page <ChevronRight size={13} /></Link>
          </div>
        </div>
      </div>
      <PublicChirp tournamentId={id} tournamentName={t?.name} />
    </div>
  )
}
