'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { CredentialCard, CRED_W, CRED_H, type CredentialCardData } from '@/lib/credentialCard'

// Live preview of the credential while a photographer fills in the application — the
// same component that becomes the printed badge, rendered in the browser at 720×1140
// and scaled to whatever width it is given.
//
// The card is deliberately not valid yet: see the overprint in credentialCard.tsx.
function useQr(text: string) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    let cancelled = false
    // Debounced: the card rebuilds on every keystroke and QR generation is the only
    // expensive part of it.
    const t = setTimeout(() => {
      QRCode.toDataURL(text || 'https://whistleready.app', { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } })
        .then((u: string) => { if (!cancelled) setQr(u) })
        .catch(() => {})
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [text])
  return qr
}

export default function CredentialPreview({
  p, qrText, qr2Text, className,
}: {
  p: Omit<CredentialCardData, 'qrDataUrl' | 'qr2DataUrl'>
  qrText: string
  qr2Text: string
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const qr = useQr(qrText)
  const qr2 = useQr(qr2Text)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / CRED_W)
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  return (
    <div ref={box} className={className}
      style={{ height: Math.round(CRED_H * scale), position: 'relative', overflow: 'hidden', background: '#fff', borderRadius: 14 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: CRED_W, height: CRED_H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} aria-hidden>
        <CredentialCard mode="dom" p={{ ...p, qrDataUrl: qr, qr2DataUrl: qr2 }} />
      </div>
    </div>
  )
}
