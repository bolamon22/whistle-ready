'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

// Share the pass link (native share sheet on phones, copy-to-clipboard elsewhere).
export default function PassActions({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) { await (navigator as any).share({ title, url }); return }
    } catch { /* user cancelled */ return }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link', url) }
  }
  return (
    <button type="button" onClick={share}
      className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold rounded-xl py-3 text-sm">
      {copied ? <><Check size={16} /> Link copied</> : <><Share2 size={16} /> Share</>}
    </button>
  )
}
