'use client'

// Site analytics: Plausible + Google Analytics 4, resolved per hostname.
//
// sunshineeventsgroup.com and whistleready.app are served by this same Next.js
// app (see src/lib/orgDomains.ts), so a single hard-coded id would pool org
// marketing traffic and tournament-app usage into one bucket. We pick the ids
// from the request hostname instead and report each domain separately.
//
// Env vars (Vercel → Project → Settings → Environment Variables). Any of them
// may be left unset — that tracker simply doesn't render for that host, so
// localhost and preview deploys stay out of the numbers:
//
//   NEXT_PUBLIC_PLAUSIBLE_SRC_SEG   full script URL from the Plausible dashboard
//   NEXT_PUBLIC_PLAUSIBLE_SRC_APP   (Site settings → Installation → Copy)
//   NEXT_PUBLIC_GA_ID_SEG           GA4 measurement id, G-XXXXXXXXXX
//   NEXT_PUBLIC_GA_ID_APP
//
// Plausible attaches its own History API listeners, so it counts client-side
// route changes on its own. GA4 only counts the initial load (via its config
// call) — we fire a page_view by hand for each client-side navigation after
// that, skipping the first pass so the landing page isn't counted twice.

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ORG_DOMAINS } from '@/lib/orgDomains'

const CONFIG = {
  seg: {
    plausible: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC_SEG || '',
    ga: process.env.NEXT_PUBLIC_GA_ID_SEG || '',
  },
  app: {
    plausible: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC_APP || '',
    ga: process.env.NEXT_PUBLIC_GA_ID_APP || '',
  },
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function configForHost(host: string) {
  const bare = host.replace(/^www\./, '').toLowerCase()
  // Never track local dev or Vercel preview deploys.
  if (bare === 'localhost' || bare.startsWith('127.0.0.1') || bare.endsWith('.vercel.app')) {
    return { plausible: '', ga: '' }
  }
  return bare in ORG_DOMAINS ? CONFIG.seg : CONFIG.app
}

export default function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [cfg, setCfg] = useState({ plausible: '', ga: '' })
  const countedInitial = useRef(false)

  // Hostname is only knowable client-side, so resolve after mount.
  useEffect(() => {
    setCfg(configForHost(window.location.hostname))
  }, [])

  // GA4 only. gtag's own config call reports the initial pageview, and it may
  // not have loaded yet on this first pass, so skip it here — otherwise the
  // landing page is either double-counted or (worse) silently dropped.
  useEffect(() => {
    if (!cfg.ga) return
    if (!countedInitial.current) {
      countedInitial.current = true
      return
    }
    if (typeof window.gtag !== 'function') return
    const qs = searchParams?.toString()
    window.gtag('event', 'page_view', {
      page_path: qs ? `${pathname}?${qs}` : pathname,
      page_location: window.location.href,
      page_title: document.title,
      send_to: cfg.ga,
    })
  }, [cfg.ga, pathname, searchParams])

  if (!cfg.plausible && !cfg.ga) return null

  return (
    <>
      {cfg.plausible && (
        <>
          <Script id="plausible-src" strategy="afterInteractive" src={cfg.plausible} />
          <Script id="plausible-init" strategy="afterInteractive">
            {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};
plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init();`}
          </Script>
        </>
      )}

      {cfg.ga && (
        <>
          <Script
            id="ga4-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${cfg.ga}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=window.gtag||gtag;
gtag('js', new Date());
gtag('config', '${cfg.ga}');`}
          </Script>
        </>
      )}
    </>
  )
}
