'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'

interface RegisteredTeam {
  id: string; clubName: string; teamName: string; division: string
  coachName: string; coachPhone: string; coachEmail: string; logoUrl: string
}
interface RegistrationPayment {
  id: string; amount: number; method: string; checkNumber: string
  receivedAt: string; notes: string
}
interface Registration {
  id: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; clubWebsite: string; numTeams: number
  needsHotel: string; paymentMethod: string; notes: string; createdAt: string
  invoiceAmount: number; discountAmount: number; discountNote: string
  teams: RegisteredTeam[]; payments: RegistrationPayment[]
}
interface TeamRow { clubName: string; teamName: string; division: string; coachName: string; coachPhone: string; coachEmail: string; logoUrl: string }
interface Pricing { tier1: number; tier1Max: number; tier2: number; tier2Max: number; tier3: number; sevenVSeven: number }
interface IndividualReg {
  id: string; firstName: string; lastName: string; email: string; phone: string
  position: string; jerseySize: string; shortsSize: string; numberRequest: string
  usLacrosseNumber: string; dateOfBirth: string
  guardianName: string; guardianPhone: string; guardianEmail: string
  feeTierId: string; feeTierName: string; feeTierAmount: number
  paymentStatus: string; waiverSigned: boolean; createdAt: string
}

const DEFAULT_PRICING: Pricing = { tier1: 1495, tier1Max: 3, tier2: 1450, tier2Max: 6, tier3: 1395, sevenVSeven: 1095 }
const DEFAULT_DIVISIONS = [
  'Boys High School A','Boys High School B','Boys High School B2',
  'Boys U14 A and B','Boys U12 A and B',
  'Boys U10 A and B (7v7)','Boys U10 A and B (10v10)','Boys U8 (7v7)',
  'Girls High School A','Girls High School B','Girls High School B2',
  'Girls Middle School A',"Girls Middle School B (No 2030's)",
  "Girls Lower School A (7v7)","Girls Lower School B (7v7 – No 2033's)",
]
const emptyTeam = (): TeamRow => ({ clubName: '', teamName: '', division: '', coachName: '', coachPhone: '', coachEmail: '', logoUrl: '' })
const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
const smallInputCls = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
const payLabel = (m: string) => m === 'credit_card' ? 'Credit Card' : m === 'zelle' ? 'Zelle' : 'Check'
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().slice(0, 10)

function calcInvoice(teams: TeamRow[], pricing: Pricing): number {
  const sevenV = teams.filter(t => t.division.toLowerCase().includes('7v7') || t.division.toLowerCase().includes('7 v 7'))
  const regular = teams.filter(t => !t.division.toLowerCase().includes('7v7') && !t.division.toLowerCase().includes('7 v 7'))
  let total = sevenV.length * pricing.sevenVSeven
  const n = regular.length
  const rate = n <= pricing.tier1Max ? pricing.tier1 : n <= pricing.tier2Max ? pricing.tier2 : pricing.tier3
  total += n * rate
  return total
}

