// Browser side of web push, shared by the staff PushToggle and the public
// follower flow. No React in here.

// Returns a Uint8Array over a real ArrayBuffer: since TS 5.7 a bare Uint8Array is
// Uint8Array<ArrayBufferLike>, which pushManager.subscribe() will not accept.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const isIOS = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true)

/** Push is available here at all. iOS only exposes it once the site is on the
 *  Home Screen, so on an iPhone in Safari this is false and `needsInstall` is
 *  the thing to show instead. */
export function pushSupport(): { supported: boolean; needsInstall: boolean } {
  if (typeof window === 'undefined') return { supported: false, needsInstall: false }
  if (isIOS() && !isStandalone()) return { supported: false, needsInstall: true }
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return { supported: ok, needsInstall: false }
}

export const deviceLabel = () =>
  `${isIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser'} · ${new Date().toLocaleDateString()}`

/**
 * Ask, register the worker, subscribe. Returns the subscription to hand to
 * whichever server route owns it, or a reason it did not happen. Throws only
 * for genuine failures (no VAPID key, subscribe rejected).
 */
export async function subscribeThisBrowser(): Promise<{ ok: true; subscription: PushSubscriptionJSON } | { ok: false; reason: 'denied' | 'unsupported' }> {
  const { supported } = pushSupport()
  if (!supported) return { ok: false, reason: 'unsupported' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { publicKey } = await fetch('/api/push/public-key').then(r => r.json())
  if (!publicKey) throw new Error('Push is not configured on the server.')
  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  return { ok: true, subscription: sub.toJSON() }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return (await reg?.pushManager.getSubscription()) || null
  } catch { return null }
}

// ---- the device id followers are keyed by --------------------------------------

const DEVICE_KEY = 'wr-device'

/** A stable id for this browser, minted once. Empty string when storage is
 *  unavailable (private window, blocked), in which case following still works
 *  for the session but does not persist -- the page says so. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY) || ''
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return '' }
}
