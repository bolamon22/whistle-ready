'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'

type Status = 'todo' | 'in-progress' | 'done'

interface RoadmapItem {
  id: string
  title: string
  description: string
  status: Status
  createdAt: string
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; next: Status }> = {
  'todo':        { label: 'To Do',       color: 'bg-slate-100 text-slate-600 border-slate-200',     next: 'in-progress' },
  'in-progress': { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200',         next: 'done' },
  'done':        { label: 'Done',        color: 'bg-green-100 text-green-700 border-green-200',       next: 'todo' },
}

export default function RoadmapPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as any)?.role !== 'admin') { router.replace('/'); return }
    fetch('/api/admin/roadmap')
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
  }, [session, status])

  useEffect(() => {
    if (!statusDropdown) return
    const close = () => setStatusDropdown(null)
    document.addEventListener('click', close, true)
    return () => document.removeEventListener('click', close, true)
  }, [statusDropdown])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    const res = await fetch('/api/admin/roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    const item = await res.json()
    setItems(prev => [item, ...prev])
    setTitle(''); setDescription('')
    toast.success('Item added')
    setAdding(false)
  }

  async function setStatus(item: RoadmapItem, next: Status) {
    setStatusDropdown(null)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
    await fetch(`/api/admin/roadmap/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/admin/roadmap/${id}`, { method: 'DELETE' })
    toast.success('Deleted')
  }

  async function saveEdit(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, title: editTitle, description: editDesc } : i))
    setEditingId(null)
    await fetch(`/api/admin/roadmap/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDesc }),
    })
    toast.success('Saved')
  }

  const counts = { todo: 0, 'in-progress': 0, done: 0 }
  items.forEach(i => { counts[i.status]++ })
  const filtered = filterStatus === 'all' ? items : items.filter(i => i.status === filterStatus)

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin/users" className="text-xs text-blue-600 hover:underline">← Admin</Link>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Feature Roadmap</h1>
            <p className="text-sm text-slate-500">Internal feature request &amp; tracking board</p>
          </div>
          <div className="flex gap-2 text-xs">
            {(['todo', 'in-progress', 'done'] as Status[]).map(s => (
              <span key={s} className={`px-2 py-1 rounded-full border font-medium ${STATUS_CONFIG[s].color}`}>
                {STATUS_CONFIG[s].label}: {counts[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

        {/* Add form */}
        <form onSubmit={addItem} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Add Feature Request</h2>
          <input
            type="text" placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <textarea
            placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button type="submit" disabled={adding || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
            {adding ? 'Adding…' : '+ Add Item'}
          </button>
        </form>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'todo', 'in-progress', 'done'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {s === 'all' ? `All (${items.length})` : `${STATUS_CONFIG[s].label} (${counts[s]})`}
            </button>
          ))}
        </div>

        {/* Items list */}
        {filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">No items yet. Add one above.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(item.id)}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{item.title}</span>
                        <div className="relative">
                          <button onClick={() => setStatusDropdown(statusDropdown === item.id ? null : item.id)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_CONFIG[item.status].color}`}>
                            {STATUS_CONFIG[item.status].label} ▾
                          </button>
                          {statusDropdown === item.id && (
                            <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-xs min-w-[120px]">
                              {(['todo', 'in-progress', 'done'] as Status[]).map(s => (
                                <button key={s} onClick={() => setStatus(item, s)}
                                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 ${item.status === s ? 'font-semibold' : ''}`}>
                                  <span className={`inline-block w-2 h-2 rounded-full ${s === 'todo' ? 'bg-slate-400' : s === 'in-progress' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                  {STATUS_CONFIG[s].label}
                                  {item.status === s && ' ✓'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1.5">
                        Added {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setEditingId(item.id); setEditTitle(item.title); setEditDesc(item.description) }}
                        className="text-slate-400 hover:text-slate-600 text-sm px-1.5 py-1 rounded" title="Edit">✏️</button>
                      <button onClick={() => deleteItem(item.id)}
                        className="text-slate-400 hover:text-red-500 text-sm px-1.5 py-1 rounded" title="Delete">🗑</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
