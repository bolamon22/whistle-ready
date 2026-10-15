'use client'

// Confirm your games (Bo, Oct 15 2026; lib/officialConfirm has the why). Reached from
// the "Confirm my games" button in an official's Notify officials email, or the To do
// card on their staff home. No login: the token in the URL is the key, like the
// teams' /confirm/<regId>. Every game starts as "Can work"; tapping one switches it to
// "Can't work" with an optional reason. Sending takes those games off their schedule
// right away and tells the assigner who asked, so the page asks once more first.
// Public because middleware lets /confirm through (listed as /confirm-games too).

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, CheckCircle2, MapPin } from 'lucide-react'
import { dayTitle, eventRange, time12 } from '@/lib/availabilityAnswers'

type Game = { key: string; gameId: string; role: string; roleLabel: string; date: string; time: string; field: string; num: string; division: string; teams: string; state: 'yes' | 'changed' | 'waiting'; at: string; locked: boolean; changeBy: string }
type Declined = { num: string; date: string; time: string; field: string; teams: string; note: string; at: string }
type Data = { event: { id: string; name: string; startDate: string; endDate: string; location: string }; orgName: string; name: string; first: string; asked: boolean; confirmBy: string; games: Game[]; declined: Declined[] }
type Result = { confirmed: number; declined: string[]; locked: string[]; gone: number }

const gamesWord = (n: number) => `${n} game${n === 1 ? '' : 's'}`

