import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ScrollText, ArrowLeft } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'

export const dynamic = 'force-dynamic'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function TournamentRulesPage({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  const base = `/tournaments/${params.id}`

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 text-sm font-semibold mb-4"><ArrowLeft size={15} /> Back to event page</Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 inline-flex items-center gap-2 mb-6"><ScrollText size={22} className="text-slate-400" /> Rules &amp; policies</h1>
      {c.rules
        ? <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(c.rules) }} />
        : <p className="text-slate-500">Rules &amp; policies haven&apos;t been posted yet.</p>}
    </main>
  )
}
