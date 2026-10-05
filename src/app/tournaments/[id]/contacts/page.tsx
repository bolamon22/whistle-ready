'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import TournamentNav from '../TournamentNav'
import EventContacts from '@/components/contacts/EventContacts'

// A tournament's Contacts tab: its setup checklist (this event's Tasks, with
// the contact each depends on) beside the contacts tagged with it.

export default function TournamentContactsPage() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } })
      .catch(() => {})
  }, [id])

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 pb-24 sm:pb-6">
      <div className="max-w-6xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />
        <EventContacts tournamentId={id} />
      </div>
    </div>
  )
}
