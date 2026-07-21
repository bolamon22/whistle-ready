'use client'
import { useState } from 'react'
import { X, Lightbulb } from 'lucide-react'
import type { RegistrationTypes, RegTier } from '@/lib/registrationTypes'

// The single editor for registration types, used by BOTH the Setup wizard and the
// Settings page. Previously this markup lived only in Settings; duplicating it into
// the wizard is what caused the staff-pay drift, so it's shared from the start.
export default function RegistrationTypesEditor({
  value, onChange, tournamentId,
}: {
  value: RegistrationTypes
  onChange: (next: RegistrationTypes) => void
  tournamentId: string
}) {
  const [newTierName, setNewTierName] = useState('')
  const [newTierPrice, setNewTierPrice] = useState('')
  const [newTierDesc, setNewTierDesc] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [newSize, setNewSize] = useState('')

  const set = (patch: Partial<RegistrationTypes>) => onChange({ ...value, ...patch })
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  function addTier() {
    if (!newTierName.trim() || !newTierPrice) return
    const tier: RegTier = {
      id: Date.now().toString(),
      name: newTierName.trim(),
      price: parseFloat(newTierPrice) || 0,
      description: newTierDesc.trim(),
    }
    set({ tiers: [...value.tiers, tier] })
    setNewTierName(''); setNewTierPrice(''); setNewTierDesc('')
  }
  function addTo(key: 'positions' | 'sizes', v: string, clear: () => void) {
    const t = v.trim()
    if (!t || value[key].includes(t)) return
    set({ [key]: [...value[key], t] } as any)
    clear()
  }

  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-xl border ${value.teamEnabled ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={value.teamEnabled} onChange={e => set({ teamEnabled: e.target.checked })} className="accent-teal-500 w-4 h-4 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Team registration</p>
            <p className="text-xs text-slate-500 mt-0.5">Clubs register and pay for entire teams. Use for standard team tournaments.</p>
            <p className="text-xs text-slate-500 mt-1">
              {value.teamEnabled
                ? <span className="text-teal-700 font-medium">Open — teams can register at /tournaments/{tournamentId}/register</span>
                : <span className="text-amber-700 font-medium">Closed — the Register button is hidden from the public page</span>}
            </p>
          </div>
        </label>
      </div>

      <div className={`p-4 rounded-xl border ${value.individualEnabled ? 'border-teal-300 bg-teal-50' : 'border-slate-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={value.individualEnabled} onChange={e => set({ individualEnabled: e.target.checked })} className="accent-teal-500 w-4 h-4 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Individual player registration</p>
            <p className="text-xs text-slate-500 mt-0.5">Players register and pay individually. Good for free agents or hybrid tournaments.</p>
            {value.individualEnabled && (
              <p className="text-xs text-teal-700 mt-1 font-medium">Link: /tournaments/{tournamentId}/individual-register</p>
            )}
          </div>
        </label>
      </div>

      <div className="flex items-start gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
        <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
        You can enable both — teams register their players and free agents register individually.
      </div>

      {value.individualEnabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration description</label>
            <textarea rows={3} value={value.description} onChange={e => set({ description: e.target.value })}
              placeholder="Describe what's included (e.g. uniforms, housing, tourney fees…)"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Fee tiers</label>
            <div className="space-y-2 mb-3">
              {value.tiers.map((tier, i) => (
                <div key={tier.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-800">{tier.name}</span>
                    {tier.description && <span className="text-xs text-slate-500 ml-2">{tier.description}</span>}
                  </div>
                  <span className="text-sm font-bold text-teal-700">${tier.price.toFixed(2)}</span>
                  <button type="button" onClick={() => set({ tiers: value.tiers.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ))}
              {value.tiers.length === 0 && <p className="text-xs text-slate-400">No tiers yet. Add one below.</p>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Tier name" value={newTierName} onChange={e => setNewTierName(e.target.value)} />
              <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Price (e.g. 400)" type="number" value={newTierPrice} onChange={e => setNewTierPrice(e.target.value)} />
              <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Description (optional)" value={newTierDesc} onChange={e => setNewTierDesc(e.target.value)} />
            </div>
            <button type="button" onClick={addTier} className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium">+ Add tier</button>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700">
            Share this link with players: <strong>{origin}/tournaments/{tournamentId}/individual-register</strong>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Positions</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {value.positions.map((pos, i) => (
                <span key={i} className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1 text-sm text-slate-700">
                  {pos}
                  <button type="button" onClick={() => set({ positions: value.positions.filter((_, j) => j !== i) })}
                    className="text-slate-400 hover:text-red-500 text-xs ml-1"><X size={13} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Attack"
                value={newPosition} onChange={e => setNewPosition(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTo('positions', newPosition, () => setNewPosition('')) } }} />
              <button type="button" onClick={() => addTo('positions', newPosition, () => setNewPosition(''))}
                className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">+ Add</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Jersey / shorts sizes</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {value.sizes.map((sz, i) => (
                <span key={i} className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1 text-sm text-slate-700">
                  {sz}
                  <button type="button" onClick={() => set({ sizes: value.sizes.filter((_, j) => j !== i) })}
                    className="text-slate-400 hover:text-red-500 text-xs ml-1"><X size={13} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. XL"
                value={newSize} onChange={e => setNewSize(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTo('sizes', newSize, () => setNewSize('')) } }} />
              <button type="button" onClick={() => addTo('sizes', newSize, () => setNewSize(''))}
                className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">+ Add</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
