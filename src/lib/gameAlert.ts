// Penalty-over alert for the live scorer: a vibration pattern plus three short
// beeps. Browsers only allow sound after the person has tapped something on the
// page, so primeAlerts() is called from taps (Start clock, Start penalty) to
// unlock audio ahead of time; the alert itself fires from a timer.
//
// Limits worth knowing: iPhone Safari has no vibration API at all (Android
// Chrome does), and an iPhone on silent mutes web audio unless the page asks
// for "playback" audio (navigator.audioSession, Safari 17+), which we do.

let ctx: AudioContext | null = null

export function primeAlerts(): void {
  if (typeof window === 'undefined') return
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch { /* not supported */ }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* no audio */ }
}

function beep(at: number, freq: number, dur: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** Buzz + beep-beep-beeeep. Safe to call anywhere; silently does what the device allows. */
export function penaltyOverAlert(): void {
  if (typeof window === 'undefined') return
  try { navigator.vibrate?.([400, 150, 400, 150, 800]) } catch { /* no vibration */ }
  try {
    primeAlerts()
    if (!ctx) return
    const t = ctx.currentTime + 0.02
    beep(t, 1046, 0.16)
    beep(t + 0.28, 1046, 0.16)
    beep(t + 0.56, 1318, 0.5)
  } catch { /* no audio */ }
}
