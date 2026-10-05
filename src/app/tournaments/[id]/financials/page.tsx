'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { BarChart3, Wallet, ClipboardList, Store, Users, Plus, Pencil, Trash2, Calculator } from 'lucide-react'
import type { CostView } from '@/lib/costTypes'
import type { ContactRow } from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'
import { buildFinance, type FinDoc, type PlanLine } from '@/lib/finance'
import { costLabel, type CostEvent } from '@/components/costs/useCosts'
import OverviewTab from '@/components/financials/OverviewTab'
import BudgetTab from '@/components/financials/BudgetTab'
import TournamentNav from '../TournamentNav'
import { Card } from '@/components/ui'

interface Transaction {
  id: string; type: 'income' | 'expense'; category: string
  description: string; amount: number; method: string; date: string; notes: string
}
interface Registration {
  id: string; clubName: string; clubContact: string; invoiceAmount: number
  discountAmount: number; paymentMethod: string; needsHotel: string
  teams: { id: string }[]
  payments: { amount: number }[]
}
interface IndividualReg {
  id: string; firstName: string; lastName: string; email: string
  feeTierName: string; feeTierAmount: number; paymentStatus: string; createdAt: string
}
interface StaffEntry {
  worker: { id: string; name: string; payMethod: string; payHandle: string | null }
  games: { pay: number }[]
  timeEntries: { pay: number }[]
  totalPay: number
}

const EXPENSE_CATEGORIES = [
  { value: 'facility',  label: 'Facility / Fields' },
  { value: 'rental',    label: 'Rentals' },
  { value: 'supplies',  label: 'Field Supplies' },
  { value: 'awards',    label: 'Awards & Trophies' },
  { value: 'merch',     label: 'Merchandise (Cost)' },
  { value: 'marketing', label: 'Marketing & Printing' },
  { value: 'insurance', label: 'Insurance / Permits' },
  { value: 'other_exp', label: 'Other Expense' },
]
const INCOME_CATEGORIES = [
  { value: 'vendor_fee',  label: 'Vendor Fee' },
  { value: 'merch_sales', label: 'Merchandise Sales' },
  { value: 'sponsorship', label: 'Sponsorship' },
  { value: 'gate',        label: 'Gate / Admission' },
  { value: 'other_inc',   label: 'Other Income' },
]
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
const METHODS = ['check', 'zelle', 'credit_card', 'cash', 'venmo', 'wire']
const methodLabel = (m: string) => ({ check: 'Check', zelle: 'Zelle', credit_card: 'Credit Card', cash: 'Cash', venmo: 'Venmo', wire: 'Wire' }[m] ?? m)
const catLabel  = (c: string) => ALL_CATEGORIES.find(x => x.value === c)?.label ?? c
const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Today on the viewer's own calendar; toISOString() is UTC, so after 8pm in Florida it said tomorrow.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
// A stored YYYY-MM-DD is a calendar day, not an instant: new Date('2026-10-05') is UTC midnight, which shows as Oct 4 in Florida.
const showDate = (ymd: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString() : ymd }
const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
/** A vendor application, as /api/tournaments/[id]/vendor-requests returns it. */
type VendorSub = {
  id: string
  status?: string
  amountDue?: number
  paymentStatus?: string
  data?: { companyName?: string; vendorTypeName?: string; level?: string }
}

const EMPTY_FORM = { type: 'expense' as 'income' | 'expense', category: 'facility', description: '', amount: '', method: 'check', date: today(), notes: '' }

