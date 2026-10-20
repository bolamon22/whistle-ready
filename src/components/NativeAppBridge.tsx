'use client'
import { useEffect } from 'react'
import { initNativeApp } from '@/lib/pushClient'

// Mounted once in the root layout. Does nothing in a browser; inside the
// Whistle Ready iOS app it wires up taps on alerts (lib/pushClient initNativeApp).
export default function NativeAppBridge() {
  useEffect(() => { initNativeApp().catch(() => {}) }, [])
  return null
}
