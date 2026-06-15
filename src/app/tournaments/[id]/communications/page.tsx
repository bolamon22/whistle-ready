'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, Radio, TriangleAlert, ChevronLeft, MessageSquare, Users } from 'lucide-react'
import BroadcastPage from '../broadcast/page'
import OpsBoardPage from '../ops/page'
import IncidentsPage from '../incidents/page'
import DirectoryPage from '../directory/page'

const TABS = [
  { key: 'ops',       label: 'Field Request', icon: Radio },
  { key: 'broadcast', label: 'Broadcast',     icon: Megaphone },
  { key: 'incidents', label: 'Incidents',     icon: TriangleAlert },
  { key: 'contacts',  label: 'Contacts',      icon: Users },
] as const

type TabKey = typeof TABS[number]['key']

export default function CommunicationsPage() {
  const { id } = useParams()
  const [tab, setTab] = useState<TabKey>('ops')

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/tournaments/${id}/dashboard`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Dashboard</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-1"><MessageSquare size={22} className="text-teal-600" /> Communications</h1>
      <p className="text-sm text-slate-500 mb-4">Field requests, broadcasts, incident logging, and staff contacts — all in one place.</p>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {TABS.map(t => {
          const Icon = t.icon
          const on = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${on ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'broadcast' && <BroadcastPage embedded />}
      {tab === 'ops'       && <OpsBoardPage embedded />}
      {tab === 'incidents' && <IncidentsPage embedded />}
      {tab === 'contacts'  && <DirectoryPage embedded />}
    </div>
  )
}
