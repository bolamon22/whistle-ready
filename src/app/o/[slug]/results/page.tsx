import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, MapPin, CalendarDays, ArrowRight, BarChart3 } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, PageRec } from '../_chrome'
import type { Metadata } from 'next'
import { abs, clip } from '@/lib/seo'

export const dynamic = 'force-dynamic'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
const yr = (d: string) => (d ? d.split('-')[0] : '')
function fmtRange(s: string, e: string) {
  if (s && e && s !== e) return `${fmtDay(s)} – ${fmtDay(e)}, ${yr(e)}`
  if (s) return `${fmtDay(s)}, ${yr(s)}`
  return ''
}
function initials(name: string) { return name.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase() }
const ACCENTS = ['#0e7490', '#b45309', '#9f1239', '#1d4ed8', '#6d28d9', '#047857']
function accentFor(str: string) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return ACCENTS[h % ACCENTS.length] }

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Results & past tournaments — ${name}`
  const description = clip(`Past tournament results, scores and final standings from ${name}.`)
  const url = abs(`/o/${params.slug}/results`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function ResultsPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <NotFound slug={params.slug} />
  const org = orgRes.rows[0] as any

  let content: any = {}
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}') } catch {}
  if (content.logo) org.logoUrl = content.logo
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const workHref = (forms.staff?.enabled !== false) ? `/o/${params.slug}/work` : undefined
  const nav = buildNav(params.slug, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE orgId = ? ORDER BY startDate DESC', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const past = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') < today)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today)[0]
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} slug={params.slug} nav={nav} registerHref={registerHref} />
      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        <div className="relative max-w-6xl mx-auto px-6 py-14">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Results</h1>
          <p className="text-teal-100 mt-2">Scores, final standings and brackets from past tournaments.</p>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1">
        {past.length === 0
          ? <p className="text-slate-500">No past tournament results yet — check back after the next event.</p>
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {past.map(t => {
                const accent = accentFor(t.name)
                return (
                  <div key={t.id} className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
                    <div className="h-2" style={{ backgroundColor: accent }} />
                    <div className="p-5 flex items-start gap-4">
                      {t.logoUrl
                        ? <img src={t.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-contain bg-white border border-slate-100 flex-shrink-0" />
                        : <div className="w-20 h-20 rounded-2xl text-white flex items-center justify-center font-bold text-xl flex-shrink-0" style={{ backgroundColor: accent }}>{initials(t.name)}</div>}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-slate-900 leading-tight">{t.name}</h3>
                        <p className="text-sm text-slate-500 mt-1 inline-flex items-center gap-1"><CalendarDays size={14} /> {fmtRange(t.startDate, t.endDate)}</p>
                        {t.location && <p className="text-sm text-slate-500 mt-0.5 inline-flex items-center gap-1"><MapPin size={14} /> {t.location}</p>}
                      </div>
                    </div>
                    <div className="mt-auto border-t border-slate-100 flex">
                      <Link href={`/tournaments/${t.id}/event`} className="flex-1 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 py-3 transition-colors inline-flex items-center justify-center gap-1">Event <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" /></Link>
                      <Link href={`/tournaments/${t.id}/public`} className="flex-[1.4] text-center text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 py-3 transition-colors inline-flex items-center justify-center gap-1.5"><BarChart3 size={15} /> Results & standings</Link>
                    </div>
                  </div>
                )
              })}
            </div>}
      </main>
      <OrgFooter org={org} contact={contact} socials={socials} />
    </div>
  )
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
      <div>
        <Trophy size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1>
        <Link href={`/o/${slug}`} className="text-teal-700 hover:underline text-sm mt-2 inline-block">Back to home</Link>
      </div>
    </div>
  )
}
