'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import StaffAlerts from '@/components/StaffAlerts'
import SmsConsent from '@/components/SmsConsent'

// One page to send staff to at check-in: turn on game-day alerts for this phone.
// The QR code at the bottom points here, so a staffer can scan it off your phone.
export default function AlertsPage() {
  const [qr, setQr] = useState('')
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = `${window.location.origin}/dashboard/alerts`
    setUrl(u)
    QRCode.toDataURL(u, { margin: 1, width: 320, errorCorrectionLevel: 'M', color: { dark: '#0b1220', light: '#ffffff' } }).then(setQr).catch(() => {})
  }, [])
  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Game-day alerts</h1>
        <p className="text-sm text-slate-500 mt-1">Get a buzz on your phone when someone needs a trainer, balls, water or a ref on a field, and when someone is on the way to your request.</p>
      </div>
      <StaffAlerts />
      <SmsConsent />
      {qr && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <p className="font-bold text-slate-800">Setting up other staff?</p>
          <p className="text-sm text-slate-500 mb-3">Have them scan this with their phone camera, sign in, and follow the steps.</p>
          <img src={qr} alt={`QR code for ${url}`} className="mx-auto w-56 h-56" />
          <p className="text-xs text-slate-400 mt-2 break-all">{url}</p>
        </div>
      )}
    </div>
  )
}
