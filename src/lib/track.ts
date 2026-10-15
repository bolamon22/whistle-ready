'use client'

// Conversion events for Plausible (and GA4 alongside it).
//
// Pageviews answer "did they look?". These answer "did they actually do it?",
// which is the question that matters after a send: 40 clubs opened the Fall
// Classic page tells you nothing on its own, 6 of them registered does.
//
// Paired with the campaign tagging in lib/utm, Plausible can then attribute a
// completed registration back to the email that caused it.
//
// Plausible only counts an event it has a GOAL for. Adding a track() call here
// is half the job — the matching custom-event goal has to exist in Plausible
// (Site settings -> Goals -> Custom event, name typed EXACTLY as below) or the
// event is accepted and silently dropped. Keep this list and that list equal.
//
//   Team Registration  — a club finished the team registration form
//   Player Waiver      — a family submitted a player waiver
//
// Safe to call anywhere on the client: on a host we don't track (localhost,
// preview deploys) window.plausible is simply never defined and this no-ops.
// Never let it throw — a failed analytics call must not break a registration
// that already succeeded.

export type TrackProps = Record<string, string | number | boolean>

export function track(event: string, props?: TrackProps): void {
  if (typeof window === 'undefined') return
  try {
    window.plausible?.(event, props ? { props } : undefined)
  } catch { /* analytics is best-effort */ }
  try {
    window.gtag?.('event', event.toLowerCase().replace(/\s+/g, '_'), props || {})
  } catch { /* analytics is best-effort */ }
}
