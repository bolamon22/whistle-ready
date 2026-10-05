'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { localToday, type TaskTournament } from '@/lib/taskTemplate'
import type { ContactRow, ContactView } from '@/lib/contactTypes'

// Loads the directory (or one tournament's contacts) and saves changes as you
// make them, the way the task board does.

export type ContactsData = { contacts: ContactRow[]; tournaments: TaskTournament[]; today: string }

export function useContacts(tournamentId?: string) {
  const [data, setData] = useState<ContactsData | null>(null)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/contacts${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFailed(d.error || 'Could not load contacts'); return }
      setData({ contacts: d.contacts || [], tournaments: d.tournaments || [], today: d.today || localToday() })
      setFailed('')
    } catch { setFailed('Could not load contacts') }
  }, [tournamentId])
  useEffect(() => { load() }, [load])
  // A task linked or checked off elsewhere on the page changes the open counts.
  useEffect(() => {
    window.addEventListener('tasks-changed', load)
    return () => window.removeEventListener('tasks-changed', load)
  }, [load])

  /** Put a saved contact in the list (new or edited), keeping its open tasks. */
  const upsert = useCallback((c: ContactView) => {
    setData(d => {
      if (!d) return d
      const has = d.contacts.some(x => x.id === c.id)
      // On a tournament's page, a contact untagged from it drops off.
      const belongs = !tournamentId || c.everyEvent || c.events.includes(tournamentId)
      const contacts = has
        ? d.contacts.flatMap(x => x.id === c.id ? (belongs ? [{ ...x, ...c }] : []) : [x])
        : belongs ? [...d.contacts, { ...c, openTasks: [] }] : d.contacts
      return { ...d, contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)) }
    })
  }, [tournamentId])

  const patch = useCallback(async (c: ContactRow, body: Partial<ContactView>) => {
    setData(d => d && { ...d, contacts: d.contacts.map(x => x.id === c.id ? { ...x, ...body } : x) })
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(c.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) throw new Error(d.error || 'Could not save')
      upsert(d.contact)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
      load()
    }
  }, [load, upsert])

  const remove = useCallback(async (c: ContactRow) => {
    setData(d => d && { ...d, contacts: d.contacts.filter(x => x.id !== c.id) })
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(c.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not delete')
      toast.success('Contact deleted')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
      load()
    }
  }, [load])

  return { data, failed, load, upsert, patch, remove }
}
