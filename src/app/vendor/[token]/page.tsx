import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { loadVendorApproval, filledInstructions } from '@/lib/vendorApproval'
import { priceLabel } from '@/lib/vendorForm'
import { mdToHtml } from '@/app/o/[slug]/_md'
import PayButton from './PayButton'

export const dynamic = 'force-dynamic'

// /vendor/<token> — the one page an applicant gets after applying. Public and never
// indexed: the unguessable token IS the authorization (it only ever goes to the email
// on the application). It shows where the application stands, and once approved it's
// also the booth packet and the place they pay.
export const metadata: Metadata = { robots: { index: false, follow: false } }

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-6 py-2 border-b border-slate-100 last:border-0 text-sm">
    <span className="text-slate-400">{k}</span>
    <span className="text-slate-700 text-right font-medium">{v}</span>
  </div>
)

export default async function VendorApprovalPage({ params, searchParams }: { params: { token: string }; searchParams: { paid?: string } }) {
  const a = await loadVendorApproval(params.token)
  if (!a) notFound()

  const d = a.submission.data || {}
  const company = String(d.companyName || 'Your application')
  const typeName = String(d.vendorTypeName || d.level || '')
  const orgName = a.org?.name || 'Sunshine Events Group'
  const amountText = priceLabel(a.amount) || 'To be confirmed'
  const blocks = filledInstructions(a.cfg)
  // Stripe bounced them back with ?paid=1, but the WEBHOOK is what actually marks it
  // paid — and an ACH payment is still days from settling at that point. Say "received",
  // not "paid", until the row itself says paid.
  const justReturned = searchParams?.paid === '1' && !a.paid

  const state = a.declined ? 'declined' : a.approved ? 'approved' : 'pending'
  const banner = {
    pending:  { icon: <Clock size={22} />,        cls: 'bg-amber-50 border-amber-200 text-amber-900',  title: 'Under review',  body: `We've got your application for ${typeName || 'a booth'}${a.tournamentName ? ` at ${a.tournamentName}` : ''}. We review every one before confirming a spot — you'll hear from us by email either way. Nothing has been charged.` },
    approved: { icon: <CheckCircle2 size={22} />, cls: 'bg-teal-50 border-teal-200 text-teal-900',     title: "You're approved", body: `You have a spot${a.tournamentName ? ` at ${a.tournamentName}` : ''}. Everything you need is below.` },
    declined: { icon: <XCircle size={22} />,      cls: 'bg-slate-100 border-slate-200 text-slate-700', title: 'Not this time', body: "We aren't able to fit this one in. Nothing has been charged, and you're welcome to apply again for a future event." },
  }[state]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0b1220] text-white">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">
          {a.org?.logoUrl ? <img src={a.org.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" /> : null}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-teal-300">Vendor application</div>
            <h1 className="text-xl font-extrabold leading-tight">{company}</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <div className={`border rounded-2xl p-5 flex gap-3 ${banner.cls}`}>
          <div className="shrink-0 mt-0.5">{banner.icon}</div>
          <div>
            <h2 className="font-bold text-base">{banner.title}</h2>
            <p className="text-sm leading-relaxed mt-1 opacity-90">{banner.body}</p>
          </div>
        </div>

        {a.paid && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Paid in full</h2>
            <p className="text-sm text-slate-500">{amountText} received{a.submission.paidAt ? ` on ${new Date(a.submission.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}. Nothing else to do — see you there.</p>
          </div>
        )}

        {justReturned && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Payment received</h2>
            <p className="text-sm text-slate-500">Thanks — we&rsquo;re confirming it with our processor. Bank transfers take a few days to clear. This page updates on its own; nothing more is needed from you.</p>
          </div>
        )}

        {a.approved && !a.paid && a.amount > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-baseline justify-between gap-4 mb-1">
              <h2 className="text-base font-bold text-slate-800">Booth fee</h2>
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{amountText}</div>
            </div>
            <p className="text-sm text-slate-500 mb-5">{typeName}{a.tournamentName ? ` · ${a.tournamentName}` : ''}</p>
            <PayButton token={a.token} amount={amountText} />
          </div>
        )}

        {a.approved && blocks.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-100">Your booth packet</h2>
            {blocks.map(b => (
              <div key={b.key}>
                <h3 className="text-xs uppercase tracking-[0.12em] font-bold text-teal-700 mb-1.5">{b.label}</h3>
                <div className="text-sm text-slate-600 leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(b.body) }} />
              </div>
            ))}
          </div>
        )}

        {a.approved && blocks.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Setup details</h2>
            <p className="text-sm text-slate-500">We&rsquo;ll post your booth location, load-in and load-out times here as the event gets closer. Check back, or watch your email.</p>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">What you told us</h2>
          <Row k="Company" v={company} />
          {d.companyContact ? <Row k="Contact" v={String(d.companyContact)} /> : null}
          {d.email ? <Row k="Email" v={String(d.email)} /> : null}
          {d.phone ? <Row k="Phone" v={String(d.phone)} /> : null}
          {typeName ? <Row k="Booth type" v={typeName} /> : null}
          {a.tournamentName ? <Row k="Event" v={a.tournamentName} /> : null}
          {d.products ? <Row k={d.selling === false ? 'Showcasing' : 'Products'} v={String(d.products)} /> : null}
        </div>

        <p className="text-center text-xs text-slate-400 pb-6">
          {orgName} · Keep this link — it&rsquo;s the only way back to this page.
        </p>
      </div>
    </div>
  )
}
