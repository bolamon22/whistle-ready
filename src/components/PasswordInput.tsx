'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// A password field you can actually read back.
//
// Only the login screen had a reveal toggle; every other password box in the app
// — claim, register, reset, invite, join, profile, the admin password tools —
// was write-only. That is worst exactly where it matters most: the claim page
// asks a club director to retype a password they chose twenty minutes earlier,
// with no way to check it and a wrong-password error as the only feedback.
//
// One component so the behaviour, the icon and the keyboard handling stay the
// same everywhere, rather than being re-implemented per form.

type Props = {
  value: string
  onChange: (v: string) => void
  /** Classes for the input itself. Right padding for the button is added here. */
  className?: string
  /** The eye sits on top of the field, so it has to match the field's background. */
  tone?: 'light' | 'dark'
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
  name?: string
  id?: string
  disabled?: boolean
  autoFocus?: boolean
}

export default function PasswordInput({
  value, onChange, className = '', tone = 'light', placeholder, required,
  minLength, autoComplete = 'current-password', name, id, disabled, autoFocus,
}: Props) {
  const [show, setShow] = useState(false)
  const auto = useId()
  const inputId = id || auto
  const eye = tone === 'dark'
    ? 'text-slate-500 hover:text-slate-300 focus-visible:text-teal-400'
    : 'text-slate-400 hover:text-slate-700 focus-visible:text-teal-600'

  return (
    <div className="relative">
      <input
        id={inputId} name={name} value={value} onChange={e => onChange(e.target.value)}
        // Revealed text must never be a password-managed field mid-flight, so the
        // type flips rather than a CSS trick being used.
        type={show ? 'text' : 'password'}
        placeholder={placeholder} required={required} minLength={minLength}
        autoComplete={autoComplete} disabled={disabled} autoFocus={autoFocus}
        // pr-11 keeps the caret and any long value clear of the button.
        className={`${className} pr-11`}
      />
      <button
        type="button"
        // tabIndex -1 keeps Tab going straight from the field to the submit
        // button, the way someone typing a password expects; the toggle is still
        // reachable by click and by shift-tabbing back.
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        aria-controls={inputId}
        className={`absolute inset-y-0 right-0 px-3 flex items-center ${eye} focus:outline-none`}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  )
}
