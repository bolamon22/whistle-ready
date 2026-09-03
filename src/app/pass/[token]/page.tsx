import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { appBaseUrl, loadPlayerPass } from '@/lib/playerPass'
import CardTools from './PassActions'

export const dynamic = 'force-dynamic'

// The player card page: /pass/<token>. Public, and never indexed — the unguessable token in
// the URL is the authorization (families get it on the confirmation screen and by email), and
// it also lets them change the photo and the QR link.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function PlayerPassPage({ params }: { params: { token: string } }) {
  const pass = await loadPlayerPass(params.token, appBaseUrl(headers()))
  if (!pass) notFound()
  const { card, submission } = pass
  const v = encodeURIComponent(String(submission.updatedAt || submission.submittedAt || ''))
  const cardPng = `/pass/${params.token}/card.png?v=${v}`
  const teamLine = [card.clubName, card.teamName].filter(Boolean).join(' — ')

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-md mx-auto px-5 py-8 sm:py-12">
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-teal-300">Player card</div>
          <h1 className="text-2xl font-extrabold leading-tight mt-1">{card.playerName}</h1>
          {teamLine && <p className="text-slate-300 text-sm mt-1">{teamLine}</p>}
        </div>

        {/* The card itself — the same PNG families save and staff print. */}
        <img src={cardPng} alt={`Player card for ${card.playerName}`} width={720} height={1140}
          className="w-full max-w-[360px] mx-auto rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 bg-white" />

        <div className="max-w-[360px] mx-auto mt-5">
          <a href={cardPng} download={`player-card-${card.code.replace('-', '')}.png`}
            className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-[#0b1220] font-bold rounded-xl py-3 text-sm">
            <Download size={16} /> Save to phone
          </a>
          <p className="text-center text-xs text-slate-400 mt-2 leading-relaxed">On iPhone, press and hold the card to add it to Photos.</p>
        </div>
        <CardTools token={params.token} url={pass.passUrl} title={`${card.playerName} — player card`} photoUrl={card.photoUrl} cardLink={String(submission.data?.cardLink || '')} />

        <div className="max-w-[360px] mx-auto mt-8 border-t border-white/10 pt-5 text-sm text-slate-300 space-y-1.5">
          {card.tournamentName && <div><span className="text-slate-500">Tournament</span> · {card.tournamentName}</div>}
          {card.tournamentDates && <div><span className="text-slate-500">Dates</span> · {card.tournamentDates}{card.location ? ` · ${card.location}` : ''}</div>}
          <div><span className="text-slate-500">Player ID</span> · <span className="font-mono tracking-wider">{card.code}</span></div>
          <div><span className="text-slate-500">QR code opens</span> · {card.qrLabel}</div>
          <div><span className="text-slate-500">Waiver on file</span> · {card.signedOn}</div>
        </div>

        {submission.tournamentId && (
          <p className="text-center mt-8 text-sm">
            <Link href={`/tournaments/${submission.tournamentId}/player-waiver`} className="text-teal-300 hover:text-teal-200 underline underline-offset-4">Register another player</Link>
          </p>
        )}
        {card.orgName && <p className="text-center text-xs text-slate-500 mt-6">{card.orgName}</p>}
      </div>
    </div>
  )
}
