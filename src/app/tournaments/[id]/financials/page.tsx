'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { BarChart3, Wallet, ClipboardList, Users, Plus, Pencil, Trash2 } from 'lucide-react'
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
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)
const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
const EMPTY_FORM = { type: 'expense' as 'income' | 'expense', category: 'facility', description: '', amount: '', method: 'check', date: today(), notes: '' }

export default function FinancialsPage() {
  const { id: tournamentId } = useParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [individualRegs, setIndividualRegs] = useState<IndividualReg[]>([])
  const [staffSummary, setStaffSummary]   = useState<StaffEntry[]>([])
  const [staffPaidIds, setStaffPaidIds]   = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'other'>('summary')

  const load = () => {
    Promise.all([
      fetch(`/api/tournaments/${tournamentId}/transactions`).then(r => r.json()),
      fetch(`/api/registrations?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}/pay-summary`).then(r => r.json()),
      fetch(`/api/payment-records?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}/individual-reg`).then(r => r.json()),
    ]).then(([txs, regs, paySummary, payRecords, t, indivRegs]) => {
      setTransactions(txs)
      setRegistrations(regs)
      setIndividualRegs(Array.isArray(indivRegs) ? indivRegs : [])
      setStaffSummary(paySummary.summary || [])
      setStaffPaidIds(new Set(payRecords.map((p: { workerId: string }) => p.workerId)))
      setTournamentName(t.name || '')
      if (t.logoUrl) setTournamentLogo(t.logoUrl)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [tournamentId])
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

  // ── Computed totals ──
  const teamInvoiced  = registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0)
  const teamReceived  = registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0)
  const indivInvoiced = individualRegs.reduce((s, r) => s + r.feeTierAmount, 0)
  const indivReceived = individualRegs.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.feeTierAmount, 0)
  const regInvoiced   = teamInvoiced + indivInvoiced
  const regReceived   = teamReceived + indivReceived
  const regBalance    = regInvoiced - regReceived

  const staffOwed    = staffSummary.reduce((s, w) => s + w.totalPay, 0)
  const staffPaid    = staffSummary.filter(w => staffPaidIds.has(w.worker.id)).reduce((s, w) => s + w.totalPay, 0)
  const staffUnpaid  = staffOwed - staffPaid

  const otherIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const otherExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const totalRevenue = regInvoiced + otherIncome
  const totalExpense = staffOwed + otherExpense
  const grossProfit  = totalRevenue - totalExpense
  const netCash      = regReceived + otherIncome - staffPaid - otherExpense
  const margin       = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0

  const tabs = [
    { key: 'summary', label: 'P&L Summary', Icon: BarChart3 },
    { key: 'other',   label: `Other (${transactions.length})`, Icon: Wallet },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster />
      <div className="max-w-5xl mx-auto">

        <TournamentNav id={tournamentId as string} name={tournamentName || 'Tournament'} logoUrl={tournamentLogo} />
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Financials</h1>
          </div>
          {/* Top-line summary pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Total Revenue', value: totalRevenue, color: 'text-slate-800', bg: 'bg-slate-50 border-slate-200' },
              { label: 'Total Expenses', value: totalExpense, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
              { label: 'Gross Profit', value: grossProfit, color: grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600', bg: grossProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200' },
              { label: 'Net Cash', value: netCash, color: netCash >= 0 ? 'text-emerald-700' : 'text-red-600', bg: netCash >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200' },
            ].map(s => (
              <div key={s.label} className={`border rounded-xl px-4 py-2 text-center min-w-[100px] ${s.bg}`}>
                <div className={`text-lg font-bold ${s.color}`}>{fmt(s.value)}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit flex-wrap">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <tab.Icon size={15} /> {tab.label}
            </button>
          ))}
          <Link href={`/tournaments/${tournamentId}/registrations`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <ClipboardList size={15} /> Team Fees ({registrations.length + individualRegs.length})
          </Link>
          <Link href={`/tournaments/${tournamentId}/pay-summary`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100">
            <Users size={15} /> Staff Pay ({staffSummary.length})
          </Link>
        </div>

        {loading ? <div className="text-center py-16 text-slate-400">Loading…</div> : <>

        {/* ── SUMMARY TAB ── */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <Card className="overflow-hidden">
              {/* Revenue */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-emerald-50">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-3">Revenue</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Registration fees ({registrations.length} clubs · {registrations.reduce((s,r)=>s+r.teams.length,0)} teams · {individualRegs.length} players)</span>
                    <span className="font-semibold">{fmt(regInvoiced)}</span>
                  </div>
                  {otherIncome > 0 && transactions.filter(t=>t.type==='income').map(tx => (
                    <div key={tx.id} className="flex justify-between text-slate-500 pl-4">
                      <span>{catLabel(tx.category)} — {tx.description}</span>
                      <span>{fmt(tx.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-emerald-700 border-t border-emerald-200 pt-2 mt-1">
                    <span>Total Revenue</span>
                    <span>{fmt(totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Collected so far</span>
                    <span className="text-emerald-600 font-medium">{fmt(regReceived + otherIncome)}</span>
                  </div>
                  {regBalance > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>Outstanding from teams</span>
                      <span className="font-medium">{fmt(regBalance)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expenses */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-red-50">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-3">Expenses</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Staff pay ({staffSummary.length} staff members)</span>
                    <span className="font-semibold">{fmt(staffOwed)}</span>
                  </div>
                  {otherExpense > 0 && transactions.filter(t=>t.type==='expense').map(tx => (
                    <div key={tx.id} className="flex justify-between text-slate-500 pl-4">
                      <span>{catLabel(tx.category)} — {tx.description}</span>
                      <span>{fmt(tx.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-red-600 border-t border-red-200 pt-2 mt-1">
                    <span>Total Expenses</span>
                    <span>{fmt(totalExpense)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Paid out to staff</span>
                    <span className="text-red-500 font-medium">{fmt(staffPaid)}</span>
                  </div>
                  {staffUnpaid > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>Staff still owed</span>
                      <span className="font-medium">{fmt(staffUnpaid)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom line */}
              <div className="px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`rounded-xl p-4 text-center ${grossProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className={`text-2xl font-bold ${grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(grossProfit)}</div>
                  <div className="text-sm text-slate-500 mt-0.5">Gross Profit ({margin}% margin)</div>
                  <div className="text-xs text-slate-400 mt-0.5">Revenue − Expenses</div>
                </div>
                <div className={`rounded-xl p-4 text-center ${netCash >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className={`text-2xl font-bold ${netCash >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(netCash)}</div>
                  <div className="text-sm text-slate-500 mt-0.5">Net Cash Position</div>
                  <div className="text-xs text-slate-400 mt-0.5">Collected − Paid out</div>
                </div>
              </div>

              {/* Expense bar */}
              {totalRevenue > 0 && (
                <div className="px-4 sm:px-6 pb-5">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Expenses as % of revenue</span>
                    <span>{Math.min(100, Math.round((totalExpense / totalRevenue) * 100))}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((totalExpense / totalRevenue) * 100))}%` }} />
                  </div>
                </div>
              )}
            </Card>
          </div>
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

            {transactions.length === 0 ? (
              <Card className="text-center py-16">
                <div className="flex justify-center mb-3 text-slate-300"><Wallet size={40} /></div>
                <p className="font-medium text-slate-600">No other transactions yet</p>
                <p className="text-sm text-slate-400 mt-1">Add vendor fees, tent rentals, field costs, merch sales, awards, etc.</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
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
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 group">
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
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
            )}
          </div>
        )}

        </>}
      </div>
    </div>
  )
}
