'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { PassCard, PASS_W, PASS_H, type PassCardData } from '@/lib/playerPassCard'

// Live preview of the player card while the family fills in the form: the very same
// component that becomes the PNG, rendered in the browser at 720×1140 and scaled to fit.
// The QR is real (their link, or a stand-in until the card exists); the player ID is
// assigned when they submit.
function useQr(text: string) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      QRCode.toDataURL(text || 'https://whistleready.app', { margin: 1, width: 448, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } })
        .then((u: string) => { if (!cancelled) setQr(u) }).catch(() => {})
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [text])
  return qr
}

export default function CardPreview({ p, qrText, qr2Text, className }: { p: Omit<PassCardData, 'qrDataUrl' | 'qr2DataUrl'>; qrText: string; qr2Text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const qr = useQr(qrText), qr2 = useQr(qr2Text)

  useEffect(() => {
    const el = box.current; if (!el) return
    const fit = () => setScale(el.clientWidth / PASS_W)
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  return (
    <div ref={box} className={className} style={{ height: Math.round(PASS_H * scale), position: 'relative', overflow: 'hidden', background: '#fff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: PASS_W, height: PASS_H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} aria-hidden>
        <PassCard mode="dom" p={{ ...p, qrDataUrl: qr, qr2DataUrl: qr2 }} />
      </div>
    </div>
  )
}
