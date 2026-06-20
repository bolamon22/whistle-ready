import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '../_md'
import WorkForm from '@/components/WorkForm'

export const dynamic = 'force-dynamic'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }
const D_POSITIONS = ['Referee / Official', 'Scorekeeper', 'Field / Event staff', 'Athletic trainer / Medical']
const D_REF_LEVELS = ['Level 1 / Local', 'Level 2', 'Level 3', 'Regional', 'National', 'Other']
const D_INTRO = "We're looking for officials, scorekeepers, trainers, and event staff to help us run a great event. Tell us about yourself and we'll be in touch about open positions."
const D_AGE = 'I am at least 16 years old (or in high school or older)'

export default async function OrgWorkPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Form not found</h1></div></div>
  const org = orgRes.rows[0] as any
  let forms: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } catch {}
  const sf = forms.staff || {}
  const positions = Array.isArray(sf.positions) && sf.positions.length ? sf.positions : D_POSITIONS
  const refLevels = Array.isArray(sf.refLevels) && sf.refLevels.length ? sf.refLevels : D_REF_LEVELS
  const ageLabel = sf.ageLabel !== undefined ? sf.ageLabel : D_AGE
  const introHtml = mdToHtml(sf.intro || D_INTRO)
  const confirmationTitle = sf.confirmationTitle || 'Application received!'
  const confirmationHtml = mdToHtml(sf.confirmationMessage || "Thanks for your interest in working our events! We've received your application and will reach out about open positions.")
  const today = new Date().toISOString().slice(0, 10)
  let events: { id: string; name: string }[] = []
  try { const er = await client.execute({ sql: 'SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] }); events = (er.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).map(t => ({ id: String(t.id), name: String(t.name || 'Event') })) } catch {}
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0b1220] text-white"><div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">{org.logoUrl && <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" />}<div><div className="text-xs uppercase tracking-[0.2em] text-teal-300">Work at our events</div><h1 className="text-xl font-extrabold leading-tight">{org.name}</h1></div></div></header>
      <WorkForm orgId={org.id} introHtml={introHtml} positions={positions} refLevels={refLevels} ageLabel={ageLabel} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} events={events} />
    </div>
  )
}
