'use client'

// Which staff roles may post broadcasts to the public announcement banner.
// The tournament director is always allowed and is not stored in the list.
//
// Shared by the Setup wizard and the Settings page so the two can't drift.

export const BROADCAST_ROLE_OPTIONS = [
  { key: 'scheduler', label: 'Schedulers' },
  { key: 'assigner', label: 'Assigners' },
  { key: 'staff', label: 'Staff (field ops, medical, etc.)' },
  { key: 'scorekeeper', label: 'Scorekeepers' },
  { key: 'ref', label: 'Referees' },
]

export function loadBroadcastRoles(id: string): Promise<string[]> {
  return fetch(`/api/tournaments/${id}/broadcast-roles`)
    .then(r => (r.ok ? r.json() : null))
    // 'director' is implicit — filter it out so the checkbox list stays accurate.
    .then(d => (d && Array.isArray(d.roles) ? d.roles.filter((r: string) => r !== 'director') : ['assigner']))
    .catch(() => ['assigner'])
}

/** Persist. Returns true on success — never throws. */
export function saveBroadcastRoles(id: string, roles: string[]): Promise<boolean> {
  return fetch(`/api/tournaments/${id}/broadcast-roles`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
  }).then(r => r.ok).catch(() => false)
}

export default function BroadcastRolesEditor({
  value, onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <div className="space-y-2 max-w-md">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-teal-500/10 border border-teal-500/40">
          <input type="checkbox" checked readOnly className="w-4 h-4 accent-teal-600" />
          <span className="text-sm font-medium text-slate-800">Tournament Director</span>
          <span className="text-[11px] text-slate-400 ml-auto">Always allowed</span>
        </div>
        {BROADCAST_ROLE_OPTIONS.map(o => {
          const on = value.includes(o.key)
          return (
            <label key={o.key} className={`flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer border ${on ? 'bg-teal-500/10 border-teal-500/40' : 'bg-slate-50 border-transparent'}`}>
              <input type="checkbox" checked={on} className="w-4 h-4 accent-teal-600"
                onChange={e => onChange(e.target.checked
                  ? Array.from(new Set([...value, o.key]))
                  : value.filter(r => r !== o.key))} />
              <span className="text-sm text-slate-700">{o.label}</span>
            </label>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Allowed staff get a Broadcast page (/broadcast) to post to the public announcement banner. You can remove any post.</p>
    </div>
  )
}
