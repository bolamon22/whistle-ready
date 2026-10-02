'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'

// Dictate into a Chirp input with the browser's own speech recognition (Chrome
// uses Google's service, Safari uses Apple's). Nothing is recorded or stored by
// us: the words land in the text box and the person decides whether to send.
// Renders nothing where the browser has no speech recognition, and hides itself
// for the rest of the visit if the browser refuses the service (the iPhone
// home-screen app does this; its keyboard mic still works there).

type Props = {
  value: string
  onChange: (text: string) => void
  disabled?: boolean
  className?: string
}

let refusedThisVisit = false

// Chrome hands back each pause as its own piece with no space before it and a
// capital letter at its start, so pasting the pieces together read
// "works well nowShould weBe sure". Join with spaces, and lowercase a piece's
// first word when the piece before it didn't end a sentence (but keep "I",
// "I'm" and the like). The person still reads it over before sending.
export function joinSpoken(parts: string[]): string {
  let out = ''
  for (const raw of parts) {
    let p = (raw || '').replace(/\s+/g, ' ').trim()
    if (!p) continue
    if (out) {
      const endsSentence = /[.!?]$/.test(out)
      if (!endsSentence && /^[A-Z][a-z]/.test(p) && !/^I(\b|')/.test(p)) p = p[0].toLowerCase() + p.slice(1)
      out += ' ' + p
    } else {
      out = p
    }
  }
  return out ? out[0].toUpperCase() + out.slice(1) : ''
}

export default function DictateButton({ value, onChange, disabled, className = '' }: Props) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)
  const baseRef = useRef('')
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    const w = window as any
    setSupported(!refusedThisVisit && !!(w.SpeechRecognition || w.webkitSpeechRecognition))
    return () => { try { recRef.current?.abort() } catch {} }
  }, [])

  // Sending clears the box; stop listening so late words don't refill it.
  useEffect(() => {
    if (listening && value === '' && recRef.current?._heard) stop()
  }, [value, listening])

  useEffect(() => { if (disabled && listening) stop() }, [disabled, listening])

  function stop() {
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }

  function start() {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = true
    rec.continuous = true
    baseRef.current = valueRef.current.trim()
    rec.onresult = (e: any) => {
      const parts: string[] = []
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript)
      const spoken = joinSpoken(parts)
      if (!spoken) return
      rec._heard = true
      onChange(baseRef.current ? `${baseRef.current} ${spoken}` : spoken)
    }
    rec.onerror = (e: any) => {
      if (e?.error === 'service-not-allowed' || e?.error === 'not-allowed') {
        refusedThisVisit = true
        setSupported(false)
      }
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      disabled={disabled && !listening}
      aria-label={listening ? 'Stop dictating' : 'Dictate'}
      aria-pressed={listening}
      title={listening ? 'Stop dictating' : 'Dictate'}
      className={`flex-none inline-flex items-center justify-center w-9 rounded-xl border transition-colors disabled:opacity-40 ${
        listening
          ? 'border-rose-200 bg-rose-50 text-rose-600 animate-pulse'
          : 'border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-300'
      } ${className}`}
    >
      {listening ? <Square size={14} /> : <Mic size={16} />}
    </button>
  )
}
