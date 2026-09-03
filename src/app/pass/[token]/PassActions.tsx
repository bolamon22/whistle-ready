'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Check, Camera, Link2, Loader2 } from 'lucide-react'
import { uploadPlayerPhoto } from '@/lib/photoClient'

// The family's controls under their card: share the link, change the photo, and pick the
// link the QR code opens (highlight reel, Instagram…). Edits go to /api/pass/<token>; the
// token in the URL is what authorizes them.
export default function CardTools({ token, url, title, photoUrl, cardLink }: { token: string; url: string; title: string; photoUrl: string; cardLink: string }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'' | 'photo' | 'link'>('')
  const [link, setLink] = useState(cardLink)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function share() {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) { await (navigator as any).share({ title, url }); return }
    } catch { return }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt('Copy this link', url) }
  }
  async function save(body: Record<string, string>, kind: 'photo' | 'link') {
    setBusy(kind); setMsg(null)
    try {
      const res = await fetch(`/api/pass/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      if ('cardLink' in j) setLink(String(j.cardLink || ''))
      setMsg({ ok: true, text: kind === 'photo' ? (body.photoUrl ? 'Photo updated — your card has been re-made.' : 'Photo removed.') : (body.cardLink ? 'Saved — the QR code now opens your link.' : 'Link cleared — the QR code opens this card page.') })
      router.refresh()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save' }) }
    finally { setBusy('') }
  }
  async function onFile(file: File) {
    setBusy('photo'); setMsg(null)
    try { const u = await uploadPlayerPhoto(file); await save({ photoUrl: u }, 'photo') }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not upload the photo' }); setBusy('') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div className="max-w-[360px] mx-auto mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== ''}
          className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60">
          {busy === 'photo' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} {photoUrl ? 'Change photo' : 'Add photo'}
        </button>
        <button type="button" onClick={share}
          className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold rounded-xl py-3 text-sm">
          {copied ? <><Check size={16} /> Link copied</> : <><Share2 size={16} /> Share</>}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {photoUrl && <button type="button" onClick={() => save({ photoUrl: '' }, 'photo')} disabled={busy !== ''} className="block mx-auto text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4">Remove photo</button>}

      <form onSubmit={e => { e.preventDefault(); save({ cardLink: link }, 'link') }} className="bg-white/5 border border-white/10 rounded-xl p-3">
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300 inline-flex items-center gap-1.5"><Link2 size={13} /> QR code opens</label>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Point the code on the card at your highlight reel, Instagram, Hudl — any link. Leave it blank and it opens this card.</p>
        <div className="flex gap-2 mt-2">
          <input value={link} onChange={e => setLink(e.target.value)} inputMode="url" placeholder="https://youtube.com/…"
            className="min-w-0 flex-1 bg-[#0b1220] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <button type="submit" disabled={busy !== '' || link.trim() === cardLink.trim()}
            className="bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-[#0b1220] font-bold rounded-lg px-4 py-2 text-sm">{busy === 'link' ? '…' : 'Save'}</button>
        </div>
      </form>
      {msg && <p className={`text-xs text-center ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>}
    </div>
  )
}