export default function FinancialsPage() {
  const { id: tournamentId } = useParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [individualRegs, setIndividualRegs] = useState<IndividualReg[]>([])
  const [staffSummary, setStaffSummary]   = useState<StaffEntry[]>([])
  const [staffPaidIds, setStaffPaidIds]   = useState<Set<string>>(new Set())
  // Vendor booth fees. Real money that this page could not see: an approved booth
  // carries amountDue, and the Stripe webhook flips paymentStatus when it settles,
  // but neither reached Total Revenue or Net Cash. GOAT USA was approved for $600 on
  // Monster Mash and appeared nowhere on the P&L (Bo, Sep 29 2026).
  const [vendors, setVendors] = useState<VendorSub[]>([])
  const [loading, setLoading] = useState(true)
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'budget' | 'other'>('summary')
  // The redesign's data (Oct 5 2026): vendor bills (cost lines), the event's
  // documents, its budget plan and its contacts (for the vendor emails).
  const [costs, setCosts] = useState<CostView[]>([])
  const [costEvents, setCostEvents] = useState<CostEvent[]>([])
  const [docs, setDocs] = useState<FinDoc[]>([])
  const [plan, setPlan] = useState<PlanLine[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [taskTournaments, setTaskTournaments] = useState<TaskTournament[]>([])
  const [contactsToday, setContactsToday] = useState('')

  const load = () => {
    Promise.all([
      fetch(`/api/tournaments/${tournamentId}/transactions`).then(r => r.json()),
      fetch(`/api/registrations?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}/pay-summary`).then(r => r.json()),
      fetch(`/api/payment-records?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}/individual-reg`).then(r => r.json()),
      // Tolerated separately: a tournament with no vendor form configured still has
      // a P&L, and this page failing whole because of it would be the worse bug.
      fetch(`/api/tournaments/${tournamentId}/vendor-requests`).then(r => r.ok ? r.json() : { submissions: [] }).catch(() => ({ submissions: [] })),
    ]).then(([txs, regs, paySummary, payRecords, t, indivRegs, vend]) => {
      loadExtras()
      setTransactions(txs)
      setRegistrations(regs)
      setIndividualRegs(Array.isArray(indivRegs) ? indivRegs : [])
      setStaffSummary(paySummary.summary || [])
      setStaffPaidIds(new Set(payRecords.map((p: { workerId: string }) => p.workerId)))
      setTournamentName(t.name || '')
      if (t.logoUrl) setTournamentLogo(t.logoUrl)
      setVendors(Array.isArray(vend?.submissions) ? vend.submissions : [])
      setLoading(false)
    })
  }

  // Each tolerated on its own: the P&L still shows if one of these fails.
  const loadExtras = useCallback(() => {
    const q = encodeURIComponent(String(tournamentId))
    fetch(`/api/costs?tournamentId=${q}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setCosts(d.costs || []); setCostEvents(d.tournaments || []) } }).catch(() => {})
    fetch(`/api/tournaments/${tournamentId}/documents`).then(r => r.ok ? r.json() : []).then(d => setDocs(Array.isArray(d) ? d : [])).catch(() => {})
    fetch(`/api/plan?tournamentId=${q}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setPlan(d.lines || []) }).catch(() => {})
    fetch(`/api/contacts?tournamentId=${q}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setContacts(d.contacts || []); setTaskTournaments(d.tournaments || []); setContactsToday(d.today || '') } }).catch(() => {})
  }, [tournamentId])

  async function saveCost(id: string | null, body: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch(id ? `/api/costs/${encodeURIComponent(id)}` : '/api/costs', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not save')
      load()
      return true
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); return false }
  }
  async function removeCost(id: string) {
    const r = await fetch(`/api/costs/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) toast.error('Could not delete it'); else toast.success('Deleted')
    load()
  }
  async function savePlan(lines: PlanLine[]): Promise<boolean> {
    setPlan(lines)
    try {
      const r = await fetch('/api/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId, lines }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error()
      setPlan(d.lines || lines)
      return true
    } catch { return false }
  }
  async function patchContact(c: ContactRow, body: Record<string, unknown>) {
    await fetch(`/api/contacts/${encodeURIComponent(c.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
  }

  useEffect(() => { load() }, [tournamentId])
  // A Budget line marked Paid adds (or changes) an expense here.
  useEffect(() => {
    const again = () => load()
    window.addEventListener('costs-changed', again)
    return () => window.removeEventListener('costs-changed', again)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])
  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function openNew(type: 'income' | 'expense') {
    setForm({ ...EMPTY_FORM, type, category: type === 'income' ? 'vendor_fee' : 'facility' })
    setEditingId(null); setShowForm(true)
  }
  function openEdit(tx: Transaction) {
    setForm({ type: tx.type, category: tx.category, description: tx.description, amount: String(tx.amount), method: tx.method, date: tx.date, notes: tx.notes })
    setEditingId(tx.id); setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim() || !form.amount) return
    setSaving(true)
    try {
      const url = editingId ? `/api/tournaments/${tournamentId}/transactions/${editingId}` : `/api/tournaments/${tournamentId}/transactions`
      const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      toast.success(editingId ? 'Updated!' : 'Added!')
      setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); load()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`Delete "${desc}"?`)) return
    await fetch(`/api/tournaments/${tournamentId}/transactions/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }

  // ── Computed ──
  // Expenses that came from a bill (a paid cost line) belong to Overview; Other
  // entries keeps only what was typed in by hand.
  const linkedTx = useMemo(() => new Set(costs.map(c => c.transactionId).filter(Boolean)), [costs])
  const otherTxs = transactions.filter(t => !linkedTx.has(t.id))
  const otherIncome  = otherTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const otherExpense = otherTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const vendorCount  = vendors.filter(v => v.status === 'approved').length
  const fin = useMemo(() => buildFinance({
    tournamentId: String(tournamentId), regs: registrations, individuals: individualRegs, vendors,
    staff: staffSummary, staffPaidIds, txs: transactions, costs, labelFor: c => costLabel(c, costEvents),
  }), [tournamentId, registrations, individualRegs, vendors, staffSummary, staffPaidIds, transactions, costs, costEvents])

  const tabs = [
    { key: 'summary', label: 'Overview', Icon: BarChart3 },
    { key: 'budget',  label: 'Budget', Icon: Calculator },
    { key: 'other',   label: `Other entries (${otherTxs.length})`, Icon: Wallet },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <Toaster />
      <div className="max-w-5xl mx-auto">

        <TournamentNav id={tournamentId as string} name={tournamentName || 'Tournament'} logoUrl={tournamentLogo} />
        {/* Header */}
        <div className="mb-4 sm:mb-5">
          <h1 className="text-2xl font-bold text-slate-800">Financials</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 sm:mb-6 bg-white border border-slate-200 rounded-xl p-1 w-full sm:w-fit flex-wrap">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <tab.Icon size={15} /> {tab.label}
            </button>
          ))}
          <Link href={`/tournaments/${tournamentId}/registrations`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            <ClipboardList size={15} /> Team Fees ({registrations.length + individualRegs.length})
          </Link>
          <Link href={`/tournaments/${tournamentId}/vendor-requests`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            <Store size={15} /> Vendors ({vendorCount})
          </Link>
          <Link href={`/tournaments/${tournamentId}/pay-summary`}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 whitespace-nowrap">
            <Users size={15} /> Staff Pay ({staffSummary.length})
          </Link>
        </div>

        {loading ? <div className="text-center py-16 text-slate-400">Loading…</div> : <>

        {/* ── OVERVIEW: profit, cash, income and bills (Oct 5 2026 redesign) ── */}
        {activeTab === 'summary' && (
          <OverviewTab tournamentId={String(tournamentId)} fin={fin} docs={docs} costs={costs} costEvents={costEvents}
            contacts={contacts} taskTournaments={taskTournaments} contactsToday={contactsToday}
            onSaveCost={saveCost} onRemoveCost={removeCost} onPatchContact={patchContact}
            onAddIncome={() => { setActiveTab('other'); openNew('income') }} onOpenOther={() => setActiveTab('other')} />
        )}

        {/* ── BUDGET: the projected P&L ── */}
        {activeTab === 'budget' && (
          <BudgetTab tournamentId={String(tournamentId)} fin={fin} plan={plan} costs={costs} costEvents={costEvents} contacts={contacts}
            onSavePlan={savePlan} onSaveCost={saveCost} onRemoveCost={removeCost} />
        )}

        {/* ── OTHER INCOME & EXPENSES TAB ── */}
        {activeTab === 'other' && (
          <div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => openNew('expense')} className="inline-flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={15} /> Add Expense</button>
              <button onClick={() => openNew('income')} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={15} /> Add Income</button>
            </div>

            {showForm && (
              <Card className="p-6 mb-4">
                <h2 className="font-semibold text-slate-800 mb-4">{editingId ? 'Edit transaction' : form.type === 'income' ? 'Add Income' : 'Add Expense'}</h2>
                <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                    <select className={inputCls} value={form.type} onChange={e => { const t = e.target.value as 'income'|'expense'; setForm(f=>({...f,type:t,category:t==='income'?'vendor_fee':'facility'})) }}>
                      <option value="expense">Expense</option><option value="income">Income</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select className={inputCls} value={form.category} onChange={e=>setF('category',e.target.value)}>
                      {(form.type==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES).map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
                    <input required className={inputCls} placeholder="e.g. Tent rental — ABC Events" value={form.description} onChange={e=>setF('description',e.target.value)} autoFocus/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amount ($) *</label>
                    <input required type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" value={form.amount} onChange={e=>setF('amount',e.target.value)}/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
                    <select className={inputCls} value={form.method} onChange={e=>setF('method',e.target.value)}>
                      {METHODS.map(m=><option key={m} value={m}>{methodLabel(m)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                    <input type="date" className={inputCls} value={form.date} onChange={e=>setF('date',e.target.value)}/>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                    <input className={inputCls} placeholder="Optional notes..." value={form.notes} onChange={e=>setF('notes',e.target.value)}/>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
                    <button type="submit" disabled={saving} className={`px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${form.type==='income'?'bg-emerald-600 hover:bg-emerald-700':'bg-red-500 hover:bg-red-600'}`}>
                      {saving?'Saving…':editingId?'Save Changes':form.type==='income'?'Add Income':'Add Expense'}
                    </button>
                    <button type="button" onClick={()=>{setShowForm(false);setEditingId(null)}} className="px-5 py-2 rounded-lg text-sm border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </Card>
            )}

            {linkedTx.size > 0 && <p className="text-sm text-slate-600 mb-3">{linkedTx.size} payment{linkedTx.size === 1 ? '' : 's'} on vendor bills {linkedTx.size === 1 ? 'is' : 'are'} on the Overview tab, with {linkedTx.size === 1 ? 'its' : 'their'} bill{linkedTx.size === 1 ? '' : 's'}.</p>}
            {otherTxs.length === 0 ? (
              <Card className="text-center py-16">
                <div className="flex justify-center mb-3 text-slate-300"><Wallet size={40} /></div>
                <p className="font-medium text-slate-600">No other transactions yet</p>
                <p className="text-sm text-slate-400 mt-1">Add vendor fees, tent rentals, field costs, merch sales, awards, etc.</p>
              </Card>
            ) : (
              <>
              <div className="sm:hidden space-y-2">
                {otherTxs.map(tx => (
                  <div key={tx.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{tx.description}</div>
                        <div className="text-xs text-slate-400">{showDate(tx.date)} · {methodLabel(tx.method)}</div>
                        {tx.notes && <div className="text-xs text-slate-400 mt-0.5">{tx.notes}</div>}
                      </div>
                      <div className={`text-base font-bold whitespace-nowrap ${tx.type==='income'?'text-emerald-600':'text-red-500'}`}>{tx.type==='income'?'+':'-'}{fmt(tx.amount)}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tx.type==='income'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{catLabel(tx.category)}</span>
                      <div className="flex items-center gap-3">
                        <button onClick={()=>openEdit(tx)} aria-label="Edit" className="text-slate-400 hover:text-teal-600 p-1"><Pencil size={15} /></button>
                        <button onClick={()=>handleDelete(tx.id,tx.description)} aria-label="Delete" className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm space-y-1">
                  {otherIncome > 0 && <div className="flex justify-between font-semibold text-emerald-700"><span>Total Income</span><span>+{fmt(otherIncome)}</span></div>}
                  {otherExpense > 0 && <div className="flex justify-between font-semibold text-red-600"><span>Total Expenses</span><span>-{fmt(otherExpense)}</span></div>}
                  <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200"><span>Net</span><span className={otherIncome-otherExpense>=0?'text-emerald-700':'text-red-600'}>{fmt(otherIncome-otherExpense)}</span></div>
                </div>
              </div>

              <Card className="hidden sm:block overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-3 w-20"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {otherTxs.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 group">
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{showDate(tx.date)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{tx.description}</div>
                          {tx.notes && <div className="text-xs text-slate-400">{tx.notes}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tx.type==='income'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>
                            {catLabel(tx.category)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{methodLabel(tx.method)}</td>
                        <td className={`px-5 py-3 text-right font-bold ${tx.type==='income'?'text-emerald-600':'text-red-500'}`}>
                          {tx.type==='income'?'+':'-'}{fmt(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={()=>openEdit(tx)} aria-label="Edit" className="text-slate-400 hover:text-teal-600 mr-2 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={15} /></button>
                          <button onClick={()=>handleDelete(tx.id,tx.description)} aria-label="Delete" className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    {otherIncome > 0 && <tr><td colSpan={4} className="px-5 py-2 font-semibold text-emerald-700">Total Income</td><td className="px-5 py-2 text-right font-bold text-emerald-700">+{fmt(otherIncome)}</td><td/></tr>}
                    {otherExpense > 0 && <tr><td colSpan={4} className="px-5 py-2 font-semibold text-red-600">Total Expenses</td><td className="px-5 py-2 text-right font-bold text-red-600">-{fmt(otherExpense)}</td><td/></tr>}
                    <tr><td colSpan={4} className="px-5 py-3 font-bold text-slate-800">Net</td><td className={`px-5 py-3 text-right text-lg font-bold ${otherIncome-otherExpense>=0?'text-emerald-700':'text-red-600'}`}>{fmt(otherIncome-otherExpense)}</td><td/></tr>
                  </tfoot>
                </table>
              </Card>
              </>
            )}
          </div>
        )}

        </>}
      </div>
    </div>
  )
}
