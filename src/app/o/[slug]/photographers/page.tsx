import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Camera, ArrowRight } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import { photographerList, packagePrice, displayName } from '@/lib/photographers'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'

export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Event photographers — ${name}`
  const description = clip(`Credentialed photographers shooting ${name} tournaments. Book team and player photos directly.`)
  const url = orgAbs(params.slug, '/photographers')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function Page({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) notFound()
  const org = orgRes.rows[0] as any

  let content: any = {}
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (r.rows.length) content = JSON.parse(((r.rows[0] as any).value as string) || '{}')
  } catch {}
  if (content.logo) org.logoUrl = content.logo

  let raw: any[] = []
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`photographers:${org.id}`] })
    if (r.rows.length) raw = JSON.parse(((r.rows[0] as any).value as string) || '[]')
  } catch {}
  const list = photographerList(raw).filter(p => p.active)

  const base = orgBase(params.slug)
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const nav = buildNav(base, pages, Array.isArray(content.gallery) && content.gallery.length > 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} />
      <main className="max-w-5xl mx-auto px-6 py-14 w-full flex-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Event photographers</h1>
        <p className="text-slate-500 mt-2.5 max-w-[60ch]">
          Credentialed by {org.name} and shooting our events. Book them directly &mdash; we take no cut of what you pay.
        </p>

        {list.length === 0 ? (
          <div className="mt-10 bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Camera size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">No photographers listed yet.</p>
            <Link href={`${base}/gallery/shoot`} className="inline-block mt-4 text-teal-700 font-semibold hover:text-teal-900">
              Shoot with us &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 mt-8">
            {list.map(p => {
              const priced = p.packages.filter(x => x.price > 0)
              const from = priced.length ? Math.min(...priced.map(x => x.price)) : 0
              return (
                <Link key={p.slug} href={`${base}/photographers/${p.slug}`}
                  className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-600/5 transition-all">
                  <div className="flex items-start gap-4">
                    {p.avatarUrl
                      ? <img src={p.avatarUrl} alt="" className="w-14 h-14 rounded-xl object-cover bg-slate-100 shrink-0" />
                      : <div className="w-14 h-14 rounded-xl bg-slate-900 text-teal-300 flex items-center justify-center font-extrabold shrink-0">{displayName(p).slice(0, 2).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-slate-900 truncate">{displayName(p)}</h2>
                      {p.location && <p className="text-[13px] text-slate-500 mt-0.5 truncate">{p.location}</p>}
                      {p.bio && <p className="text-[13.5px] text-slate-500 mt-2 line-clamp-2 leading-relaxed">{p.bio}</p>}
                    </div>
                  </div>
                  {p.samples.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 mt-4">
                      {p.samples.slice(0, 4).map((u, i) => (
                        <div key={i} className="aspect-square rounded-lg bg-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${u})` }} />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-slate-100">
                    <span className="text-[13.5px] text-slate-500">
                      {from > 0 ? <>Packages from <strong className="text-slate-900">{packagePrice({ ...p.packages[0], price: from })}</strong></> : `${p.packages.length} packages`}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-teal-700 group-hover:gap-2.5 transition-all">
                      Book <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
      <OrgFooter org={org} contact={content.contact || {}} socials={content.socials || {}} />
    </div>
  )
}
