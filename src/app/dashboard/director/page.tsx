'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Target, Radio, Megaphone, LayoutDashboard, Globe, Users, Trophy, UserPlus, ArrowRight, Sparkles } from 'lucide-react'

interface Tournament {
  id: string; name: string; startDate: string; endDate: string
  location: string; logoUrl: string; sport: string
  _count: { games: number }
}

const fmt = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''

export default function DirectorDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    fetch('/api/tournaments').then(r => r.json()).then(d => { setTournaments(Array.isArray(d) ? d : []); setLoading(false) })
  }, [status])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-sm text-slate-400">Director</p>
          <h1 className="text-2xl font-bold text-slate-800">Hi, {session?.user?.name?.split(' ')[0] || 'there'}</h1>
        </div>
        <Link href="/dashboard/org" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-2 rounded-lg whitespace-nowrap"><Users size={15} /> Your team</Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-1"><Sparkles size={18} className="text-teal-600" /> Welcome to Whistle Ready</h2>
          <p className="text-sm text-slate-500 mb-5">You're all set up. Here's how to get your organization rolling:</p>
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-teal-300 transition-colors">
              <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold flex-shrink-0">1</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><Trophy size={15} className="text-teal-600" /> Add your first tournament</div>
                <div className="text-xs text-slate-400">Set the dates, sport, divisions, and fields.</div>
              </div>
              <ArrowRight size={16} className="text-slate-300 flex-shrink-0" />
            </Link>
            <Link href="/dashboard/org" className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-teal-300 transition-colors">
              <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold flex-shrink-0">2</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><UserPlus size={15} className="text-teal-600" /> Add your staff &amp; admins</div>
                <div className="text-xs text-slate-400">Invite schedulers, assigners, refs, and field staff — they get an email to set up their account.</div>
              </div>
              <ArrowRight size={16} className="text-slate-300 flex-shrink-0" />
            </Link>
          </div>
          <p className="text-xs text-slate-400 mt-5">Once your first tournament is added, your game-day tools show up right here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map(t => {
            const actions = [
              { href: `/tournaments/${t.id}/dashboard`, Icon: LayoutDashboard, label: 'Manage' },
              { href: `/tournaments/${t.id}/scores`, Icon: Target, label: 'Scores' },
              { href: `/tournaments/${t.id}/ops`, Icon: Radio, label: 'Field Req' },
              { href: `/tournaments/${t.id}/broadcast`, Icon: Megaphone, label: 'Broadcast' },
            ]
            return (
              <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  {t.logoUrl
                    ? <img src={t.logoUrl} alt="" className="w-11 h-11 rounded-xl object-contain border border-slate-100 flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 font-bold flex items-center justify-center flex-shrink-0">{t.name?.[0] || 'T'}</div>}
                  <div className="min-w-0 flex-1">
                    <Link href={`/tournaments/${t.id}/dashboard`} className="font-semibold text-slate-800 hover:text-teal-700 block truncate">{t.name}</Link>
                    <p className="text-xs text-slate-400 truncate">{fmt(t.startDate)}{t.endDate && t.endDate !== t.startDate ? `–${fmt(t.endDate)}` : ''} · {t._count?.games ?? 0} games{t.location ? ` · ${t.location.split(',')[0]}` : ''}</p>
                  </div>
                  <Link href={`/tournaments/${t.id}/public`} title="Public view" className="text-slate-400 hover:text-teal-600 flex-shrink-0"><Globe size={16} /></Link>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {actions.map(a => (
                    <Link key={a.label} href={a.href}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-medium transition-colors">
                      <a.Icon size={16} className="text-teal-600" />{a.label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
