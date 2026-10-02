'use client'
import { useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import DictateButton from '@/components/DictateButton'

// The question box every Chirp shares. It grows with the question (up to about
// six lines, then scrolls) so a long or dictated question stays readable before
// it is sent. Enter sends; Shift+Enter starts a new line.
type Props = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
}

export default function ChirpInput({ value, onChange, onSend, disabled, placeholder = 'Ask a question…', autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 100) }, [autoFocus])

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none text-sm leading-5 border border-slate-200 rounded-xl px-3 py-2 max-h-40 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <DictateButton value={value} onChange={onChange} disabled={disabled} className="h-[38px]" />
      <button type="button" onClick={onSend} disabled={disabled || !value.trim()} aria-label="Send"
        className="flex-none h-[38px] bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white px-3 rounded-xl transition-colors inline-flex items-center">
        <Send size={15} />
      </button>
    </div>
  )
}