export default function ConfirmGamesPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [no, setNo] = useState<Record<string, boolean>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)   // "you'll come off these games" step
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    fetch(`/api/official-confirm/${encodeURIComponent(params.token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link isn’t working.'); return d })
      .then(setData)
      .catch(e => setError(e.message))
  }, [params.token])

  const days = useMemo(() => {
    const m = new Map<string, Game[]>()
    for (const g of data?.games || []) m.set(g.date, [...(m.get(g.date) || []), g])
    return Array.from(m.entries())
  }, [data])

  if (error && !data) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-slate-700 text-sm">{error}</p>
        <a href="/login" className="inline-block mt-4 text-sm font-bold text-teal-700 underline">Log in to Whistle Ready</a>
      </div>
    </div>
  )
  if (!data) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><p className="text-slate-400 text-sm">Loading…</p></div>

  const games = data.games
  const nos = games.filter(g => no[g.key])
  const yesCount = games.length - nos.length
  const allSet = games.length > 0 && games.every(g => g.state === 'yes')
  const by = data.confirmBy ? dayTitle(data.confirmBy, true) : ''

  async function send() {
    setBusy(true); setError('')
    try {
      const answers = games.map(g => no[g.key] ? { gameId: g.gameId, role: g.role, answer: 'no', note: notes[g.key] || '' } : { gameId: g.gameId, role: g.role, answer: 'yes' })
      const res = await fetch(`/api/official-confirm/${encodeURIComponent(params.token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error || 'That didn’t save. Try again.')
      setResult({ confirmed: d.confirmed || 0, declined: d.declinedNow || [], locked: d.locked || [], gone: d.gone || 0 })
      if (d.page) setData(d.page)
      setNo({}); setNotes({}); setChecking(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) { setError(e?.message || 'That didn’t save. Try again.') }
    finally { setBusy(false) }
  }

  const label = nos.length === 0 ? `Confirm my ${gamesWord(games.length)}`
    : yesCount === 0 ? `I can't work ${nos.length === 1 ? 'this game' : `these ${nos.length} games`}`
    : `Confirm ${gamesWord(yesCount)}, can't work ${nos.length}`

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center px-4 py-8 sm:py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#0f1f3d] px-5 sm:px-6 py-5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-teal-400 mb-1">{data.event.name.toUpperCase()}</p>
            <h1 className="text-lg font-bold text-white">{data.first}&rsquo;s games</h1>
            <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {eventRange(data.event.startDate, data.event.endDate) && <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{eventRange(data.event.startDate, data.event.endDate)}</span>}
              {data.event.location && <span className="inline-flex items-center gap-1"><MapPin size={12} />{data.event.location}</span>}
            </p>
          </div>

          <div className="p-4 sm:p-5 space-y-3">
            {result && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-sm text-emerald-900" role="status">
                <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={16} />Thanks, {data.first}.</p>
                {result.confirmed > 0 && <p className="mt-0.5">You&rsquo;re confirmed for {gamesWord(result.confirmed)}.</p>}
                {result.declined.length > 0 && <p className="mt-0.5">Your assigner was told you can&rsquo;t work {result.declined.length === 1 ? `game #${result.declined[0]}` : `games ${result.declined.map(n => `#${n}`).join(', ')}`}, and {result.declined.length === 1 ? 'it’s' : 'they’re'} off your schedule.</p>}
                {result.locked.length > 0 && <p className="mt-1 text-amber-800">{result.locked.map(n => `#${n}`).join(', ')} {result.locked.length === 1 ? 'is' : 'are'} less than 48 hours away, so {result.locked.length === 1 ? 'it' : 'they'} stayed on your schedule. Call or text the assigner.</p>}
                {result.gone > 0 && <p className="mt-1 text-slate-600">{result.gone === 1 ? 'One game' : `${result.gone} games`} had already changed. Here&rsquo;s your schedule now.</p>}
              </div>
            )}

            {games.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">You don&rsquo;t have any upcoming games at {data.event.name}.</p>
            ) : allSet && !result ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-900">
                <b>You&rsquo;re confirmed for all {gamesWord(games.length)}.</b> Plans changed? Tap a game you can&rsquo;t work.
              </div>
            ) : !allSet ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[13px] text-amber-900">
                <b>Please confirm{by ? ` by ${by}` : ''}.</b> Tap any game you can&rsquo;t work.
              </div>
            ) : null}

            {days.map(([date, list]) => (
              <div key={date}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mt-1 mb-1.5">{dayTitle(date)}</p>
                <div className="space-y-2">
                  {list.map(g => {
                    const off = !!no[g.key]
                    return (
                      <div key={g.key} className={`rounded-xl border px-3 py-2.5 ${off ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 min-w-0 text-[13px] leading-snug">
                            <p><b>{time12(g.time)}</b> · {g.field} · #{g.num}</p>
                            <p className="text-slate-500">{g.teams} · {g.roleLabel}</p>
                            {g.state === 'yes' && !off && <p className="text-[11px] font-bold text-emerald-700 mt-0.5 flex items-center gap-1"><Check size={12} />Confirmed</p>}
                            {g.state === 'changed' && <p className="text-[11px] font-bold text-sky-700 mt-0.5">Changed since you confirmed</p>}
                          </div>
                          {g.locked && !off ? (
                            <span className="shrink-0 text-[11px] text-slate-500 text-right leading-tight max-w-[7.5rem]">Less than 48 hours away: call or text the assigner</span>
                          ) : (
                            <button type="button" onClick={() => { setNo(n => ({ ...n, [g.key]: !n[g.key] })); setChecking(false) }} aria-pressed={off}
                              className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-bold transition-colors ${off ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}>
                              {off ? "Can't work" : '✓ Can work'}
                            </button>
                          )}
                        </div>
                        {off && (
                          <input value={notes[g.key] || ''} onChange={e => setNotes(n => ({ ...n, [g.key]: e.target.value }))} maxLength={300}
                            placeholder="Why? (optional, the assigner sees it)" aria-label={`Why you can't work #${g.num}`}
                            className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-red-300" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {games.length > 0 && (
              checking ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-900">
                  <p>You&rsquo;ll come off {nos.length === 1 ? `game #${nos[0].num}` : `games ${nos.map(g => `#${g.num}`).join(', ')}`}, and your assigner will be told{yesCount > 0 ? `. Your other ${gamesWord(yesCount)} will be confirmed` : ''}.</p>
                  <div className="flex gap-2 mt-2.5">
                    <button type="button" onClick={send} disabled={busy} className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm disabled:opacity-50">{busy ? 'Sending…' : 'Yes, send it'}</button>
                    <button type="button" onClick={() => setChecking(false)} disabled={busy} className="px-4 text-sm text-slate-600">Back</button>
                  </div>
                </div>
              ) : (!allSet || nos.length > 0) && (
                <button type="button" onClick={() => nos.length ? setChecking(true) : send()} disabled={busy}
                  className={`w-full h-12 rounded-xl text-white font-bold text-sm disabled:opacity-50 ${nos.length && !yesCount ? 'bg-red-600 hover:bg-red-500' : 'bg-teal-700 hover:bg-teal-600'}`}>
                  {busy ? 'Saving…' : label}
                </button>
              )
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}

            {data.declined.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">You told the assigner you can&rsquo;t work</p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                  {data.declined.map((d, i) => (
                    <div key={i} className="px-3 py-2 text-[12px] text-slate-600">
                      <b className="text-slate-800">{dayTitle(d.date, true)} {time12(d.time)}</b> · {d.field} · #{d.num}
                      {d.note && <span className="block text-slate-500">&ldquo;{d.note}&rdquo;</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">Your whole schedule is in <a href="/dashboard/ref" className="underline">My games</a>. Questions? Reply to the email that brought you here.</p>
      </div>
    </div>
  )
}
