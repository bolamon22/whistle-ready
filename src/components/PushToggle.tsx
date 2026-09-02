'use client'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Smartphone } from 'lucide-react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const isIOS = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true)

// Per-device toggle: subscribes THIS phone/browser to the org's registration &
// payment push alerts. Web Push works on Android/desktop Chrome & Firefox, and
// on iOS 16.4+ only when the site has been added to the Home Screen.
export default function PushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [needsInstall, setNeedsInstall] = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    // iOS only exposes Push once installed to the Home Screen.
    if (isIOS() && !isStandalone()) { setSupported(false); setNeedsInstall(true); return }
    setSupported(ok)
    if (!ok) return
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription())
      .then(sub => setSubscribed(!!sub)).catch(() => {})
  }, [])

  async function enable() {
    setBusy(true); setMsg('')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setMsg('Notifications are blocked — allow them in your browser settings, then try again.'); setBusy(false); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const { publicKey } = await fetch('/api/push/public-key').then(r => r.json())
      if (!publicKey) throw new Error('Push is not configured on the server.')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const label = `${isIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser'} · ${new Date().toLocaleDateString()}`
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), label }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not save subscription.')
      setSubscribed(true); setMsg('Done — this device will now get an alert for every registration and payment.')
    } catch (e: any) {
      setMsg(e?.message || 'Could not enable notifications on this device.')
    }
    setBusy(false)
  }

  async function disable() {
    setBusy(true); setMsg('')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setSubscribed(false); setMsg('Turned off on this device.')
    } catch (e: any) {
      setMsg(e?.message || 'Could not turn off notifications.')
    }
    setBusy(false)
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Smartphone size={16} className="text-teal-600" /> Get alerts on this phone
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Push a notification straight to this device the moment a team registers or a payment comes in — no email needed.
        Turn it on once per phone or computer you want alerted.
      </p>

      {needsInstall && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          On iPhone, add Whistle Ready to your Home Screen first: tap the <strong>Share</strong> icon in Safari →
          <strong> Add to Home Screen</strong>, then open it from that icon and come back here to turn on alerts.
        </p>
      )}

      {supported === false && !needsInstall && (
        <p className="mt-3 text-xs text-slate-500">This browser doesn&apos;t support push notifications. Try Chrome, Firefox, or an installed app.</p>
      )}

      {supported && (
        <div className="mt-3">
          {subscribed ? (
            <button type="button" onClick={disable} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <BellOff size={15} /> {busy ? 'Working…' : 'Turn off on this device'}
            </button>
          ) : (
            <button type="button" onClick={enable} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              <Bell size={15} /> {busy ? 'Enabling…' : 'Enable on this device'}
            </button>
          )}
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </div>
  )
}
