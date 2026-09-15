import { prisma } from '@/lib/db'
import { getSubmissionByPassToken, type FormSubmission } from '@/lib/formSubmissions'
import { orgById, type Org } from '@/lib/org'
import { mediaConfig, photographerSharePct, type MediaConfig } from '@/lib/mediaForm'

// One loader for the media credential page (/media/<token>), mirroring
// vendorApproval.ts so the page a photographer reads and the row staff approved can
// never drift apart.
//
// The token is the same unguessable 128-bit key the player pass and the vendor
// approval use. It IS the authorization: a photographer has no account here, and the
// link only ever goes to the address on the application.

export type MediaApproval = {
  token: string
  submission: FormSubmission
  orgId: string
  tournamentId: string
  org: Org | null
  tournamentName: string
  eventDates: string
  cfg: MediaConfig
  /** Level ids the applicant asked for, intersected with what the org still offers. */
  levels: { id: string; name: string; closed: boolean }[]
  keepPct: number
  approved: boolean
  declined: boolean
}

export async function loadMediaApproval(token: string): Promise<MediaApproval | null> {
  const sub = await getSubmissionByPassToken(token)
  if (!sub || sub.formType !== 'media') return null

  const org = await orgById(sub.orgId)
  let tournamentName = String(sub.data?.tournamentName || '')
  let eventDates = ''
  if (sub.tournamentId) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>('SELECT name, startDate, endDate FROM "Tournament" WHERE id = ?', sub.tournamentId)
      const r = rows?.[0]
      if (r) {
        if (!tournamentName) tournamentName = String(r.name || '')
        eventDates = fmtDates(String(r.startDate || ''), String(r.endDate || ''))
      }
    } catch { /* the page just omits the dates */ }
  }

  let cfg: MediaConfig
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${sub.orgId}` } })
    cfg = mediaConfig(row ? JSON.parse(row.value || '{}').media : {})
  } catch { cfg = mediaConfig({}) }

  const want = new Set((Array.isArray(sub.data?.levels) ? sub.data.levels : []).map((x: any) => String(x || '')))
  const levels = cfg.levels.filter(l => want.has(l.id)).map(l => ({ id: l.id, name: l.name, closed: l.closed }))

  return {
    token, submission: sub, orgId: sub.orgId, tournamentId: sub.tournamentId, org,
    tournamentName, eventDates, cfg, levels,
    keepPct: photographerSharePct(cfg),
    approved: String(sub.status || '') === 'approved',
    declined: String(sub.status || '') === 'declined',
  }
}

/** "Oct 24-25, 2026" / "Oct 24, 2026". Dates are stored as YYYY-MM-DD strings. */
export function fmtDates(start: string, end: string): string {
  const d = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  }
  const a = d(start), b = d(end)
  if (!a) return ''
  const mon = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' })
  if (!b || a.getTime() === b.getTime()) return `${mon(a)} ${a.getDate()}, ${a.getFullYear()}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${mon(a)} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`
  }
  return `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}, ${b.getFullYear()}`
}
