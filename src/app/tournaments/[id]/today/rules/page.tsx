import { createClient } from '@libsql/client'
import type { Metadata } from 'next'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { resolveRules } from '@/lib/rules'
import GameDayHeader from '@/components/GameDayHeader'

// The event's rules inside game day mode. Same rules as /tournaments/<id>/rules
// (lib/rules: the event's own text or the organization's rule set), under the slim
// Game day header instead of the full site's.
export const revalidate = 30
export const metadata: Metadata = { title: 'Rules', robots: { index: false, follow: true } }

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function GameDayRules({ params }: { params: { id: string } }) {
  const client = db()
  let body = ''
  try {
    const tRes = await client.execute({ sql: 'SELECT orgId FROM "Tournament" WHERE id = ?', args: [params.id] })
    const orgId = (tRes.rows[0] as any)?.orgId
    let c: any = {}
    try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(String((r.rows[0] as any).value || '{}')) } catch { }
    let sets: any[] = []
    try { if (orgId) { const rr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgRules:${orgId}`] }); if (rr.rows.length) { const v = JSON.parse(String((rr.rows[0] as any).value || '{}')); sets = Array.isArray(v.sets) ? v.sets : [] } } } catch { }
    body = resolveRules(c, sets).body || ''
  } catch { }
  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      <GameDayHeader tournamentId={params.id} title="Rules" fullHref={`/tournaments/${params.id}/rules?full=1`} />
      <div className="max-w-2xl mx-auto p-3.5">
        {body
          ? <div className="bg-white border border-slate-200 rounded-2xl p-4 prose-body text-[15px]" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
          : <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-500">Rules haven&apos;t been posted yet.</div>}
      </div>
    </div>
  )
}
