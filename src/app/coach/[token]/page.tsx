import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Download, Wallet } from 'lucide-react'
import { appBaseUrl } from '@/lib/playerPass'
import { loadCoachPass, waiverVersionOf } from '@/lib/coachPass'
import { PrintCardButton } from '@/app/pass/[token]/PassActions'
import { cardPrintCss, CARD_PRINT_NOTE } from '@/lib/cardPrint'
import { walletEnabled } from '@/lib/wallet'

export const dynamic = 'force-dynamic'

// /coach/<token> — a coach's own credential. Public and never indexed: the
// unguessable token is the authorization, exactly as on /pass and /vendor. Not to
// be confused with /dashboard/coach, which is the coach ROLE's signed-in home.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CoachCredentialPage({ params }: { params: { token: string } }) {
  const base = appBaseUrl(headers())
  const pass = await loadCoachPass(params.token, base)
  if (!pass) notFound()

  const { card } = pass
  const cardPng = `/coach/${params.token}/card.png`
  const teamLine = pass.teams.length
    ? pass.teams.map(t => [t.team, t.division].filter(Boolean).join(' · ')).join('  ·  ')
    : card.business

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <style>{cardPrintCss('coach-card')}</style>
      <div className="max-w-md mx-auto px-5 py-8 sm:py-12">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-rose-300">Coach credential</div>
          <h1 className="text-2xl font-extrabold leading-tight mt-1">{card.name}</h1>
          {teamLine && <p className="text-slate-300 text-sm mt-1">{teamLine}</p>}
        </div>

        <img id="coach-card" src={cardPng} alt={`Coach credential for ${card.name}`} width={720} height={1140}
          className="w-full max-w-[360px] mx-auto rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 bg-white" />

        <div className="max-w-[360px] mx-auto mt-5 print:hidden">
          <div className="grid grid-cols-2 gap-2.5">
            <a href={cardPng} download={`coach-credential-${card.code.replace('-', '')}.png`}
              className="flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl py-3 text-sm">
              <Download size={16} /> Save to phone
            </a>
            <PrintCardButton className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold rounded-xl py-3 text-sm" />
          </div>
          {/* Hidden until the signing certificate exists — see walletEnabled(). */}
          {walletEnabled() && (
            <a href={`/api/wallet/coach/${params.token}`} download
              className="flex items-center justify-center gap-2 mt-2.5 bg-white text-[#0b1220] font-bold rounded-xl py-3 text-sm">
              <Wallet size={16} /> Add to Apple Wallet
            </a>
          )}
          <p className="text-center text-xs text-slate-400 mt-2.5 leading-relaxed">
            On iPhone, press and hold the card to add it to Photos. {CARD_PRINT_NOTE}
          </p>
        </div>

        {/* SAYING IT PLAINLY. The waiver is the requirement; this badge is not, and
            a coach who turns up without it should not think they have a problem. */}
        <div className="max-w-[360px] mx-auto mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-slate-300 leading-relaxed print:hidden">
          You do not need to bring this. Your waiver is on file and that is what matters —
          the card just saves you a conversation at the coaches&rsquo; tent.
        </div>

        <div className="max-w-[360px] mx-auto mt-6 border-t border-white/10 pt-5 text-sm text-slate-300 space-y-1.5">
          {card.eventNames && <div><span className="text-slate-500">Event</span> · {card.eventNames}</div>}
          {card.eventDates && <div><span className="text-slate-500">Dates</span> · {card.eventDates}{card.location ? ` · ${card.location}` : ''}</div>}
          {card.business && <div><span className="text-slate-500">Club</span> · {card.business}</div>}
          <div><span className="text-slate-500">Credential ID</span> · <span className="font-mono tracking-wider">{card.code}</span></div>
          <div><span className="text-slate-500">Waiver signed</span> · {pass.signedOn} (v{waiverVersionOf(pass.data)})</div>
        </div>

        {pass.tournamentId && (
          <p className="text-center mt-8 text-sm print:hidden">
            <Link href={`/tournaments/${pass.tournamentId}/coach-waiver`} className="text-rose-300 hover:text-rose-200 underline underline-offset-4">Add another team</Link>
          </p>
        )}
        {card.orgName && <p className="text-center text-xs text-slate-500 mt-6">{card.orgName}</p>}
      </div>
    </div>
  )
}
