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
  // Inside the iOS app alerts come through Apple push, no Home Screen step.
  if (isNativeApp()) return { supported: !!nativePush(), needsInstall: false }
  if (isIOS() && !isStandalone()) return { supported: false, needsInstall: true }
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return { supported: ok, needsInstall: false }
}

export const deviceLabel = () =>
  `${isNativeApp() ? 'iPhone app' : isIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser'} · ${new Date().toLocaleDateString()}`

/**
 * Ask, register the worker, subscribe. Returns the subscription to hand to
 * whichever server route owns it, or a reason it did not happen. Throws only
 * for genuine failures (no VAPID key, subscribe rejected).
 */
export async function subscribeThisBrowser(): Promise<{ ok: true; subscription: PushSubscriptionJSON } | { ok: false; reason: 'denied' | 'unsupported' }> {
  if (isNativeApp()) return subscribeNativeApp()
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
  if (isNativeApp()) {
    const t = savedNativeToken()
    return t ? ({ endpoint: APNS_PREFIX + t } as unknown as PushSubscription) : null
  }
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

// ---- the Whistle Ready iOS app -----------------------------------------------------
//
// The app (repo whistle-ready-ios) is a native shell that loads this site. It adds
// "WhistleReadyApp/<version>" to the user agent, and Capacitor exposes its native
// plugins here as window.Capacitor.Plugins.*, so this site needs no Capacitor
// package. WKWebView has no web push, so inside the app a "subscription" is the
// phone's Apple push token stored as endpoint `apns:<token>` with placeholder
// keys; the server's sendToSubscriptions() sends those through Apple (lib/apns.ts).
// Every caller of subscribeThisBrowser() -- follows, coach alerts, staff alerts --
// works unchanged.

const APNS_PREFIX = 'apns:'
const NATIVE_TOKEN_KEY = 'wr-apns-token'

/** Running inside the Whistle Ready iOS app. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  if (cap?.isNativePlatform?.()) return true
  return typeof navigator !== 'undefined' && /WhistleReadyApp\//.test(navigator.userAgent)
}

/** The native push plugin, when the app exposes it. */
function nativePush(): any {
  if (typeof window === 'undefined') return null
  return (window as any).Capacitor?.Plugins?.PushNotifications || null
}

function savedNativeToken(): string {
  try { return localStorage.getItem(NATIVE_TOKEN_KEY) || '' } catch { return '' }
}

/** Ask iOS for permission, register with Apple, return the token as a
 *  subscription-shaped object the existing server routes accept. */
async function subscribeNativeApp(): Promise<{ ok: true; subscription: PushSubscriptionJSON } | { ok: false; reason: 'denied' | 'unsupported' }> {
  const P = nativePush()
  if (!P) return { ok: false, reason: 'unsupported' }
  let perm = await P.checkPermissions()
  if (perm?.receive !== 'granted') perm = await P.requestPermissions()
  if (perm?.receive !== 'granted') return { ok: false, reason: 'denied' }
  const token: string = await new Promise((resolve, reject) => {
    const handles: any[] = []
    const cleanup = () => { for (const h of handles) { try { h?.remove?.() } catch {} } }
    const timer = setTimeout(() => { cleanup(); reject(new Error('The phone did not answer. Try again in a moment.')) }, 15_000)
    Promise.all([
      P.addListener('registration', (t: { value: string }) => { clearTimeout(timer); cleanup(); resolve(t?.value || '') }),
      P.addListener('registrationError', (e: any) => { clearTimeout(timer); cleanup(); reject(new Error(e?.error || 'Could not register for alerts.')) }),
    ]).then(hs => { handles.push(...hs); return P.register() }).catch((e: any) => { clearTimeout(timer); cleanup(); reject(e) })
  })
  if (!token) throw new Error('Could not register for alerts.')
  try { localStorage.setItem(NATIVE_TOKEN_KEY, token) } catch {}
  return { ok: true, subscription: { endpoint: APNS_PREFIX + token, keys: { p256dh: 'apns', auth: 'apns' } } }
}

/**
 * Called once per page load (NativeAppBridge). Opens the page a tapped alert
 * points at -- including the tap that launched the app, which the plugin holds
 * until a listener is added.
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return
  const P = nativePush()
  if (!P) return
  try {
    await P.addListener('pushNotificationActionPerformed', (a: any) => {
      const url = a?.notification?.data?.url
      if (typeof url === 'string' && url.startsWith('/')) window.location.assign(url)
    })
  } catch {}
}
