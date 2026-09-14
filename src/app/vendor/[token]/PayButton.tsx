'use client'

import { useState } from 'react'

export default function PayButton({ token, amount }: { token: string; amount: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/vendor/${token}/checkout`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.url) { window.location.href = j.url; return }
      setErr(j.error || 'Could not start checkout. Please try again.')
    } catch { setErr('Could not start checkout. Please try again.') }
    setBusy(false)
  }

  return (
    <div>
      <button onClick={go} disabled={busy}
        className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold px-7 py-3.5 rounded-xl transition-colors">
        {busy ? 'Opening checkout…' : `Pay ${amount}`}
      </button>
      <p className="text-xs text-slate-500 mt-2">Card or bank transfer. Bank transfers take a few days to clear — your spot is held either way.</p>
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
    </div>
  )
}
