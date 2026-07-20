'use client'

// The ONE staff pay + officials editor. Rendered by BOTH the Setup wizard and
// Settings so the two surfaces can never drift apart again — previously each owned
// its own UI and serialization, which silently discarded wizard-set pay rates.
//
// Fully controlled: the parent holds a StaffPayConfig and persists it with
// serializeStaffPay(). This component never fetches or saves.

import { useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import {
  type StaffPayConfig, type StaffRole, type OfficialsConfig,
  newRoleId,
} from '@/lib/staffPay'

const GLOBAL_PREFS_KEY = 'gameday_staff_prefs'

export default function StaffPayEditor({
  value,
  onChange,
}: {
  value: StaffPayConfig
  onChange: (next: StaffPayConfig) => void
}) {
  const { roles, officialsConfig } = value
  const setRoles = (next: StaffRole[]) => onChange({ ...value, roles: next })
  const setOfficials = (fn: (c: OfficialsConfig) => OfficialsConfig) =>
    onChange({ ...value, officialsConfig: fn(officialsConfig) })

  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleRate, setNewRoleRate] = useState('')
  const [newRoleType, setNewRoleType] = useState<'per_game' | 'hourly'>('per_game')
  const [newKeyword, setNewKeyword] = useState('')
  const [newCount, setNewCount] = useState('1')
  const [showSaveGlobal, setShowSaveGlobal] = useState(false)

  const addRole = () => {
    if (!newRoleName.trim()) return
    setRoles([...roles, { id: newRoleId(), name: newRoleName.trim(), rate: parseFloat(newRoleRate) || 0, rateType: newRoleType }])
    setNewRoleName(''); setNewRoleRate('')
  }

  const loadDefaults = () => {
    const s = typeof window !== 'undefined' ? localStorage.getItem(GLOBAL_PREFS_KEY) : null
    if (!s) { toast.error('No global defaults saved yet'); return }
    try {
      const p = JSON.parse(s)
      onChange({ roles: p.roles || roles, officialsConfig: { ...officialsConfig, ...(p.officialsConfig || {}) } })
      toast.success('Loaded your global defaults')
    } catch { toast.error('Could not read your saved defaults') }
  }

  const saveDefaults = () => {
    try {
      localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify({ roles, officialsConfig }))
      toast.success('Saved as global defaults')
    } catch { toast.error('Could not save defaults') }
    setShowSaveGlobal(false)
  }

  return (
    <div className="space-y-8">
      {showSaveGlobal && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-amber-800">Save these roles and rates as your default for future tournaments?</p>
          <div className="flex gap-2 flex-shrink-0">
            <button type="button" onClick={saveDefaults}
              className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg">Yes, save globally</button>
            <button type="button" onClick={() => setShowSaveGlobal(false)} className="text-xs text-amber-600 hover:text-amber-800 px-2">Dismiss</button>
          </div>
        </div>
      )}

      {/* Staff roles & rates */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Staff Roles &amp; Pay Rates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Set a pay rate for each role. Mark as per game or hourly.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadDefaults}
              className="text-xs border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 text-slate-600 whitespace-nowrap">Load my defaults</button>
            <button type="button" onClick={() => setShowSaveGlobal(true)}
              className="text-xs border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 text-teal-600 whitespace-nowrap">Save as global defaults</button>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-5">Role</div>
            <div className="col-span-3 text-right">Rate</div>
            <div className="col-span-3">Type</div>
            <div className="col-span-1"></div>
          </div>

          {roles.map((role, idx) => (
            <div key={role.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-50 last:border-0 items-center hover:bg-slate-50/50">
              <div className="col-span-5">
                <input className="w-full bg-transparent text-sm text-slate-800 focus:outline-none border-b border-transparent focus:border-teal-400 px-0.5"
                  value={role.name}
                  onChange={e => setRoles(roles.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1">
                <span className="text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.50"
                  className="w-20 text-right text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                  value={role.rate}
                  onChange={e => setRoles(roles.map((x, i) => i === idx ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} />
              </div>
              <div className="col-span-3">
                <select className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                  value={role.rateType}
                  onChange={e => setRoles(roles.map((x, i) => i === idx ? { ...x, rateType: e.target.value as 'per_game' | 'hourly' } : x))}>
                  <option value="per_game">Per game</option>
                  <option value="hourly">Per hour</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-end">
                <button type="button" onClick={() => setRoles(roles.filter((_, i) => i !== idx))}
                  className="text-red-300 hover:text-red-500 text-sm" title="Remove role"><X size={13} /></button>
              </div>
            </div>
          ))}

          {/* Add role */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 border-t border-slate-100 items-center">
            <div className="col-span-5">
              <input className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="New role name…" value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole() } }} />
            </div>
            <div className="col-span-3 flex items-center justify-end gap-1">
              <span className="text-slate-400 text-sm">$</span>
              <input type="number" min="0" step="0.50"
                className="w-20 text-right text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                placeholder="0" value={newRoleRate} onChange={e => setNewRoleRate(e.target.value)} />
            </div>
            <div className="col-span-3">
              <select className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none bg-white"
                value={newRoleType} onChange={e => setNewRoleType(e.target.value as 'per_game' | 'hourly')}>
                <option value="per_game">Per game</option>
                <option value="hourly">Per hour</option>
              </select>
            </div>
            <div className="col-span-1 flex justify-end">
              <button type="button" onClick={addRole} className="text-teal-500 hover:text-teal-700 text-lg font-bold leading-none" title="Add role">+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Officials per game */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-0.5">Officials Per Game</h3>
        <p className="text-xs text-slate-400 mb-4">
          The standard is <strong>{officialsConfig.standardCount} official{officialsConfig.standardCount !== 1 ? 's' : ''} per game</strong>.
          Add exceptions below for divisions that use a different number — for example, 1 official for small-field or youth play, or 3 for varsity games.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title for officials at this tournament</label>
            <input className="input" value={officialsConfig.roleLabel}
              onChange={e => setOfficials(c => ({ ...c, roleLabel: e.target.value }))}
              placeholder="e.g. Official, Referee, Umpire" />
            <p className="text-xs text-slate-400 mt-1">Used on schedules, assignments, and notifications.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Standard officials per game</label>
            <div className="flex items-center gap-3">
              {[1, 2, 3].map(n => (
                <button key={n} type="button" onClick={() => setOfficials(c => ({ ...c, standardCount: n }))}
                  className={`w-10 h-10 rounded-xl text-sm font-semibold border transition-colors ${officialsConfig.standardCount === n ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-300'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Exceptions */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Exceptions</p>
          {officialsConfig.rules.length === 0
            ? <p className="text-sm text-slate-400 italic mb-3">No exceptions set — all games use the standard count above.</p>
            : (
              <div className="space-y-2 mb-3">
                {officialsConfig.rules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                    <span className="text-sm text-slate-700 flex-1">
                      Divisions containing <strong>&quot;{rule.keyword}&quot;</strong> → <strong>{rule.count} {officialsConfig.roleLabel || 'official'}{rule.count !== 1 ? 's' : ''}</strong>
                    </span>
                    <button type="button" onClick={() => setOfficials(c => ({ ...c, rules: c.rules.filter((_, j) => j !== i) }))}
                      className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            )
          }
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-slate-600 mb-1">If division name contains…</label>
              <input className="input" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. 7v7, U8, Lower School" />
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-slate-600 mb-1">…use this many officials</label>
              <select className="select" value={newCount} onChange={e => setNewCount(e.target.value)}>
                <option value="1">1 official</option>
                <option value="2">2 officials</option>
                <option value="3">3 officials</option>
              </select>
            </div>
            <button type="button"
              onClick={() => {
                if (!newKeyword.trim()) return
                setOfficials(c => ({ ...c, rules: [...c.rules, { keyword: newKeyword.trim(), count: parseInt(newCount) }] }))
                setNewKeyword(''); setNewCount('1')
              }}
              className="btn-secondary mb-0.5">Add Exception</button>
          </div>
        </div>

        {/* Championship */}
        <div className="border border-slate-200 rounded-xl px-4 py-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={officialsConfig.championshipEnabled}
              onChange={e => setOfficials(c => ({ ...c, championshipEnabled: e.target.checked }))}
              className="w-4 h-4 accent-teal-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">Championship games use a different number of officials</p>
              <p className="text-xs text-slate-400 mt-0.5">Games marked as championship will override the standard count.</p>
            </div>
          </label>
          {officialsConfig.championshipEnabled && (
            <div className="mt-3 ml-7 flex items-center gap-3">
              <span className="text-sm text-slate-600">Officials per championship game:</span>
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button" onClick={() => setOfficials(c => ({ ...c, championshipCount: n }))}
                  className={`w-9 h-9 rounded-xl text-sm font-semibold border transition-colors ${officialsConfig.championshipCount === n ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-300'}`}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
