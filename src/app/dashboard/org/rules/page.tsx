'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, ChevronDown, ScrollText, Plus, Save, Pencil, X, Trash2, Link2, Check } from 'lucide-react'
import MarkdownField from '@/components/MarkdownField'
import AiGenerateButton from '@/components/AiGenerateButton'
import { RuleSet, uidRule } from '@/lib/rules'

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'

function RulesInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role
  const sp = useSearchParams()
  const qOrg = sp.get('org') || ''
  const apiQ = qOrg ? `?org=${encodeURIComponent(qOrg)}` : ''
  const [orgName, setOrgName] = useState(sp.get('name') || '')
  const [sets, setSets] = useState<RuleSet[]>([])
  const [tourns, setTourns] = useState<any[]>([])
  const [links, setLinks] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [applyOpen, setApplyOpen] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.replace('/login'); return }
    if (role !== 'director' && role !== 'admin') { router.replace('/'); return }
    ;(async () => {
      try {
        if (!qOrg) { const o = await fetch('/api/org').then(r => r.ok ? r.json() : null); if (o) setOrgName(o.name) }
        const d = await fetch(`/api/org-rules${apiQ}`).then(r => r.ok ? r.json() : { sets: [] })
        setSets(Array.isArray(d.sets) ? d.sets : [])
        fetch(`/api/tournaments${qOrg ? `?viewOrgId=${encodeURIComponent(qOrg)}` : ''}`).then(r => r.ok ? r.json() : []).then(ts => setTourns(Array.isArray(ts) ? ts : [])).catch(() => {})
        fetch(`/api/org-rules/apply${apiQ}`).then(r => r.ok ? r.json() : { links: {} }).then(d => setLinks(d.links || {})).catch(() => {})
      } catch {} finally { setLoading(false) }
    })()
  }, [status, session, role])

  async function saveSets(next: RuleSet[]) {
    setSaving(true)
    try {
      const res = await fetch(`/api/org-rules${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sets: next }) })
      if (res.ok) { toast.success('Saved'); setSets(next) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Save failed') }
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }
  const patch = (id: string, p: Partial<RuleSet>) => setSets(s => s.map(x => x.id === id ? { ...x, ...p } : x))
  function addSet() {
    const ns: RuleSet = { id: uidRule(), name: 'New rule set', format: '', body: '' }
    const next = [...sets, ns]; setSets(next); setOpen(o => ({ ...o, [ns.id]: true })); setEditing(e => ({ ...e, [ns.id]: true }))
  }
  async function removeSet(id: string) {
    if (links && Object.values(links).includes(id)) { if (!confirm('Some events are linked to this rule set. Delete anyway? Those events will fall back to their own custom rules.')) return }
    await saveSets(sets.filter(x => x.id !== id))
  }
  async function apply(setId: string, ids: string[], detach = false) {
    try {
      const res = await fetch(`/api/org-rules/apply${apiQ}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setId, tournamentIds: ids, detach }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setLinks(prev => { const n = { ...prev }; ids.forEach(id => { if (detach) delete n[id]; else n[id] = setId }); return n })
        toast.success(detach ? 'Unlinked' : `Applied to ${d.applied} event${d.applied === 1 ? '' : 's'}`)
      } else toast.error(d.error || 'Failed')
    } catch { toast.error('Failed') }
  }

  if (loading) return <div className="text-slate-400 text-center py-16">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto pb-16 px-4">
      <Toaster position="top-right" />
      <div className="mb-6 pt-6">
        <Link href="/dashboard/org" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"><ChevronLeft size={14} /> Your team</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Rules library</h1>
        <p className="text-sm text-slate-500">Reusable rule sets for {orgName || 'your organization'}. Apply a set to multiple events; edits flow to every linked event. Outliers can use their own custom rules on the event page.</p>
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={addSet} className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Plus size={15} /> New rule set</button>
      </div>

      {sets.length === 0 && <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400"><ScrollText size={28} className="mx-auto mb-2" />No rule sets yet. Create one (e.g. &ldquo;Sixes Rules&rdquo;).</div>}

      {sets.map(rs => {
        const linkedIds = Object.entries(links).filter(([, sid]) => sid === rs.id).map(([tid]) => tid)
        return (
          <section key={rs.id} className="card bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
            <button onClick={() => setOpen(o => ({ ...o, [rs.id]: !o[rs.id] }))} className="w-full flex items-center gap-3 p-4 text-left">
              <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0"><ScrollText size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><h2 className="font-semibold text-slate-800 truncate">{rs.name || 'Untitled'}</h2>{rs.format && <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{rs.format}</span>}</div>
                <p className="text-xs text-slate-400 mt-0.5">Applied to {linkedIds.length} event{linkedIds.length === 1 ? '' : 's'}</p>
              </div>
              <ChevronDown size={18} className={`text-slate-400 flex-shrink-0 transition-transform ${open[rs.id] ? 'rotate-180' : ''}`} />
            </button>
            {open[rs.id] && (
              <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                <div className="flex justify-end gap-2 mb-3">
                  {editing[rs.id]
                    ? <><button onClick={() => setEditing(e => ({ ...e, [rs.id]: false }))} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><X size={14} /> Done</button>
                        <button onClick={() => saveSets(sets)} disabled={saving} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-4 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button></>
                    : <button onClick={() => setEditing(e => ({ ...e, [rs.id]: true }))} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><Pencil size={14} /> Edit</button>}
                  <button onClick={() => removeSet(rs.id)} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><Trash2 size={14} /></button>
                </div>
                {editing[rs.id] ? (
                  <>
                    <label className={labelCls}>Name</label>
                    <input className={inputCls} value={rs.name} onChange={e => patch(rs.id, { name: e.target.value })} placeholder="Sixes Rules" />
                    <label className={labelCls}>Format / tag (optional)</label>
                    <input className={inputCls} value={rs.format || ''} onChange={e => patch(rs.id, { format: e.target.value })} placeholder="Sixes · Traditional · 7v7" />
                    <label className={labelCls}>Rules</label>
                    <AiGenerateButton kind="custom" current={rs.body} onResult={(t) => patch(rs.id, { body: t })} />
                    <MarkdownField value={rs.body} onChange={val => patch(rs.id, { body: val })} minHeight={200} placeholder="Tournament rules and policies…" />
                  </>
                ) : (
                  <div className="text-sm text-slate-600 whitespace-pre-line max-h-48 overflow-y-auto bg-slate-50 rounded-lg p-3 border border-slate-100">{rs.body || <span className="text-slate-400">No rules text yet.</span>}</div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button onClick={() => setApplyOpen(a => ({ ...a, [rs.id]: !a[rs.id] }))} className="text-sm font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"><Link2 size={14} /> Apply to events</button>
                  {applyOpen[rs.id] && (
                    <div className="mt-2 border border-slate-200 rounded-xl p-3 max-h-72 overflow-y-auto">
                      {tourns.length === 0 ? <p className="text-sm text-slate-400">No tournaments found.</p> : tourns.map((t: any) => {
                        const linkedHere = links[t.id] === rs.id
                        const linkedElsewhere = links[t.id] && links[t.id] !== rs.id
                        return (
                          <label key={t.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                            <input type="checkbox" className="accent-teal-500 w-4 h-4" checked={!!linkedHere} onChange={e => apply(rs.id, [String(t.id)], !e.target.checked)} />
                            <span className="text-sm text-slate-700">{t.name}</span>
                            {linkedHere && <Check size={14} className="text-teal-600" />}
                            {linkedElsewhere && <span className="text-[11px] text-amber-600">linked to another set</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export default function RulesLibraryPage() {
  return <Suspense fallback={null}><RulesInner /></Suspense>
}
