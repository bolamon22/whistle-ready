'use client'
import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import TournamentNav from '../../TournamentNav'

// Auto-detect TourneyMachine column → our field
const TM_MAP: Record<string, string> = {
  'club name': 'clubName', 'club': 'clubName', 'organization': 'clubName', 'org': 'clubName', 'club/org': 'clubName',
  'team name': 'teamName', 'team': 'teamName',
  'division': 'division', 'age group': 'division', 'grade group': 'division', 'div': 'division', 'age': 'division', 'grade': 'division',
  'head coach': 'coachName', 'coach name': 'coachName', 'coach': 'coachName', 'head coach name': 'coachName', 'primary contact': 'coachName',
  'email': 'coachEmail', 'coach email': 'coachEmail', 'head coach email': 'coachEmail',
  'phone': 'coachPhone', 'coach phone': 'coachPhone', 'head coach phone': 'coachPhone', 'mobile': 'coachPhone', 'cell': 'coachPhone',
  'contact name': 'contactName', 'contact': 'contactName', 'billing contact': 'contactName',
  'contact email': 'contactEmail', 'billing email': 'contactEmail',
  'contact phone': 'contactPhone', 'billing phone': 'contactPhone',
}

const FIELD_LABELS: Record<string, string> = {
  clubName: 'Club Name', teamName: 'Team Name', division: 'Division',
  coachName: 'Coach Name', coachEmail: 'Coach Email', coachPhone: 'Coach Phone',
  contactName: 'Contact Name', contactEmail: 'Contact Email', contactPhone: 'Contact Phone',
}

type FieldKey = keyof typeof FIELD_LABELS

interface ParsedRow { [col: string]: string }
interface ColumnMap { [col: string]: string } // col → fieldKey or ''
interface ClubGroup {
  clubName: string
  contactName: string
  contactEmail: string
  contactPhone: string
  teams: { teamName: string; division: string; coachName: string; coachEmail: string; coachPhone: string }[]
}

function detectMapping(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<string>()
  for (const h of headers) {
    const key = h.trim().toLowerCase()
    const field = TM_MAP[key]
    if (field && !used.has(field)) {
      map[h] = field
      used.add(field)
    } else {
      map[h] = ''
    }
  }
  return map
}

function buildGroups(rows: ParsedRow[], colMap: ColumnMap): ClubGroup[] {
  const get = (row: ParsedRow, field: string) => {
    const col = Object.entries(colMap).find(([, f]) => f === field)?.[0]
    return col ? String(row[col] || '').trim() : ''
  }

  const byClub = new Map<string, { rows: ParsedRow[]; contactName: string; contactEmail: string; contactPhone: string }>()
  for (const row of rows) {
    const club = get(row, 'clubName') || get(row, 'teamName') || 'Unknown Club'
    const contact = get(row, 'contactName') || get(row, 'coachName')
    const contactEmail = get(row, 'contactEmail') || get(row, 'coachEmail')
    const contactPhone = get(row, 'contactPhone') || get(row, 'coachPhone')
    if (!byClub.has(club)) {
      byClub.set(club, { rows: [], contactName: contact, contactEmail, contactPhone })
    }
    const g = byClub.get(club)!
    if (!g.contactName && contact) g.contactName = contact
    if (!g.contactEmail && contactEmail) g.contactEmail = contactEmail
    if (!g.contactPhone && contactPhone) g.contactPhone = contactPhone
    g.rows.push(row)
  }

  const groups: ClubGroup[] = []
  for (const [clubName, { rows: clubRows, contactName, contactEmail, contactPhone }] of byClub) {
    groups.push({
      clubName,
      contactName,
      contactEmail,
      contactPhone,
      teams: clubRows.map(row => ({
        teamName: get(row, 'teamName') || '',
        division: get(row, 'division') || '',
        coachName: get(row, 'coachName') || '',
        coachEmail: get(row, 'coachEmail') || '',
        coachPhone: get(row, 'coachPhone') || '',
      })),
    })
  }
  return groups
}

