import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '../../_md'
import PlayerRegForm from './PlayerRegForm'

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

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const DEFAULT_WAIVER = `## 1. Acknowledgment of Risk
I understand that lacrosse is a high-intensity sport involving aggressive play and physical contact, and that participation carries inherent risks including serious physical injury, permanent disability, or death. I voluntarily assume full responsibility for my/my child's participation.

## 2. Release of Liability
I release, waive, and hold harmless the tournament organizers, their staff, volunteers, and the facilities from any and all liability arising out of participation in this event.

## 3. Media Release
I grant permission to use photographs or video taken during activities for promotional purposes.

## 4. Electronic Signature
By submitting this form I confirm I have read and agree to this waiver and that my typed name is my legal electronic signature.`

const DEFAULT_FIELDS = { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false }

export default async function PlayerRegistrationPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
        <div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Form not found</h1></div>
      </div>
    )
  }
  const org = orgRes.rows[0] as any

  let forms: any = {}
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] })
    if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}')
  } catch { /* none */ }
  // org-site logo override for brand consistency
  try {
    const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo }
  } catch { /* none */ }

  const pf = forms.player || {}
  const waiverTitle = pf.waiverTitle || 'Player Participation Waiver & Release of Liability'
  const waiverHtml = mdToHtml(pf.waiverText || DEFAULT_WAIVER)
  const fields = { ...DEFAULT_FIELDS, ...(pf.fields || {}) }
  const confirmationTitle = pf.confirmationTitle || "You're registered!"
  const confirmationHtml = mdToHtml(pf.confirmationMessage || "Thanks for registering. We've received your information and signed waiver. We'll be in touch with event details \u2014 see you on the field!")

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0b1220] text-white">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">
          {org.logoUrl
            ? <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" />
            : <Link href={`/o/${params.slug}`} className="font-extrabold text-lg">{org.name}</Link>}
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-teal-300">Player Waiver</div>
            <h1 className="text-xl font-extrabold leading-tight">{org.name}</h1>
          </div>
        </div>
      </header>
      <p className="max-w-2xl mx-auto px-6 pt-6 text-sm text-slate-500">All players must complete this waiver to compete. Required fields are marked *.</p>
      <PlayerRegForm orgId={org.id} fields={fields} waiverTitle={waiverTitle} waiverHtml={waiverHtml} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} />
    </div>
  )
}
