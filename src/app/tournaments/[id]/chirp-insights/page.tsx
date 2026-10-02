import { prisma } from '@/lib/db'
import TournamentNav from '../TournamentNav'
import ChirpFaqSuggest from '@/components/ChirpFaqSuggest'
import { MessageCircleQuestion } from 'lucide-react'
import { roleLabel, staffLogKey, type StaffLogEntry } from '@/lib/chirp'

export const dynamic = 'force-dynamic'

const norm = (q: string) => q.toLowerCase().trim().replace(/[?.!,]+$/g, '').replace(/\s+/g, ' ')
function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const shortRole = (r: string) => roleLabel(r).replace(/^an? /, '').split(',')[0].replace(/ \(.*$/, '')

export default async function ChirpInsightsPage({ params, searchParams }: { params: { id: string }; searchParams?: { staff?: string } }) {
  const [t, row, staffRow] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: params.id } }).catch(() => null),
    prisma.appSetting.findUnique({ where: { key: `chirpLog:${params.id}` } }).catch(() => null),
    prisma.appSetting.findUnique({ where: { key: staffLogKey(params.id) } }).catch(() => null),
  ])
  let log: { q: string; at: number; team?: string }[] = []
  try { const v = JSON.parse((row as any)?.value || '[]'); if (Array.isArray(v)) log = v } catch {}
  // Staff questions from the floating Chirp and Help → Ask Chirp. The ones the
  // manual could not answer are the to-do list for the help pages.
  let staffLog: StaffLogEntry[] = []
  try { const v = JSON.parse((staffRow as any)?.value || '[]'); if (Array.isArray(v)) staffLog = v } catch {}
  const missedOnly = searchParams?.staff === 'missed'
  const missedCount = staffLog.filter(e => !e.covered).length
  const staffShown = [...staffLog].reverse().filter(e => !missedOnly || !e.covered).slice(0, 80)
  const tabCls = (on: boolean) => `text-xs font-medium px-3 py-1.5 rounded-full border ${on ? 'bg-teal-50 border-teal-200 text-teal-800' : 'border-slate-200 text-slate-500 hover:text-slate-800'}`

  const counts = new Map<string, { q: string; n: number }>()
  for (const e of log) { const k = norm(e.q || ''); if (!k) continue; const c = counts.get(k); if (c) c.n++; else counts.set(k, { q: e.q, n: 1 }) }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10)
  const recent = [...log].reverse().slice(0, 60)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <TournamentNav id={params.id} name={(t as any)?.name || 'Tournament'} logoUrl={(t as any)?.logoUrl || ''} />

        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><MessageCircleQuestion size={20} className="text-teal-600" /> Chirp insights</h1>
          <p className="text-sm text-slate-500 mt-1">What your staff and attendees ask Chirp.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-semibold text-slate-900">Staff questions</h2>
              <p className="text-sm text-slate-500">{staffLog.length} asked · {missedCount} the help manual couldn't answer</p>
            </div>
            <div className="flex gap-1.5">
              <a href="?" className={tabCls(!missedOnly)}>All</a>
              <a href="?staff=missed" className={tabCls(missedOnly)}>Couldn't answer ({missedCount})</a>
            </div>
          </div>
          {staffShown.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">{missedOnly ? 'Nothing unanswered.' : 'No staff questions yet. Questions asked in the floating Chirp or Help → Ask Chirp show up here.'}</p>
          ) : (
            <div className="space-y-1">
              {staffShown.map((e, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-slate-700">{e.q}{!e.covered && <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Not in manual</span>}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{[e.name, shortRole(e.role), e.page].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{ago(e.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <h2 className="font-semibold text-slate-900 mb-1">Public questions</h2>
        <p className="text-sm text-slate-500 mb-3">What attendees ask Chirp on your public pages, without names. {log.length} question{log.length === 1 ? '' : 's'} so far.</p>

        {log.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            No questions yet. Once coaches and parents chat with Chirp on the event, register, schedule, or Today pages, their questions show up here.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Most asked</h2>
              <div className="space-y-1.5">
                {top.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{r.q}</span>
                    <span className="shrink-0 text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">{r.n}×</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Turn questions into a FAQ</h2>
              <p className="text-sm text-slate-500 mb-3">Let Chirp draft answers to the most common questions, then add the good ones to your event page.</p>
              <ChirpFaqSuggest tournamentId={params.id} />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Recent questions</h2>
              <div className="space-y-2">
                {recent.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-slate-700">{e.q}{e.team ? <span className="ml-2 text-[11px] text-slate-400">· {e.team}</span> : null}</span>
                    <span className="shrink-0 text-xs text-slate-400">{ago(e.at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