export default function TourneyMachineImportPage() {
  const params = useParams() as { id: string }
  const router = useRouter()
  const [tournamentName, setTournamentName] = useState('')
  const [tournamentLogo, setTournamentLogo] = useState('')
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [colMap, setColMap] = useState<ColumnMap>({})
  const [groups, setGroups] = useState<ClubGroup[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // load tournament name
  useState(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(d => {
      setTournamentName(d.name || '')
      setTournamentLogo(d.logoUrl || '')
    })
  })

  async function handleFile(file: File) {
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/registrations/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.error) { toast.error(data.error); return }
    setHeaders(data.headers)
    setRows(data.rows)
    const detected = detectMapping(data.headers)
    setColMap(detected)
    setStep('map')
  }

  function goToPreview() {
    const g = buildGroups(rows, colMap)
    if (!g.length) { toast.error('No valid rows found'); return }
    setGroups(g)
    setStep('preview')
  }

  async function runImport() {
    setImporting(true)
    setErrors([])
    let count = 0
    const errs: string[] = []
    for (const g of groups) {
      try {
        const res = await fetch('/api/registrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tournamentId: params.id,
            source: 'import',
            clubName: g.clubName,
            clubContact: g.contactName || g.clubName,
            contactEmail: g.contactEmail || '',
            contactPhone: g.contactPhone || '',
            numTeams: g.teams.length,
            needsHotel: 'No',
            paymentMethod: 'check',
            notes: 'Imported via spreadsheet upload',
            invoiceAmount: 0,
            discountAmount: 0,
            discountNote: '',
            teams: g.teams.map(t => ({
              clubName: g.clubName,
              teamName: t.teamName,
              division: t.division,
              coachName: t.coachName,
              coachPhone: t.coachPhone,
              coachEmail: t.coachEmail,
              logoUrl: '',
            })),
          }),
        })
        if (res.ok) count++
        else errs.push(`${g.clubName}: ${(await res.json()).error || res.status}`)
      } catch (e) {
        errs.push(`${g.clubName}: network error`)
      }
    }
    setImported(count)
    setErrors(errs)
    setImporting(false)
    setStep('done')
  }

  const mappedFields = new Set(Object.values(colMap).filter(Boolean))
  const unmappedCols = headers.filter(h => !colMap[h])
  const requiredMapped = mappedFields.has('teamName') || mappedFields.has('clubName')

  return (
    <div>
      <TournamentNav id={params.id} name={tournamentName} logoUrl={tournamentLogo} />

      <div className="max-w-3xl">
        <div className="breadcrumb">
          <Link href={`/tournaments/${params.id}/registrations`} className="hover:text-sky-600">Registrations</Link>
          <span>/</span><span className="text-slate-700">Import teams</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {(['upload','map','preview'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                ${step === s ? 'bg-sky-600 text-white' :
                  ['upload','map','preview','done'].indexOf(step) > i ? 'bg-emerald-500 text-white' :
                  'bg-slate-200 text-slate-500'}`}>
                {['upload','map','preview','done'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className={`text-sm font-medium ${step === s ? 'text-sky-700' : 'text-slate-400'}`}>
                {s === 'upload' ? 'Upload File' : s === 'map' ? 'Map Columns' : 'Preview & Import'}
              </span>
              {i < 2 && <span className="text-slate-300 text-xs">→</span>}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="card p-8">
            <h1 className="text-xl font-bold text-slate-900 mb-1">Import teams from a spreadsheet</h1>
            <p className="text-sm text-slate-500 mb-6">Upload a CSV or Excel file to bulk-import team registrations — works great with a TourneyMachine Quick Report export, or any spreadsheet with team names and divisions.</p>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
                ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'}`}
              onClick={() => fileRef.current?.click()}
            >
              <div className="text-4xl mb-3">📋</div>
              <p className="font-semibold text-slate-700 mb-1">Drop your spreadsheet here</p>
              <p className="text-sm text-slate-400">or click to browse — .csv or .xlsx files</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-lg text-sm text-slate-600">
              <p className="font-semibold mb-2">Coming from TourneyMachine?</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-500">
                <li>Log into TourneyMachine and open your event</li>
                <li>Go to <strong>Teams</strong> → <strong>Quick Report</strong></li>
                <li>Download as CSV or Excel</li>
                <li>Upload the file above</li>
              </ol>
            </div>
          </div>
        )}

        {/* Step 2: Map columns */}
        {step === 'map' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Map Columns</h2>
              <p className="text-sm text-slate-500 mt-0.5">{rows.length} rows found · Adjust column mappings if needed</p>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-4">
                    <div className="w-48 flex-shrink-0">
                      <p className="text-sm font-medium text-slate-700 truncate" title={h}>{h}</p>
                      <p className="text-xs text-slate-400 truncate">{String(rows[0]?.[h] || '').slice(0, 30) || '—'}</p>
                    </div>
                    <span className="text-slate-300">→</span>
                    <select
                      className="select flex-1 text-sm"
                      value={colMap[h] || ''}
                      onChange={e => setColMap(prev => ({ ...prev, [h]: e.target.value }))}
                    >
                      <option value="">— Skip this column —</option>
                      {Object.entries(FIELD_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    {colMap[h] && <span className="text-emerald-500 text-sm font-bold flex-shrink-0">✓</span>}
                    {!colMap[h] && <span className="text-slate-300 text-sm flex-shrink-0">—</span>}
                  </div>
                ))}
              </div>

              {!requiredMapped && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  Map at least <strong>Club Name</strong> or <strong>Team Name</strong> to continue.
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('upload')} className="btn-secondary">← Back</button>
                <button onClick={goToPreview} className="btn-primary" disabled={!requiredMapped}>
                  Preview Import →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Preview Import</h2>
                <p className="text-sm text-slate-500 mt-0.5">{groups.length} club{groups.length !== 1 ? 's' : ''} · {groups.reduce((s, g) => s + g.teams.length, 0)} teams total</p>
              </div>
              <button onClick={() => setStep('map')} className="btn-secondary btn-sm">← Adjust mapping</button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {groups.map((g, i) => (
                <div key={i} className="px-6 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-slate-900">{g.clubName}</p>
                      <p className="text-xs text-slate-400">{g.contactName}{g.contactEmail ? ' · ' + g.contactEmail : ''}{g.contactPhone ? ' · ' + g.contactPhone : ''}</p>
                    </div>
                    <span className="badge bg-sky-100 text-sky-700">{g.teams.length} team{g.teams.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1">
                    {g.teams.map((t, j) => (
                      <div key={j} className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 rounded px-3 py-1.5">
                        <span className="font-medium text-slate-800">{t.teamName || '—'}</span>
                        {t.division && <span className="badge bg-slate-200 text-slate-600">{t.division}</span>}
                        {t.coachName && <span className="text-slate-400">{t.coachName}</span>}
                        {t.coachEmail && <span className="text-slate-400 text-xs">{t.coachEmail}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={runImport} className="btn-primary" disabled={importing}>
                {importing ? 'Importing…' : `Import ${groups.length} Registration${groups.length !== 1 ? 's' : ''}`}
              </button>
              <button onClick={() => setStep('map')} className="btn-secondary" disabled={importing}>Cancel</button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="card p-8 text-center">
            <div className="text-5xl mb-4">{errors.length === 0 ? '✅' : '⚠️'}</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {errors.length === 0 ? 'Import Complete!' : 'Import Finished with Errors'}
            </h2>
            <p className="text-slate-500 mb-2">
              {imported} registration{imported !== 1 ? 's' : ''} created successfully.
            </p>
            {errors.length > 0 && (
              <div className="text-left mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                <p className="font-semibold mb-2">Errors ({errors.length}):</p>
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <Link href={`/tournaments/${params.id}/registrations`} className="btn-primary">
                View Registrations
              </Link>
              <button onClick={() => { setStep('upload'); setHeaders([]); setRows([]); setGroups([]) }} className="btn-secondary">
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
