'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing, Share, SquarePlus } from 'lucide-react'
import { pushSupport, subscribeThisBrowser, deviceLabel, deviceId as getDeviceId } from '@/lib/pushClient'

// Getting a COACH onto the same alert rail their parents are already on.
//
// Parents follow a team by tapping Follow on the public schedule, and from then
// on they hear every publish, move and final (lib/follows, lib/scheduleDigest,
// lib/finalAlerts). Coaches were never in that loop: nothing in the app made a
// coach a follower, so the one person on the sideline who most needs to know a
// field changed heard it last -- usually from a parent. Bo, Oct 14.
//
// The fix is deliberately NOT a new delivery channel. A coach's teams are
// already known exactly: the waiver makes them pick from the event's registered
// clubs, so `teams` here carries the app's own spelling of (division, name) and
// canonicalTeam() matches it every time. So this is one tap that follows those
// teams on this phone and turns on web push -- the rail that already exists,
// already fans out, and costs nothing per message.
//
// Not automatic on page load. A follow we made for them would be a follow they
// never chose, and the browser's permission prompt fired without an explanation
// gets denied -- and a denial sticks until someone digs through browser
// settings. So: say what arrives, then ask.

export type CoachTeam = { team: string; division: string }

type Tone = 'dark' | 'light'

const SKIN: Record<Tone, { box: string; head: string; sub: string; note: string; btn: string; ghost: string }> = {
  dark: {
    box: 'rounded-xl border border-white/10 bg-white/5 px-4 py-4',
    head: 'text-sm font-bold text-white',
    sub: 'text-[13px] text-slate-300 leading-relaxed',
    note: 'text-xs text-slate-400',
    btn: 'w-full rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50',
    ghost: 'text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4',
  },
  light: {
    box: 'rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-5 text-left',
    head: 'text-sm font-bold text-slate-900',
    sub: 'text-[13px] text-slate-600 leading-relaxed',
    note: 'text-xs text-slate-400',
    btn: 'w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50',
    ghost: 'text-xs text-slate-400 hover:text-slate-600 underline underline-offset-4',
  },
}

/** "Ghost 2030", "Ghost 2030 and Reign HS", "Ghost 2030, Reign HS and one more". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] || 'your team'
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

export default function CoachTeamAlerts({ tournamentId, teams, tone = 'dark' }: {
  tournamentId: string
  teams: CoachTeam[]
  tone?: Tone
}) {
  // A team is a (division, name) pair everywhere in the app; one without a
  // division cannot be matched to anything and is not offered.
  const mine = teams.filter(t => t.team?.trim() && t.division?.trim())
  const s = SKIN[tone]

  const [device, setDevice] = useState('')
  const [on, setOn] = useState(false)          // this phone has a push subscription
  const [followed, setFollowed] = useState(0)  // how many of `mine` it already follows
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const { supported, needsInstall } = pushSupport()

  const refresh = useCallback(async (id: string) => {
    try {
      const [f, d] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/follows?device=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => ({ following: [] })),
        fetch(`/api/follows/device?device=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => ({ enabled: false })),
      ])
      const have = new Set((f?.following || []).map((t: CoachTeam) => `${t.division}|${t.team}`.toLowerCase()))
      setFollowed(mine.filter(t => have.has(`${t.division}|${t.team}`.toLowerCase())).length)
      setOn(!!d?.enabled)
    } catch { /* the card just shows the un-set-up state */ }
    setLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, JSON.stringify(mine)])

  useEffect(() => {
    const id = getDeviceId()
    setDevice(id)
    if (id) void refresh(id)
    else setLoaded(true)
  }, [refresh])

  async function turnOn() {
    if (!device || busy) return
    setBusy(true); setErr('')
    try {
      // Follow first. If the browser then refuses notifications the follows
      // still stand, and turning alerts on later from the schedule page picks
      // these teams up -- nothing has to be done twice.
      for (const t of mine) {
        await fetch(`/api/tournaments/${tournamentId}/follows`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: device, division: t.division, teamName: t.team, follow: true }),
        })
      }
      if (supported) {
        const r = await subscribeThisBrowser()
        if (!r.ok) {
          setErr(r.reason === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser settings, then tap again — your teams are already followed.'
            : 'This browser can’t receive notifications, but your teams are followed. Open this page in Chrome or Safari on your phone.')
        } else {
          await fetch('/api/follows/device', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: device, subscription: r.subscription, label: deviceLabel() }),
          })
        }
      }
      await refresh(device)
    } catch {
      setErr('Could not turn alerts on just now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (!mine.length) return null

  const names = listNames(mine.map(t => t.team))
  const allSet = on && followed === mine.length

  return (
    <div className={s.box}>
      <div className="flex items-center gap-2 mb-1.5">
        {allSet ? <BellRing size={15} className={tone === 'dark' ? 'text-emerald-300' : 'text-emerald-600'} />
                : <Bell size={15} className={tone === 'dark' ? 'text-rose-300' : 'text-teal-600'} />}
        <h3 className={s.head}>{allSet ? 'Game-day alerts are on' : 'Game-day alerts'}</h3>
      </div>

      {allSet ? (
        <p className={s.sub}>
          This phone gets an alert when the schedule is published, when a game of {names} moves to a new time or
          field, and at every final. Nothing else.
        </p>
      ) : needsInstall ? (
        <>
          <p className={s.sub}>
            iPhone only sends alerts to a site you&rsquo;ve added to your Home Screen. Two taps:
          </p>
          <ol className={`mt-2.5 space-y-1.5 ${s.sub}`}>
            <li className="flex items-center gap-2"><Share size={13} className="shrink-0" /> Tap <strong>Share</strong> in Safari</li>
            <li className="flex items-center gap-2"><SquarePlus size={13} className="shrink-0" /> Tap <strong>Add to Home Screen</strong>, then open this page from there</li>
          </ol>
        </>
      ) : (
        <>
          <p className={s.sub}>
            If a game of {names} moves to a different time or field, your phone buzzes — instead of you hearing it
            from a parent. Also when the schedule is published, and at every final.
          </p>
          {err && <p className={`mt-2.5 text-xs ${tone === 'dark' ? 'text-rose-300' : 'text-rose-600'}`}>{err}</p>}
          {loaded && (
            <button type="button" onClick={turnOn} disabled={busy || !device} className={`mt-3.5 ${s.btn}`}>
              <Bell size={15} /> {busy ? 'Turning on…' : 'Turn on alerts'}
            </button>
          )}
          {!device && loaded && (
            <p className={`mt-2 ${s.note}`}>
              Your browser is blocking site storage, so alerts can&rsquo;t be set up here. Turn off private browsing and reload.
            </p>
          )}
        </>
      )}
    </div>
  )
}
