import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ArrowLeft } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import FaqBlock from '@/components/FaqBlock'
import { resolveBlocks } from '@/lib/eventBlocks'

// Cache policy for published pages.
//
// Jul 20 2026: these pages read Turso via @libsql/client, which uses fetch() under the
// hood, and Next caches fetch responses in its Data Cache. A `dynamic` export does NOT
// disable that, so pages re-rendered on every request while replaying a stale DB
// response — and since nothing expired, they stayed stale indefinitely (an org hero
// image and gallery went missing until it was noticed).
//
// `revalidate` is the fix rather than turning caching off: content is served from cache
// for this many seconds then re-fetched, so staleness is always bounded. Saving in the
// admin also calls revalidatePath() for an immediate refresh. Don't swap this back to
// dynamic/no-store — that made every visit re-run every query (~14s page loads).
export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function BlockPage({ params }: { params: { id: string; blockId: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  const base = `/tournaments/${params.id}`
  const block = resolveBlocks(c).find((b: any) => b.id === params.blockId && !b.hidden)
  const p = (block && block.props) || {}

  let body: JSX.Element | null = null
  let title = ''
  if (block && block.type === 'custom') { title = p.title || 'Details'; body = p.body ? <div className="prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(p.body) }} /> : null }
  else if (block && block.type === 'faq') {
    title = p.title || 'Details'
    const items = (Array.isArray(p.items) ? p.items : []).filter((it: any) => it && it.q)
    body = items.length ? <FaqBlock items={items} /> : null
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 text-sm font-semibold mb-4"><ArrowLeft size={15} /> Back to event page</Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-6">{title || 'Page'}</h1>
      {body
        ? <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">{body}</div>
        : <p className="text-slate-500">This page has no content yet.</p>}
    </main>
  )
}
