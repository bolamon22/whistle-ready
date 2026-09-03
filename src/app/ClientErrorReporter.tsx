'use client'

import { useEffect } from 'react'

// Surfaces uncaught browser-side JS errors and unhandled promise rejections
// into Vercel's server function logs, so they're visible in the same place
// as backend errors instead of only in a user's console. Added in the
// Sep 2026 event-load-readiness pass -- the app had zero error monitoring
// before this (no Sentry, no client error capture).
//
// Best-effort and deliberately minimal: no external service, no PII beyond
// the error message/stack/URL, fire-and-forget (never blocks the page),
// and lightly throttled client-side so a loop of the same error can't spam
// the endpoint.
export default function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0
    const MAX_PER_SESSION = 20

    function report(payload: Record<string, unknown>) {
      if (sent >= MAX_PER_SESSION) return
      sent += 1
      try {
        const body = JSON.stringify({ ...payload, url: location.href, ts: new Date().toISOString() })
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }))
        } else {
          fetch('/api/client-error', { method: 'POST', body, keepalive: true }).catch(() => {})
        }
      } catch { /* never let error reporting itself throw */ }
    }

    function onError(e: ErrorEvent) {
      report({ kind: 'error', message: e.message, stack: e.error?.stack, source: e.filename, line: e.lineno })
    }
    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason
      report({
        kind: 'unhandledrejection',
        message: reason?.message ?? String(reason),
        stack: reason?.stack,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
