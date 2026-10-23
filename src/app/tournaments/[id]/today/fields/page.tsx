import { createClient } from '@libsql/client'
import type { Metadata } from 'next'
import { MapPin, Navigation } from 'lucide-react'
import FieldMap from '@/components/FieldMap'
import GameDayHeader from '@/components/GameDayHeader'

// Field maps and directions inside game day mode: the event page's Location section
// (venues first, then the older event-page locations list, same rule as the event
// page), one venue per card, sized for a phone.
export const revalidate = 30
export const metadata: Metadata = { title: 'Field map', robots: { index: false, follow: true } }

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function GameDayFields({ params }: { params: { id: string } }) {
  const client = db()
  let t: any = null; let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT id, name, location, venues FROM "Tournament" WHERE id = ?', args: [params.id] }); t = r.rows[0] || null } catch { }
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(String((r.rows[0] as any).value || '{}')) } catch { }
  const venues: any[] = (() => {
    try {
      const raw = JSON.parse(String(t?.venues || '[]'))
      const list = Array.isArray(raw) ? raw : (raw.venues || [])
      return (Array.isArray(list) ? list : []).filter((v: any) => v && (v.address || v.fieldMapUrl))
        .map((v: any) => ({ name: v.name || '', address: v.address || '', mapUrl: v.mapUrl || '', fieldMapUrl: v.fieldMapUrl || '' }))
    } catch { return [] }
  })()
  const legacy: any[] = (Array.isArray(c.locations) ? c.locations : []).filter((l: any) => l && (l.name || l.address))
  const locations: any[] = venues.length ? venues : legacy
  const dirHref = (l: any) => l.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address || l.name)}`

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      <GameDayHeader tournamentId={params.id} title="Field map" fullHref={`/tournaments/${params.id}/event?full=1#locations`} />
      <div className="max-w-md mx-auto p-3.5 space-y-3">
        {locations.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-600">
            Field maps haven&apos;t been posted yet.
            {t?.location && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(t.location))}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 bg-teal-600 text-white rounded-xl py-2.5 font-semibold"><Navigation size={15} /> Directions to {String(t.location)}</a>}
          </div>
        )}
        {locations.map((l, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {l.fieldMapUrl
              ? <FieldMap src={l.fieldMapUrl} label={l.name} />
              : l.address
                ? <iframe title={`Map of ${l.name || 'venue'}`} src={`https://www.google.com/maps?q=${encodeURIComponent(l.address)}&output=embed`} className="w-full h-44 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                : null}
            <div className="p-4">
              <div className="font-bold text-slate-900">{l.name}</div>
              {l.address && <div className="text-sm text-slate-500 mt-0.5 flex items-start gap-1"><MapPin size={13} className="mt-0.5 shrink-0" /> {l.address}</div>}
              {(l.mapUrl || l.address) && <a href={dirHref(l)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2.5 text-sm font-semibold"><Navigation size={15} /> Directions</a>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
