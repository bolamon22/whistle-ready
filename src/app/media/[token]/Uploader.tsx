'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Upload, Check, X, Clock, EyeOff, Film, Image as ImageIcon, Loader2 } from 'lucide-react'
import { prepare, limitsBlurb, LIMITS, fmtBytes, type Prepared } from '@/lib/mediaUpload'

// Where a photographer hands over the weekend.
//
// Files go from here straight to blob storage -- a serverless request body is
// capped at 4.5 MB, so a ten-second clip could not be posted through the app at
// all. Each one is resized and checked in the browser first, uploaded, then
// recorded against this credential.
//
// One at a time, deliberately. Firing sixty parallel uploads off a phone on field
// wifi is how you get sixty timeouts; a queue that visibly advances is also the
// only honest progress bar, because each file either lands or says why it didn't.

type Row = {
  key: string
  name: string
  kind: 'photo' | 'video'
  bytes: number
  state: 'waiting' | 'preparing' | 'uploading' | 'done' | 'error'
  error?: string
}

type Existing = {
  id: string
  url: string
  kind: 'photo' | 'video'
  status: 'pending' | 'published' | 'hidden'
  createdAt: string
}

// Three columns on a phone leaves room for a word, not a sentence -- the long
// version is the tooltip rather than an ellipsis nobody can read.
const STATUS: Record<Existing['status'], { label: string; full: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: 'Waiting', full: 'Waiting on the organizer', cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: <Clock size={11} /> },
  published: { label: 'Live', full: 'Live in the gallery', cls: 'bg-teal-50 text-teal-700 border-teal-200', icon: <Check size={11} /> },
  hidden: { label: 'Not used', full: 'Not used in the gallery', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: <EyeOff size={11} /> },
}

export default function Uploader({ token, eventName }: { token: string; eventName: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [existing, setExisting] = useState<Existing[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    fetch(`/api/media/${token}/gallery`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && Array.isArray(d.items)) setExisting(d.items) })
      .catch(() => {})
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  async function run(files: File[]) {
    setErr('')
    const list = files.slice(0, LIMITS.maxFiles)
    if (files.length > LIMITS.maxFiles) setErr(`Taking the first ${LIMITS.maxFiles} — send the rest in a second batch.`)
    if (!list.length) return

    const start: Row[] = list.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      kind: f.type.startsWith('video/') ? 'video' : 'photo',
      bytes: f.size,
      state: 'waiting',
    }))
    setRows(start)
    setBusy(true)

    const recorded: any[] = []
    for (let i = 0; i < list.length; i++) {
      const key = start[i].key
      const mark = (patch: Partial<Row>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
      try {
        mark({ state: 'preparing' })
        const p: Prepared = await prepare(list[i])
        mark({ state: 'uploading', bytes: p.file.size, kind: p.kind })
        const blob = await upload(p.file.name, p.file, {
          access: 'public',
          handleUploadUrl: `/api/media/${token}/upload`,
        })
        recorded.push({
          url: blob.url, kind: p.kind, bytes: p.file.size,
          width: p.width, height: p.height, durationMs: p.durationMs,
        })
        mark({ state: 'done' })
      } catch (e: any) {
        mark({ state: 'error', error: String(e?.message || 'Upload failed').replace(/^Error:\s*/, '') })
      }
    }

    // One record call for the batch: the bytes are already safely in storage, and
    // a per-file round trip here would only add ways for the last step to fail.
    if (recorded.length) {
      try {
        const res = await fetch(`/api/media/${token}/gallery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: recorded }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setErr(j.error || 'Your files uploaded but we could not record them. Tell the organizer before you re-send.')
        } else refresh()
      } catch {
        setErr('Your files uploaded but we could not record them. Tell the organizer before you re-send.')
      }
    }
    setBusy(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false)
    if (busy) return
    run([...(e.dataTransfer?.files || [])])
  }

  const done = rows.filter(r => r.state === 'done').length
  const failed = rows.filter(r => r.state === 'error')

  return (
    <div className="mt-8">
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Send us your photos</h2>

      <div
        onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors ${drag ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-white'}`}
      >
        <Upload size={26} className="mx-auto text-slate-400" />
        <p className="text-[14.5px] font-semibold text-slate-800 mt-3">
          Drop your {eventName ? `${eventName} ` : ''}shots here
        </p>
        <p className="text-[13px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">{limitsBlurb()}</p>
        <button
          type="button" disabled={busy} onClick={() => inputRef.current?.click()}
          className="mt-4 text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 inline-flex items-center gap-1.5"
        >
          {busy ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <>Choose files</>}
        </button>
        <input
          ref={inputRef} type="file" multiple className="hidden"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          onChange={e => { run([...(e.target.files || [])]); e.target.value = '' }}
        />
      </div>

      <p className="text-[12.5px] text-slate-500 mt-3 leading-relaxed">
        Everything you send goes to the organizer first &mdash; nothing appears on the public gallery until they&rsquo;ve
        looked at it. Once it does, your credit on every photo links back to your booking page.
      </p>

      {err && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">{err}</p>}

      {rows.length > 0 && (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-slate-700">
              {busy ? 'Uploading' : 'Finished'} &mdash; {done} of {rows.length}
            </span>
            {!busy && <button onClick={() => setRows([])} className="text-xs text-slate-400 hover:text-slate-700">Clear</button>}
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {rows.map(r => (
              <li key={r.key} className="px-4 py-2 flex items-center gap-3 text-[13px] min-w-0">
                <span className="shrink-0 text-slate-400">
                  {r.kind === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
                </span>
                <span className="truncate text-slate-700 flex-1 min-w-0">{r.name}</span>
                <span className="shrink-0 text-[11.5px] text-slate-400">{fmtBytes(r.bytes)}</span>
                <span className="shrink-0 w-28 text-right">
                  {r.state === 'done' && <span className="text-teal-600 inline-flex items-center gap-1 justify-end"><Check size={13} /> Sent</span>}
                  {r.state === 'error' && <span className="text-red-600 inline-flex items-center gap-1 justify-end"><X size={13} /> Failed</span>}
                  {(r.state === 'preparing' || r.state === 'uploading') && <span className="text-slate-500 inline-flex items-center gap-1 justify-end"><Loader2 size={12} className="animate-spin" /> {r.state === 'preparing' ? 'Sizing' : 'Sending'}</span>}
                  {r.state === 'waiting' && <span className="text-slate-300">Queued</span>}
                </span>
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-red-50">
              <p className="text-[12.5px] font-semibold text-red-800 mb-1">{failed.length} didn&rsquo;t go through</p>
              <ul className="text-[12px] text-red-700 space-y-0.5">
                {failed.slice(0, 6).map(f => <li key={f.key}>{f.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {existing.length > 0 && (
        <div className="mt-5">
          <p className="text-[12.5px] font-semibold text-slate-700 mb-2">
            You&rsquo;ve sent {existing.length} file{existing.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {existing.slice(0, 20).map(m => (
              <div key={m.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-square">
                {m.kind === 'video'
                  ? <div className="w-full h-full flex items-center justify-center text-slate-400"><Film size={20} /></div>
                  : <img src={m.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                <span title={STATUS[m.status].full}
                  className={`absolute bottom-1 left-1 right-1 text-[9.5px] font-bold rounded px-1 py-0.5 border text-center truncate ${STATUS[m.status].cls}`}>
                  {STATUS[m.status].label}
                </span>
              </div>
            ))}
          </div>
          {existing.length > 20 && <p className="text-[12px] text-slate-400 mt-2">and {existing.length - 20} more.</p>}
        </div>
      )}
    </div>
  )
}
