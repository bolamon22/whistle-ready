'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function TourneyMachineGuidePage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="breadcrumb mb-6">
        <Link href="/admin" className="hover:text-sky-600">Admin</Link>
        <span>/</span>
        <span className="text-slate-700">TourneyMachine Migration Guide</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Migrating from TourneyMachine</h1>
        <p className="text-slate-500">
          This guide covers how to move your team registration data from TourneyMachine into GameDay Staff.
          The whole process takes about 5 minutes per event.
        </p>
      </div>

      {/* Overview */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Overview</h2>
        <ol className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="font-semibold">Export your team list from TourneyMachine</p>
              <p className="text-slate-500 mt-0.5">Use the Quick Report feature to download a CSV or Excel file with all registered teams.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="font-semibold">Upload to GameDay Staff</p>
              <p className="text-slate-500 mt-0.5">Use the CSV import tool on any tournament's registration page. GameDay Staff auto-detects TourneyMachine column names.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="font-semibold">Review and confirm</p>
              <p className="text-slate-500 mt-0.5">Preview the grouped registrations before importing. Each club gets one registration entry with all their teams listed under it.</p>
            </div>
          </li>
        </ol>
      </div>

      {/* Step 1 */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Step 1 — Export from TourneyMachine</h2>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <ol className="list-decimal list-inside space-y-2 text-slate-600">
            <li>Log into TourneyMachine and open your event</li>
            <li>In the left sidebar, click <strong>Teams</strong></li>
            <li>Click <strong>Quick Report</strong> at the top of the teams list</li>
            <li>In the report dialog, make sure these columns are included:
              <ul className="list-disc list-inside mt-1 ml-4 space-y-1 text-slate-500">
                <li>Club Name (or Organization)</li>
                <li>Team Name</li>
                <li>Division (or Age Group)</li>
                <li>Head Coach (or Coach Name)</li>
                <li>Email</li>
                <li>Phone</li>
              </ul>
            </li>
            <li>Click <strong>Download CSV</strong> or <strong>Export to Excel</strong></li>
          </ol>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
            <p className="font-semibold mb-1">💡 Tip</p>
            <p>Include as many columns as possible in your export. GameDay Staff will auto-map them and skip anything it doesn&apos;t recognize — extra columns won&apos;t cause errors.</p>
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Step 2 — Upload to GameDay Staff</h2>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <ol className="list-decimal list-inside space-y-2 text-slate-600">
            <li>Open your tournament in GameDay Staff</li>
            <li>Go to <strong>Registrations</strong> in the tournament nav</li>
            <li>Click the <strong>Import from TourneyMachine</strong> button (top right)</li>
            <li>Drag and drop your CSV or Excel file, or click to browse</li>
            <li>GameDay Staff will auto-detect your columns and show a mapping screen</li>
          </ol>

          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="font-semibold text-slate-800 mb-2">Supported column names</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
              <div><span className="font-medium text-slate-700">Club Name:</span> club name, club, organization, org, club/org</div>
              <div><span className="font-medium text-slate-700">Team Name:</span> team name, team</div>
              <div><span className="font-medium text-slate-700">Division:</span> division, age group, grade group, div, age, grade</div>
              <div><span className="font-medium text-slate-700">Coach Name:</span> head coach, coach name, coach, primary contact</div>
              <div><span className="font-medium text-slate-700">Coach Email:</span> email, coach email, head coach email</div>
              <div><span className="font-medium text-slate-700">Coach Phone:</span> phone, coach phone, mobile, cell</div>
              <div><span className="font-medium text-slate-700">Contact Name:</span> contact name, contact, billing contact</div>
              <div><span className="font-medium text-slate-700">Contact Email:</span> contact email, billing email</div>
              <div><span className="font-medium text-slate-700">Contact Phone:</span> contact phone, billing phone</div>
            </div>
          </div>

          <p className="text-slate-500">
            If a column isn&apos;t auto-detected, you can manually assign it on the mapping screen using the dropdown next to each column.
          </p>
        </div>
      </div>

      {/* Step 3 */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Step 3 — Preview & confirm</h2>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            GameDay Staff groups all rows by club name. Each club becomes one registration entry with multiple teams inside it — matching how team registrations are structured in GameDay Staff.
          </p>
          <p>
            The preview screen shows:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 ml-2">
            <li>Each club with their contact info</li>
            <li>All teams under that club, with division and coach info</li>
            <li>Total club count and team count</li>
          </ul>
          <p>
            Click <strong>Import X Registrations</strong> to create them all. The import runs one club at a time, and any failures are shown at the end without stopping the rest.
          </p>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
            <p className="font-semibold mb-1">✓ After import</p>
            <p>All registrations will appear in the team registrations tab. You can edit each one individually to add invoice amounts, notes, or payment method. No data from TourneyMachine is lost.</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="card overflow-hidden mb-6">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Common questions</h2>
        </div>
        <div className="px-6 py-5 space-y-5 text-sm">
          <div>
            <p className="font-semibold text-slate-800">What if a club has teams in multiple divisions?</p>
            <p className="text-slate-600 mt-1">Each row in your export becomes one team under that club. All rows with the same club name are grouped together automatically.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">What if the club name is blank in some rows?</p>
            <p className="text-slate-600 mt-1">If no Club Name column is mapped, the Team Name is used as the club name instead. You can edit registrations after import.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">Can I import the same file twice?</p>
            <p className="text-slate-600 mt-1">Yes, but it will create duplicate registrations. Check the registrations list before re-importing.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">What data does NOT come over from TourneyMachine?</p>
            <p className="text-slate-600 mt-1">Schedules, scores, and pool assignments don&apos;t export from TourneyMachine in the Quick Report format. Only team registration data (clubs, teams, coaches, divisions) is imported.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800">What format should the file be?</p>
            <p className="text-slate-600 mt-1">CSV (.csv) or Excel (.xlsx or .xls). The import tool handles both.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="card p-6 bg-sky-50 border-sky-200">
        <h2 className="font-bold text-sky-900 mb-2">Ready to import?</h2>
        <p className="text-sm text-sky-700 mb-4">Open any tournament and go to Registrations to use the import tool.</p>
        <Link href="/tournaments" className="btn-primary">
          Go to Tournaments
        </Link>
      </div>
    </div>
  )
}