function downloadCSV(registrations: Registration[]) {
  const headers = [
    'Club Name','Club Contact','Email','Phone','Based In','Hotel','Payment Method',
    'Invoice','Discount','Balance Due','Total Paid','Notes','Submitted',
    'Team #','Team Club','Team Name','Division','Coach Name','Coach Phone','Coach Email'
  ]
  const rows: string[][] = []
  for (const reg of registrations) {
    const totalPaid = reg.payments.reduce((s, p) => s + p.amount, 0)
    const balance = reg.invoiceAmount - reg.discountAmount - totalPaid
    const base = [
      reg.clubName, reg.clubContact, reg.contactEmail, reg.contactPhone,
      reg.clubBasedIn, reg.needsHotel, payLabel(reg.paymentMethod),
      String(reg.invoiceAmount), String(reg.discountAmount), String(balance), String(totalPaid), reg.notes,
      new Date(reg.createdAt).toLocaleDateString(),
    ]
    if (reg.teams.length === 0) {
      rows.push([...base, '','','','','','',''])
    } else {
      reg.teams.forEach((t, i) => rows.push([...base, String(i+1), t.clubName, t.teamName, t.division, t.coachName, t.coachPhone, t.coachEmail]))
    }
  }
  const esc = (v: string) => `"${(v||'').replace(/"/g,'""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `registrations-${today()}.csv`; a.click()
}


const STRIPE_FEE_RATE = 0.029
const STRIPE_FEE_FIXED = 0.30
function calcFee(base: number) { return Math.round((base * STRIPE_FEE_RATE + STRIPE_FEE_FIXED) * 100) / 100 }

interface CardFormProps {
  base: number; registrationId: string; tournamentId: string
  date: string; notes: string
  onSuccess: () => void; onCancel: () => void
}
function CardPaymentForm({ base, registrationId, tournamentId, date, notes, onSuccess, onCancel }: CardFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')
  const fee = calcFee(base)
  const total = base + fee

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true); setErr('')
    try {
      // Create PaymentIntent
      const res = await fetch('/api/stripe/create-team-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: total, tournamentName: '', clubName: '', registrationId }),
      })
      const { clientSecret, publishableKey, accountId, error } = await res.json()
      if (error) throw new Error(error)

      // Confirm card payment
      const card = elements.getElement(CardElement)!
      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      })
      if (stripeErr) throw new Error(stripeErr.message)
      if (paymentIntent?.status !== 'succeeded') throw new Error('Payment did not complete')

      // Record payment
      const recRes = await fetch('/api/registration-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, amount: base, method: 'credit_card', receivedAt: date, notes: notes ? `${notes} (fee: $${fee.toFixed(2)})` : `Processing fee: $${fee.toFixed(2)}` }),
      })
      if (!recRes.ok) throw new Error('Payment succeeded but failed to record')
      toast.success('Card payment recorded!')
      onSuccess()
    } catch (e: any) {
      setErr(e.message || 'Payment failed')
    } finally { setPaying(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm space-y-1">
        <div className="flex justify-between text-gray-600"><span>Registration amount</span><span>${base.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Processing fee (2.9% + $0.30)</span><span>+${fee.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-blue-200 pt-1"><span>Total charged</span><span>${total.toFixed(2)}</span></div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Card Details</label>
        <div className="border border-gray-300 rounded-xl px-3 py-3">
          <CardElement options={{ style: { base: { fontSize: '15px', color: '#1f2937', '::placeholder': { color: '#9ca3af' } } } }} />
        </div>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={paying || !stripe} className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
          {paying ? 'Processing…' : `Charge $${total.toFixed(2)}`}
        </button>
        <button type="button" onClick={onCancel} className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}

export default function RegistrationsPage() {
  const { id: tournamentId } = useParams()
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING)
  const [divisions, setDivisions] = useState<string[]>(DEFAULT_DIVISIONS)
  const [showPricing, setShowPricing] = useState(false)
  const [pricingDraft, setPricingDraft] = useState<Pricing>(DEFAULT_PRICING)
  const [divisionsDraft, setDivisionsDraft] = useState<string[]>(DEFAULT_DIVISIONS)
  const [newDivision, setNewDivision] = useState('')

  // Registration form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [clubName, setClubName] = useState('')
  const [clubContact, setClubContact] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [clubBasedIn, setClubBasedIn] = useState('')
  const [clubWebsite, setClubWebsite] = useState('')
  const [needsHotel, setNeedsHotel] = useState('No')
  const [paymentMethod, setPaymentMethod] = useState('check')
  const [notes, setNotes] = useState('')
  const [teams, setTeams] = useState<TeamRow[]>([emptyTeam()])
  const [invoiceAmount, setInvoiceAmount] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountNote, setDiscountNote] = useState('')
  const [clubLogoUrl, setClubLogoUrl] = useState('')
  const [clubLogoUploading, setClubLogoUploading] = useState(false)
  const [logoUploading, setLogoUploading] = useState<number | null>(null)

  const uploadTeamLogo = async (i: number, file: File) => {
    setLogoUploading(i)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await res.json()
      setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, logoUrl: url } : t))
      toast.success('Logo uploaded!')
    } catch { toast.error('Upload failed') }
    finally { setLogoUploading(null) }
  }

  const uploadClubLogo = async (file: File) => {
    setClubLogoUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const { url } = await res.json()
      setClubLogoUrl(url)
      setTeams(prev => prev.map(t => t.logoUrl ? t : { ...t, logoUrl: url }))
      toast.success('Club logo uploaded!')
    } catch { toast.error('Upload failed') }
    finally { setClubLogoUploading(false) }
  }

  // Import
  const importFileRef = useRef<HTMLInputElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState<{headers:string[];rows:Record<string,unknown>[]}|null>(null)
  const [importMapping, setImportMapping] = useState<Record<string,string>>({})
  const [importLoading, setImportLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  // Filters
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [filterPayment, setFilterPayment] = useState('')

  // Payment form
  const [payingRegId, setPayingRegId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('check')
  const [payCheck, setPayCheck] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payNotes, setPayNotes] = useState('')
  const [addingPay, setAddingPay] = useState(false)
  const [stripePromise, setStripePromise] = useState<any>(null)

  // Load Stripe when credit_card selected
  useEffect(() => {
    if (payMethod === 'credit_card' && !stripePromise) {
      fetch('/api/stripe/create-team-intent', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({amount:1,tournamentName:'',clubName:'',registrationId:''}) })
        .then(r => r.json()).then(d => {
          if (d.publishableKey) {
            const sp = loadStripe(d.publishableKey, d.accountId ? { stripeAccount: d.accountId } : undefined)
            setStripePromise(sp)
          }
        }).catch(() => {})
    }
  }, [payMethod])

  // Tabs & individual reg
  const [activeTab, setActiveTab] = useState<'team' | 'individual'>('team')
  const [teamRegEnabled, setTeamRegEnabled] = useState(true)
  const [indivRegEnabled, setIndivRegEnabled] = useState(false)
  const [indivRegTiers, setIndivRegTiers] = useState<{id:string;name:string;price:number;description:string}[]>([])
  const [indivRegPositions, setIndivRegPositions] = useState<string[]>([])
  const [individualRegs, setIndividualRegs] = useState<IndividualReg[]>([])
  const [showIndivForm, setShowIndivForm] = useState(false)
  const [savingIndiv, setSavingIndiv] = useState(false)
  const [editingIndivId, setEditingIndivId] = useState<string | null>(null)
  const [indivFirstName, setIndivFirstName] = useState('')
  const [indivLastName, setIndivLastName] = useState('')
  const [indivEmail, setIndivEmail] = useState('')
  const [indivPhone, setIndivPhone] = useState('')
  const [indivPosition, setIndivPosition] = useState('')
  const [indivJerseySize, setIndivJerseySize] = useState('')
  const [indivShortsSize, setIndivShortsSize] = useState('')
  const [indivNumberRequest, setIndivNumberRequest] = useState('')
  const [indivUsLacrosse, setIndivUsLacrosse] = useState('')
  const [indivDob, setIndivDob] = useState('')
  const [indivGuardianName, setIndivGuardianName] = useState('')
  const [indivGuardianPhone, setIndivGuardianPhone] = useState('')
  const [indivGuardianEmail, setIndivGuardianEmail] = useState('')
  const [indivFeeTierId, setIndivFeeTierId] = useState('')
  const [indivFeeTierName, setIndivFeeTierName] = useState('')
  const [indivFeeTierAmount, setIndivFeeTierAmount] = useState(0)
  const [indivPaymentStatus, setIndivPaymentStatus] = useState('pending')

  const load = () => {
    Promise.all([
      fetch(`/api/registrations?tournamentId=${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}`).then(r => r.json()),
      fetch(`/api/tournaments/${tournamentId}/individual-reg`).then(r => r.json()),
    ]).then(([regs, t, indivRegs]) => {
      setRegistrations(regs)
      setIndividualRegs(Array.isArray(indivRegs) ? indivRegs : [])
      setTournamentName(t.name || '')
      if (t.logoUrl) setTournamentLogo(t.logoUrl)
      const tEnabled = t.teamRegEnabled !== false
      const iEnabled = Boolean(t.individualRegEnabled)
      setTeamRegEnabled(tEnabled)
      setIndivRegEnabled(iEnabled)
      if (!tEnabled && iEnabled) setActiveTab('individual')
      try { const tiers = JSON.parse(t.individualRegTiers || '[]'); if (tiers.length) setIndivRegTiers(tiers) } catch {}
      try { const pos = JSON.parse(t.individualRegPositions || '[]'); if (pos.length) setIndivRegPositions(pos) } catch {}
      try {
        const p = JSON.parse(t.registrationPricing || '{}')
        if (p.tier1) { setPricing(p); setPricingDraft(p) }
        const d = JSON.parse(t.registrationDivisions || '[]')
        if (d.length > 0) { setDivisions(d); setDivisionsDraft(d) }
      } catch {}
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [tournamentId])

  const savePricing = async () => {
    await fetch(`/api/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationPricing: JSON.stringify(pricingDraft),
        registrationDivisions: JSON.stringify(divisionsDraft),
      }),
    })
    setPricing(pricingDraft)
    setDivisions(divisionsDraft)
    setShowPricing(false)
    toast.success('Settings saved!')
  }

  const totalTeams = registrations.reduce((s, r) => s + r.teams.length, 0)
  const totalInvoiced = registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0)
  const totalReceived = registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0)
  const totalBalance = totalInvoiced - totalReceived

  const updateTeam = (i: number, f: keyof TeamRow, v: string) =>
    setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, [f]: v } : t))
  const addTeam = () => {
    const newTeams = [...teams, { ...emptyTeam(), clubName, logoUrl: clubLogoUrl }]
    setTeams(newTeams)
    setInvoiceAmount(calcInvoice(newTeams, pricing))
  }
  const removeTeam = (i: number) => {
    const newTeams = teams.filter((_, idx) => idx !== i)
    setTeams(newTeams)
    setInvoiceAmount(calcInvoice(newTeams, pricing))
  }
  const handleTeamChange = (i: number, f: keyof TeamRow, v: string) => {
    const newTeams = teams.map((t, idx) => idx === i ? { ...t, [f]: v } : t)
    setTeams(newTeams)
    setInvoiceAmount(calcInvoice(newTeams, pricing))
  }

  const resetForm = () => {
    setEditingId(null); setClubName(''); setClubContact(''); setContactEmail(''); setContactPhone('')
    setClubBasedIn(''); setClubWebsite(''); setNeedsHotel('No'); setPaymentMethod('check')
    setNotes(''); setTeams([emptyTeam()]); setInvoiceAmount(0); setDiscountAmount(0); setDiscountNote(''); setClubLogoUrl('')
  }

  const openNew = () => { resetForm(); setShowForm(true) }
  const openEdit = (reg: Registration) => {
    setEditingId(reg.id); setClubName(reg.clubName); setClubContact(reg.clubContact)
    setContactEmail(reg.contactEmail); setContactPhone(reg.contactPhone)
    setClubBasedIn(reg.clubBasedIn); setClubWebsite(reg.clubWebsite)
    setNeedsHotel(reg.needsHotel); setPaymentMethod(reg.paymentMethod); setNotes(reg.notes)
    setInvoiceAmount(reg.invoiceAmount); setDiscountAmount(reg.discountAmount); setDiscountNote(reg.discountNote)
    setClubLogoUrl((reg as any).clubLogoUrl || '')
    setTeams(reg.teams.map(t => ({ clubName: t.clubName, teamName: t.teamName, division: t.division, coachName: t.coachName, coachPhone: t.coachPhone, coachEmail: t.coachEmail, logoUrl: (t as any).logoUrl || '' })))
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const url = editingId ? `/api/registrations/${editingId}` : '/api/registrations'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId, clubName, clubContact, contactEmail, contactPhone, clubBasedIn, clubWebsite, needsHotel, paymentMethod, notes, teams, invoiceAmount, discountAmount, discountNote, clubLogoUrl }),
      })
      if (!res.ok) throw new Error()
      toast.success(editingId ? 'Updated!' : 'Registration added!')
      setShowForm(false); resetForm(); load()
    } catch { toast.error('Failed to save.') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete registration for "${name}"?`)) return
    try {
      await fetch(`/api/registrations/${id}`, { method: 'DELETE' })
      toast.success('Deleted.'); setExpanded(null); load()
    } catch { toast.error('Failed to delete.') }
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault(); setAddingPay(true)
    try {
      const res = await fetch('/api/registration-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: payingRegId, amount: parseFloat(payAmount), method: payMethod, checkNumber: payCheck, receivedAt: payDate, notes: payNotes }),
      })
      if (!res.ok) throw new Error()
      toast.success('Payment recorded!')
      setPayingRegId(null); setPayAmount(''); setPayCheck(''); setPayDate(today()); setPayNotes('')
      load()
    } catch { toast.error('Failed to record payment.') }
    finally { setAddingPay(false) }
  }

  // ── Import handlers ──
  const IMPORT_FIELDS = [
    { key: 'clubName',     label: 'Club Name' },
    { key: 'clubContact',  label: 'Club Contact *' },
    { key: 'contactEmail', label: 'Contact Email *' },
    { key: 'contactPhone', label: 'Contact Phone *' },
    { key: 'clubBasedIn',  label: 'Based In' },
    { key: 'clubWebsite',  label: 'Website' },
    { key: 'needsHotel',   label: 'Needs Hotel' },
    { key: 'paymentMethod',label: 'Payment Method' },
    { key: 'notes',        label: 'Notes' },
    // team sub-fields (repeated per team row)
    { key: 'teamClubName', label: 'Team – Club Name' },
    { key: 'teamName',     label: 'Team – Team Name' },
    { key: 'division',     label: 'Team – Division' },
    { key: 'coachName',    label: 'Team – Coach Name' },
    { key: 'coachPhone',   label: 'Team – Coach Phone' },
    { key: 'coachEmail',   label: 'Team – Coach Email' },
  ]

  function autoMap(headers: string[]) {
    const find = (...terms: string[]) => headers.find(h => terms.some(t => h.toLowerCase().replace(/[\s_-]/g,'').includes(t))) ?? ''
    setImportMapping({
      clubName:      find('clubname','club','organization'),
      clubContact:   find('clubcontact','contact','name','fullname'),
      contactEmail:  find('email'),
      contactPhone:  find('phone','mobile','cell'),
      clubBasedIn:   find('basedin','city','location','state'),
      clubWebsite:   find('website','url'),
      needsHotel:    find('hotel'),
      paymentMethod: find('payment','method','pay'),
      notes:         find('notes','comment'),
      teamClubName:  find('teamclub','clubname','club'),
      teamName:      find('teamname','team'),
      division:      find('division','div'),
      coachName:     find('coachname','coach'),
      coachPhone:    find('coachphone'),
      coachEmail:    find('coachemail'),
    })
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportLoading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/registrations/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportData({ headers: data.headers, rows: data.rows })
      autoMap(data.headers)
    } catch (err) { toast.error('Failed to parse file') }
    finally { setImportLoading(false); if (importFileRef.current) importFileRef.current.value = '' }
  }

  function getVal(row: Record<string,unknown>, col: string) {
    return col ? String(row[col] ?? '').trim() : ''
  }

  function buildImportPreview() {
    if (!importData) return []
    const m = importMapping
    // Group rows by club contact (same contact = same registration)
    const map = new Map<string, { clubName:string; clubContact:string; contactEmail:string; contactPhone:string; clubBasedIn:string; clubWebsite:string; needsHotel:string; paymentMethod:string; notes:string; teams:TeamRow[] }>()
    for (const row of importData.rows) {
      const contact = getVal(row, m.clubContact)
      if (!contact) continue
      if (!map.has(contact)) {
        const pm = getVal(row, m.paymentMethod).toLowerCase()
        const payMethod = pm.includes('zelle') ? 'zelle' : pm.includes('credit') || pm.includes('card') ? 'credit_card' : 'check'
        map.set(contact, {
          clubName: getVal(row, m.clubName),
          clubContact: contact,
          contactEmail: getVal(row, m.contactEmail),
          contactPhone: getVal(row, m.contactPhone),
          clubBasedIn: getVal(row, m.clubBasedIn),
          clubWebsite: getVal(row, m.clubWebsite),
          needsHotel: getVal(row, m.needsHotel) || 'No',
          paymentMethod: payMethod,
          notes: getVal(row, m.notes),
          teams: [],
        })
      }
      const teamName = getVal(row, m.teamName)
      if (teamName) {
        map.get(contact)!.teams.push({
          clubName: getVal(row, m.teamClubName) || getVal(row, m.clubName),
          teamName,
          division: getVal(row, m.division),
          coachName: getVal(row, m.coachName),
          coachPhone: getVal(row, m.coachPhone),
          coachEmail: getVal(row, m.coachEmail),
          logoUrl: '',
        })
      }
    }
    return [...map.values()]
  }

  async function confirmImport() {
    const preview = buildImportPreview()
    if (!preview.length) return
    setImporting(true)
    try {
      let created = 0
      for (const reg of preview) {
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournamentId, ...reg, numTeams: reg.teams.length }),
        })
        if (res.ok) created++
      }
      toast.success(`Imported ${created} registration${created !== 1 ? 's' : ''}!`)
      setImportData(null); setShowImport(false); load()
    } catch { toast.error('Import failed') }
    finally { setImporting(false) }
  }

  function downloadImportTemplate() {
    const headers = ['Club Name','Club Contact','Contact Email','Contact Phone','Based In','Website','Needs Hotel','Payment Method','Notes','Team Club Name','Team Name','Division','Coach Name','Coach Phone','Coach Email']
    const example = ['Sunshine Lax','Jane Smith','jane@sunshineax.com','555-123-4567','Orlando FL','https://sunshineax.com','Yes','check','Early bird','Sunshine Lax','Eagles White','Boys 2027','Coach Mike','555-987-6543','mike@email.com']
    const csv = [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'registration_import_template.csv'; a.click()
  }

  const resetIndivForm = () => {
    setEditingIndivId(null)
    setIndivFirstName(''); setIndivLastName(''); setIndivEmail(''); setIndivPhone('')
    setIndivPosition(''); setIndivJerseySize(''); setIndivShortsSize('')
    setIndivNumberRequest(''); setIndivUsLacrosse(''); setIndivDob('')
    setIndivGuardianName(''); setIndivGuardianPhone(''); setIndivGuardianEmail('')
    setIndivFeeTierId(''); setIndivFeeTierName(''); setIndivFeeTierAmount(0)
    setIndivPaymentStatus('pending')
  }

  const openIndivNew = () => { resetIndivForm(); setShowIndivForm(true) }
  const openIndivEdit = (reg: IndividualReg) => {
    setEditingIndivId(reg.id)
    setIndivFirstName(reg.firstName); setIndivLastName(reg.lastName)
    setIndivEmail(reg.email); setIndivPhone(reg.phone)
    setIndivPosition(reg.position); setIndivJerseySize(reg.jerseySize)
    setIndivShortsSize(reg.shortsSize); setIndivNumberRequest(reg.numberRequest)
    setIndivUsLacrosse(reg.usLacrosseNumber); setIndivDob(reg.dateOfBirth)
    setIndivGuardianName(reg.guardianName); setIndivGuardianPhone(reg.guardianPhone)
    setIndivGuardianEmail(reg.guardianEmail)
    setIndivFeeTierId(reg.feeTierId); setIndivFeeTierName(reg.feeTierName)
    setIndivFeeTierAmount(reg.feeTierAmount); setIndivPaymentStatus(reg.paymentStatus)
    setShowIndivForm(true)
  }

  const handleSaveIndiv = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingIndiv(true)
    try {
      const url = editingIndivId
        ? `/api/tournaments/${tournamentId}/individual-reg/${editingIndivId}`
        : `/api/tournaments/${tournamentId}/individual-reg`
      const res = await fetch(url, {
        method: editingIndivId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: indivFirstName, lastName: indivLastName,
          email: indivEmail, phone: indivPhone,
          position: indivPosition, jerseySize: indivJerseySize,
          shortsSize: indivShortsSize, numberRequest: indivNumberRequest,
          usLacrosseNumber: indivUsLacrosse, dateOfBirth: indivDob,
          guardianName: indivGuardianName, guardianPhone: indivGuardianPhone,
          guardianEmail: indivGuardianEmail,
          feeTierId: indivFeeTierId, feeTierName: indivFeeTierName,
          feeTierAmount: indivFeeTierAmount, paymentStatus: indivPaymentStatus,
          waiverSigned: false,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(editingIndivId ? 'Updated!' : 'Player added!')
      setShowIndivForm(false); resetIndivForm(); load()
    } catch { toast.error('Failed to save.') }
    finally { setSavingIndiv(false) }
  }

  const handleDeleteIndiv = async (id: string, name: string) => {
    if (!confirm(`Delete registration for "${name}"?`)) return
    try {
      await fetch(`/api/tournaments/${tournamentId}/individual-reg/${id}`, { method: 'DELETE' })
      toast.success('Deleted.'); load()
    } catch { toast.error('Failed to delete.') }
  }

  const allDivisionsInData = Array.from(new Set(registrations.flatMap(r => r.teams.map(t => t.division)).filter(Boolean))).sort()

  const filteredRegistrations = registrations.filter(reg => {
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      const hit = (reg.clubName + reg.clubContact + reg.contactEmail).toLowerCase().includes(q)
        || reg.teams.some(t => (t.teamName + t.division + t.coachName).toLowerCase().includes(q))
      if (!hit) return false
    }
    if (filterDivision) {
      if (!reg.teams.some(t => t.division === filterDivision)) return false
    }
    if (filterPayment) {
      const totalPaid = reg.payments.reduce((s, p) => s + p.amount, 0)
      const balance = reg.invoiceAmount - reg.discountAmount - totalPaid
      if (filterPayment === 'paid' && balance > 0) return false
      if (filterPayment === 'unpaid' && totalPaid > 0) return false
      if (filterPayment === 'partial' && (totalPaid === 0 || balance <= 0)) return false
    }
    return true
  })

  const handleDeletePayment = async (id: string, amount: number) => {
    if (!confirm(`Delete this payment of ${fmt(amount)}? Use this if the payment was refunded or entered by mistake.`)) return
    await fetch(`/api/registration-payments/${id}`, { method: 'DELETE' })
    toast.success('Payment deleted.'); load()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toaster />
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <TournamentNav id={tournamentId as string} name={tournamentName || 'Tournament'} logoUrl={tournamentLogo} />

        {/* Tab switcher */}
        {(teamRegEnabled && indivRegEnabled) && (
          <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setActiveTab('team')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'team' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Team Registrations
            </button>
            <button
              onClick={() => setActiveTab('individual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'individual' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Individual Players
              {individualRegs.length > 0 && (
                <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{individualRegs.length}</span>
              )}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {activeTab === 'individual' ? 'Individual Players' : 'Team Registrations'}
              </h1>
            </div>
          </div>
          <Link href={`/tournaments/${tournamentId}/returning-teams`} className="text-sm font-semibold text-teal-600 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-xl transition-colors">
            🔄 Returning Teams
          </Link>
          <div className="flex gap-2 flex-wrap justify-end">
            {(activeTab === 'team' ? [
              { label: 'Clubs', value: registrations.length, color: 'text-blue-600' },
              { label: 'Teams', value: totalTeams, color: 'text-green-600' },
              { label: 'Invoiced', value: fmt(totalInvoiced), color: 'text-gray-800' },
              { label: 'Received', value: fmt(totalReceived), color: 'text-green-700' },
              { label: 'Balance', value: fmt(totalBalance), color: totalBalance > 0 ? 'text-red-600' : 'text-green-600' },
            ] : [
              { label: 'Players', value: individualRegs.length, color: 'text-blue-600' },
              { label: 'Paid', value: individualRegs.filter(r => r.paymentStatus === 'paid').length, color: 'text-green-600' },
              { label: 'Pending', value: individualRegs.filter(r => r.paymentStatus === 'pending').length, color: 'text-orange-500' },
              { label: 'Revenue', value: fmt(individualRegs.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.feeTierAmount, 0)), color: 'text-green-700' },
            ]).map(s => (
              <div key={s.label} className="bg-white border rounded-xl px-3 py-2 text-center min-w-[70px]">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action bar */}
        <div className="mb-5 flex gap-2 flex-wrap">
          <button
            onClick={() => activeTab === 'individual' ? openIndivNew() : openNew()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >+ Add Entry</button>
          <button onClick={() => { setShowImport(v => !v); setImportData(null) }} className={`px-4 py-2 rounded-lg text-sm font-medium border ${showImport ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>↑ Import Excel</button>
          <button onClick={() => { setPricingDraft(pricing); setDivisionsDraft(divisions); setNewDivision(''); setShowPricing(true) }} className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">⚙ Settings</button>
          <button onClick={() => downloadCSV(registrations)} disabled={!registrations.length} className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">⬇ CSV</button>
          <Link href={`/tournaments/${tournamentId}/register`} target="_blank" className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">🔗 Public Form</Link>
        </div>

        {/* Import panel */}
        {showImport && (
          <div className="bg-white border border-indigo-200 rounded-2xl p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-1">Import Registrations from Excel / CSV</h2>
            <p className="text-sm text-gray-500 mb-4">Rows with the same contact name are grouped into one registration. Each row can represent one team.</p>

            {!importData ? (
              <div className="flex gap-2">
                <button onClick={downloadImportTemplate} className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">↓ Download Template</button>
                <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700 ${importLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  {importLoading ? 'Parsing…' : '↑ Upload File'}
                  <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} disabled={importLoading} />
                </label>
              </div>
            ) : (
              <div>
                {/* Column mapping */}
                <p className="text-sm font-semibold text-gray-700 mb-3">Map your columns — {importData.rows.length} rows detected</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                  {IMPORT_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                      <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={importMapping[f.key] ?? ''}
                        onChange={e => setImportMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                        <option value="">— not mapped —</option>
                        {importData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {(() => {
                  const preview = buildImportPreview()
                  return (
                    <>
                      <p className="text-sm font-semibold text-gray-700 mb-2">Preview — {preview.length} registrations, {preview.reduce((s,r)=>s+r.teams.length,0)} teams</p>
                      <div className="border border-gray-200 rounded-xl overflow-hidden mb-4 max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Club / Contact</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Email</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Teams</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Hotel</th>
                              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {preview.map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-800">{r.clubName || r.clubContact}<div className="text-gray-400 font-normal">{r.clubContact}</div></td>
                                <td className="px-3 py-2 text-gray-500">{r.contactEmail}</td>
                                <td className="px-3 py-2">
                                  {r.teams.length > 0
                                    ? r.teams.map((t,ti) => (
                                        <div key={ti} className="flex items-center gap-1.5 text-gray-600">
                                          {t.logoUrl && <img src={t.logoUrl} alt="" className="h-4 w-4 object-contain rounded" />}
                                          {t.teamName} <span className="text-gray-400">({t.division})</span>
                                        </div>
                                      ))
                                    : <span className="text-gray-400">No teams</span>}
                                </td>
                                <td className="px-3 py-2 text-gray-500">{r.needsHotel}</td>
                                <td className="px-3 py-2 text-gray-500">{r.paymentMethod}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={confirmImport} disabled={importing || !preview.length}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                          {importing ? 'Importing…' : `Import ${preview.length} Registration${preview.length !== 1 ? 's' : ''}`}
                        </button>
                        <button onClick={() => { setImportData(null); setImportMapping({}) }} className="border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* Pricing settings modal */}
        {showPricing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowPricing(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md z-10">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Registration Pricing</h2>
              <div className="space-y-3 text-sm">
                {([
                  { key: 'tier1', label: `Tier 1 (1–${pricingDraft.tier1Max} teams) per team` },
                  { key: 'tier1Max', label: 'Tier 1 max teams' },
                  { key: 'tier2', label: `Tier 2 (${pricingDraft.tier1Max+1}–${pricingDraft.tier2Max} teams) per team` },
                  { key: 'tier2Max', label: 'Tier 2 max teams' },
                  { key: 'tier3', label: `Tier 3 (${pricingDraft.tier2Max+1}+ teams) per team` },
                  { key: 'sevenVSeven', label: '7v7 per team' },
                ] as { key: keyof Pricing; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <label className="text-gray-600 flex-1">{label}</label>
                    <input type="number" value={pricingDraft[key]}
                      onChange={e => setPricingDraft(p => ({ ...p, [key]: Number(e.target.value) }))}
                      className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
              </div>
              {/* Divisions editor */}
              <div className="mt-5 border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Divisions</h3>
                <div className="space-y-1.5 max-h-52 overflow-y-auto mb-3">
                  {divisionsDraft.map((div, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={div}
                        onChange={e => setDivisionsDraft(prev => prev.map((d, idx) => idx === i ? e.target.value : d))}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => setDivisionsDraft(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-lg leading-none px-1">✕</button>
                      <button type="button" disabled={i === 0}
                        onClick={() => setDivisionsDraft(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                      <button type="button" disabled={i === divisionsDraft.length - 1}
                        onClick={() => setDivisionsDraft(prev => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newDivision}
                    onChange={e => setNewDivision(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDivision.trim()) { setDivisionsDraft(prev => [...prev, newDivision.trim()]); setNewDivision('') } } }}
                    placeholder="Add division..."
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button"
                    onClick={() => { if (newDivision.trim()) { setDivisionsDraft(prev => [...prev, newDivision.trim()]); setNewDivision('') } }}
                    className="border border-blue-400 text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-1.5 text-sm font-medium">Add</button>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={savePricing} className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-blue-700">Save Settings</button>
                <button onClick={() => setShowPricing(false)} className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Add payment modal */}
        {payingRegId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setPayingRegId(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Record Payment</h2>
              <div className="space-y-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                    <input required type="number" step="0.01" min="0" placeholder="0.00"
                      value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      className={`${inputCls} pl-7`} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date Received *</label>
                  <input required type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inputCls}>
                    <option value="check">Check</option>
                    <option value="zelle">Zelle</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                {payMethod === 'check' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Check #</label>
                    <input value={payCheck} onChange={e => setPayCheck(e.target.value)} className={inputCls} />
                  </div>
                )}
                {payMethod !== 'credit_card' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inputCls} />
                  </div>
                )}
              </div>

              {payMethod === 'credit_card' ? (
                stripePromise ? (
                  <Elements stripe={stripePromise}>
                    <CardPaymentForm
                      base={parseFloat(payAmount) || 0}
                      registrationId={payingRegId}
                      tournamentId={String(tournamentId)}
                      date={payDate}
                      notes={payNotes}
                      onSuccess={() => { setPayingRegId(null); setPayAmount(''); load() }}
                      onCancel={() => setPayingRegId(null)}
                    />
                  </Elements>
                ) : (
                  <div className="text-center py-4 text-sm text-gray-400">Loading Stripe…</div>
                )
              ) : (
                <form onSubmit={handleAddPayment}>
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={addingPay} className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
                      {addingPay ? 'Saving...' : 'Record Payment'}
                    </button>
                    <button type="button" onClick={() => setPayingRegId(null)} className="px-4 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Individual registration form drawer */}
        {showIndivForm && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={() => setShowIndivForm(false)} />
            <div className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-4 flex items-center justify-between z-10 flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-gray-800">{editingIndivId ? 'Edit Player' : 'Add Individual Player'}</h2>
                <button onClick={() => setShowIndivForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <form onSubmit={handleSaveIndiv} className="px-4 sm:px-6 py-5 sm:py-6 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Player Info</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                      <input required value={indivFirstName} onChange={e => setIndivFirstName(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                      <input required value={indivLastName} onChange={e => setIndivLastName(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input required type="email" value={indivEmail} onChange={e => setIndivEmail(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={indivPhone} onChange={e => setIndivPhone(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                      <input type="date" value={indivDob} onChange={e => setIndivDob(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">US Lacrosse #</label>
                      <input value={indivUsLacrosse} onChange={e => setIndivUsLacrosse(e.target.value)} className={inputCls} /></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Position & Gear</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                      {indivRegPositions.length > 0 ? (
                        <select required value={indivPosition} onChange={e => setIndivPosition(e.target.value)} className={inputCls}>
                          <option value="">Choose</option>
                          {indivRegPositions.map(p => <option key={p}>{p}</option>)}
                        </select>
                      ) : (
                        <input required value={indivPosition} onChange={e => setIndivPosition(e.target.value)} className={inputCls} />
                      )}</div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Jersey Size *</label>
                      <input required value={indivJerseySize} onChange={e => setIndivJerseySize(e.target.value)} className={inputCls} placeholder="e.g. M, L" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Shorts Size *</label>
                      <input required value={indivShortsSize} onChange={e => setIndivShortsSize(e.target.value)} className={inputCls} placeholder="e.g. M, L" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Number Request</label>
                      <input value={indivNumberRequest} onChange={e => setIndivNumberRequest(e.target.value)} className={inputCls} placeholder="e.g. 12" /></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Guardian (if minor)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                      <input value={indivGuardianName} onChange={e => setIndivGuardianName(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
                      <input type="tel" value={indivGuardianPhone} onChange={e => setIndivGuardianPhone(e.target.value)} className={inputCls} /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Guardian Email</label>
                      <input type="email" value={indivGuardianEmail} onChange={e => setIndivGuardianEmail(e.target.value)} className={inputCls} /></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Fee & Payment</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {indivRegTiers.length > 0 ? (
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fee Tier *</label>
                        <select required value={indivFeeTierId} onChange={e => {
                          const t = indivRegTiers.find(t => t.id === e.target.value)
                          if (t) { setIndivFeeTierId(t.id); setIndivFeeTierName(t.name); setIndivFeeTierAmount(t.price) }
                        }} className={inputCls}>
                          <option value="">Choose tier</option>
                          {indivRegTiers.map(t => <option key={t.id} value={t.id}>{t.name} — {fmt(t.price)}</option>)}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Fee Tier Name</label>
                          <input value={indivFeeTierName} onChange={e => setIndivFeeTierName(e.target.value)} className={inputCls} placeholder="e.g. Standard" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                          <input type="number" step="0.01" min="0" value={indivFeeTierAmount} onChange={e => setIndivFeeTierAmount(Number(e.target.value))} className={inputCls} /></div>
                      </>
                    )}
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                      <select value={indivPaymentStatus} onChange={e => setIndivPaymentStatus(e.target.value)} className={inputCls}>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={savingIndiv} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">
                    {savingIndiv ? 'Saving...' : editingIndivId ? 'Save Changes' : 'Add Player'}
                  </button>
                  <button type="button" onClick={() => setShowIndivForm(false)} className="px-5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Registration entry / edit panel */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={() => setShowForm(false)} />
            <div className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-lg font-semibold text-gray-800">{editingId ? 'Edit Registration' : 'Add Registration'}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <form onSubmit={handleSave} className="px-4 sm:px-6 py-5 sm:py-6 space-y-6" autoComplete="on">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
                    <input autoComplete="organization" value={clubName} onChange={e => setClubName(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Club Contact *</label>
                    <input required autoComplete="name" value={clubContact} onChange={e => setClubContact(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input required type="email" autoComplete="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                    <input required type="tel" autoComplete="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Based In</label>
                    <input placeholder="City and State" autoComplete="address-level2" value={clubBasedIn} onChange={e => setClubBasedIn(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input type="url" placeholder="https://" autoComplete="url" value={clubWebsite} onChange={e => setClubWebsite(e.target.value)} className={inputCls} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Hotel?</label>
                    <select value={needsHotel} onChange={e => setNeedsHotel(e.target.value)} className={inputCls}>
                      <option>Yes</option><option>No</option><option>Maybe</option></select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
                      <option value="check">Check</option><option value="zelle">Zelle</option><option value="credit_card">Credit Card</option></select></div>
                </div>

                {/* Club Logo */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Club Logo</h3>
                  <p className="text-xs text-gray-400 mb-2">Auto-applied to all teams. Each team can have its own logo too.</p>
                  <div className="flex items-center gap-3">
                    {clubLogoUrl && <img src={clubLogoUrl} alt="Club logo" className="h-12 w-12 object-contain rounded-lg border border-gray-200" />}
                    <label className={`cursor-pointer border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${clubLogoUploading ? 'opacity-50' : ''}`}>
                      {clubLogoUploading ? 'Uploading…' : clubLogoUrl ? 'Change Logo' : 'Upload Club Logo'}
                      <input type="file" accept="image/*" className="hidden" disabled={clubLogoUploading}
                        onChange={e => e.target.files?.[0] && uploadClubLogo(e.target.files[0])} />
                    </label>
                    {clubLogoUrl && <button type="button" onClick={() => { setClubLogoUrl(''); setTeams(prev => prev.map(t => t.logoUrl === clubLogoUrl ? { ...t, logoUrl: '' } : t)) }} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                  </div>
                </div>

                {/* Teams */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Teams</h3>
                  <div className="space-y-3">
                    {teams.map((team, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-500">Team {i + 1}</span>
                          {teams.length > 1 && <button type="button" onClick={() => removeTeam(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {(['clubName','teamName','division','coachName','coachPhone','coachEmail'] as (keyof TeamRow)[]).map(field => (
                            <div key={field}>
                              <label className="block text-xs text-gray-500 mb-0.5">
                                {field === 'clubName' ? 'Club Name' : field === 'teamName' ? 'Team' : field === 'coachName' ? 'Coach Name' : field === 'coachPhone' ? 'Coach Phone' : field === 'coachEmail' ? 'Coach Email' : 'Division'} *
                              </label>
                              {field === 'division' ? (
                                <select required value={team.division} onChange={e => handleTeamChange(i, 'division', e.target.value)} className={smallInputCls}>
                                  <option value="">Choose</option>
                                  {divisions.map(d => <option key={d}>{d}</option>)}
                                </select>
                              ) : (
                                <input required type={field==='coachEmail'?'email':field==='coachPhone'?'tel':'text'} value={team[field]} onChange={e => handleTeamChange(i, field, e.target.value)} className={smallInputCls} />
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Team logo */}
                        <div className="mt-2 flex items-center gap-3">
                          {team.logoUrl && (
                            <img src={team.logoUrl} alt="logo" className="h-10 w-10 object-contain rounded-lg border border-gray-200 bg-white" />
                          )}
                          <label className="cursor-pointer text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 font-medium">
                            {logoUploading === i ? 'Uploading…' : team.logoUrl ? '🔄 Replace Logo' : '📁 Upload Team Logo'}
                            <input type="file" accept="image/*" className="hidden" disabled={logoUploading === i}
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadTeamLogo(i, f) }} />
                          </label>
                          {team.logoUrl && (
                            <button type="button" onClick={() => setTeams(prev => prev.map((t, idx) => idx === i ? { ...t, logoUrl: '' } : t))}
                              className="text-xs text-red-400 hover:text-red-600">Remove</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addTeam} className="mt-3 border border-orange-400 text-orange-500 hover:bg-orange-50 rounded-lg px-3 py-1.5 text-sm font-medium">+ Add Team</button>
                </div>

                {/* Invoice */}
                <div className="border border-gray-200 rounded-xl p-4 bg-blue-50 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700">Invoice</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Amount ($)</label>
                      <input type="number" step="0.01" min="0" value={invoiceAmount} onChange={e => setInvoiceAmount(Number(e.target.value))} className={inputCls} />
                      <p className="text-xs text-gray-400 mt-0.5">Auto-calculated · edit to override</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Discount ($)</label>
                      <input type="number" step="0.01" min="0" value={discountAmount} onChange={e => setDiscountAmount(Number(e.target.value))} className={inputCls} />
                    </div>
                  </div>
                  {discountAmount > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Discount Reason</label>
                      <input value={discountNote} onChange={e => setDiscountNote(e.target.value)} placeholder="e.g. Early bird, returning club..." className={inputCls} />
                    </div>
                  )}
                  <div className="text-sm font-semibold text-gray-700">
                    Total Due: {fmt(Math.max(0, invoiceAmount - discountAmount))}
                  </div>
                </div>

                <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} autoComplete="off" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Registration'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="px-5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Individual registrations list */}
        {activeTab === 'individual' && (
          <>
            {loading ? (
              <div className="text-center py-20 text-gray-400">Loading...</div>
            ) : individualRegs.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-gray-400 mb-3">No individual players registered yet.</p>
                {indivRegEnabled && (
                  <button onClick={openIndivNew} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">+ Add First Player</button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Player','Position','Jersey / Shorts','Fee Tier','Amount','Status','Registered',''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {individualRegs.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{reg.firstName} {reg.lastName}</div>
                            <div className="text-xs text-gray-400">{reg.email}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{reg.position}</td>
                          <td className="px-4 py-3 text-gray-600">{reg.jerseySize} / {reg.shortsSize}</td>
                          <td className="px-4 py-3 text-gray-600">{reg.feeTierName || '—'}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{fmt(reg.feeTierAmount)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              reg.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                              reg.paymentStatus === 'refunded' ? 'bg-red-100 text-red-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                              {reg.paymentStatus.charAt(0).toUpperCase() + reg.paymentStatus.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{new Date(reg.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 justify-end">
                              <button onClick={() => openIndivEdit(reg)} className="text-xs text-blue-600 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-lg">Edit</button>
                              <button onClick={() => handleDeleteIndiv(reg.id, `${reg.firstName} ${reg.lastName}`)} className="text-xs text-red-500 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg">Del</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Filter bar */}
        {activeTab === 'team' && !loading && registrations.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <input
              type="search"
              placeholder="Search club, team, coach..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
            <select
              value={filterDivision}
              onChange={e => setFilterDivision(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Divisions</option>
              {allDivisionsInData.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filterPayment}
              onChange={e => setFilterPayment(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Payment Status</option>
              <option value="paid">Paid in Full</option>
              <option value="partial">Partial Payment</option>
              <option value="unpaid">No Payment</option>
            </select>
            {(filterSearch || filterDivision || filterPayment) && (
              <button
                onClick={() => { setFilterSearch(''); setFilterDivision(''); setFilterPayment('') }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Clear filters
              </button>
            )}
            {(filterSearch || filterDivision || filterPayment) && (
              <span className="text-sm text-gray-500">{filteredRegistrations.length} of {registrations.length}</span>
            )}
          </div>
        )}

        {/* Team list */}
        {activeTab === 'team' && (loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No registrations yet.</div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No registrations match your filters.</div>
        ) : (
          <div className="space-y-3">
            {filteredRegistrations.map(reg => {
              const totalPaid = reg.payments.reduce((s, p) => s + p.amount, 0)
              const due = reg.invoiceAmount - reg.discountAmount
              const balance = due - totalPaid
              return (
                <div key={reg.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Row header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <button onClick={() => setExpanded(expanded === reg.id ? null : reg.id)} className="flex-1 text-left min-w-0">
                      <div className="font-semibold text-gray-800 truncate">{reg.clubName || reg.clubContact}</div>
                      <div className="text-sm text-gray-500">{reg.contactEmail} · {reg.contactPhone}</div>
                    </button>

                    {/* Billing summary */}
                    <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Invoiced</div>
                        <div className="font-medium text-gray-700">{fmt(due)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Paid</div>
                        <div className="font-medium text-green-600">{fmt(totalPaid)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Balance</div>
                        <div className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(balance)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="hidden sm:block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{reg.teams.length} team{reg.teams.length !== 1 ? 's' : ''}</span>
                      <button onClick={() => { setPayingRegId(reg.id); const _bal1=reg.invoiceAmount-reg.discountAmount-reg.payments.reduce((s:number,p:any)=>s+p.amount,0); setPayAmount(_bal1>0?String(_bal1):''); setPayCheck(''); setPayDate(today()); setPayNotes(''); setPayMethod(reg.paymentMethod||'check') }}
                        className="text-xs text-green-600 border border-green-300 hover:border-green-500 px-2.5 py-1 rounded-lg">+ Payment</button>
                      <button onClick={() => openEdit(reg)} className="text-xs text-blue-600 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-lg">Edit</button>
                      <button onClick={() => handleDelete(reg.id, reg.clubName || reg.clubContact)} className="text-xs text-red-500 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg">Del</button>
                      <span className="text-gray-400 text-sm">{expanded === reg.id ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded === reg.id && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                      {/* Club details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {reg.clubBasedIn && <div><span className="text-gray-500">Based In: </span>{reg.clubBasedIn}</div>}
                        <div><span className="text-gray-500">Hotel: </span>{reg.needsHotel}</div>
                        <div><span className="text-gray-500">Pay Method: </span>{payLabel(reg.paymentMethod)}</div>
                        {reg.notes && <div className="col-span-full"><span className="text-gray-500">Notes: </span>{reg.notes}</div>}
                      </div>

                      {/* Teams table */}
                      {reg.teams.length > 0 && (
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                              {['Club','Team','Division','Coach','Phone','Email'].map(h => (
                                <th key={h} className="px-3 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {reg.teams.map((t, i) => (
                              <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-3 py-2">{t.clubName}</td>
                                <td className="px-3 py-2 font-medium">{t.teamName}</td>
                                <td className="px-3 py-2">{t.division}</td>
                                <td className="px-3 py-2">{t.coachName}</td>
                                <td className="px-3 py-2">{t.coachPhone}</td>
                                <td className="px-3 py-2">{t.coachEmail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Invoice summary */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700">Invoice & Payments</h3>
                          <button onClick={() => { setPayingRegId(reg.id); const _bal2=reg.invoiceAmount-reg.discountAmount-reg.payments.reduce((s:number,p:any)=>s+p.amount,0); setPayAmount(_bal2>0?String(_bal2):''); setPayCheck(''); setPayDate(today()); setPayNotes(''); setPayMethod(reg.paymentMethod||'check') }}
                            className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700">+ Record Payment</button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                          <div><span className="text-gray-500">Invoice: </span><span className="font-medium">{fmt(reg.invoiceAmount)}</span></div>
                          {reg.discountAmount > 0 && (
                            <div><span className="text-gray-500">Discount: </span><span className="font-medium text-orange-600">-{fmt(reg.discountAmount)}{reg.discountNote ? ` (${reg.discountNote})` : ''}</span></div>
                          )}
                          <div><span className="text-gray-500">Due: </span><span className="font-semibold">{fmt(due)}</span></div>
                        </div>

                        {reg.payments.length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs uppercase text-gray-500 border-b">
                                <th className="pb-1 text-left">Date</th>
                                <th className="pb-1 text-left">Method</th>
                                <th className="pb-1 text-left">Ref</th>
                                <th className="pb-1 text-right">Amount</th>
                                <th className="pb-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {reg.payments.map(p => (
                                <tr key={p.id} className="border-b border-gray-50">
                                  <td className="py-1.5">{new Date(p.receivedAt).toLocaleDateString()}</td>
                                  <td className="py-1.5">{payLabel(p.method)}</td>
                                  <td className="py-1.5 text-gray-500">{p.checkNumber || p.notes || '—'}</td>
                                  <td className="py-1.5 text-right font-medium text-green-700">{fmt(p.amount)}</td>
                                  <td className="py-1.5 text-right">
                                    <button onClick={() => handleDeletePayment(p.id, p.amount)} className="text-xs text-red-500 border border-red-200 hover:bg-red-50 hover:border-red-400 px-2 py-0.5 rounded-lg ml-2">Delete</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="font-semibold">
                                <td colSpan={3} className="pt-2 text-gray-600">Balance Due</td>
                                <td className={`pt-2 text-right ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(balance)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : (
                          <p className="text-sm text-gray-400">No payments recorded yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
