'use client'

// The ready-written messages a club director sends their own people. ONE
// component so the public /share/[regId] page and the club director portal can
// never drift apart (Bo, Oct 4 2026: "I want to make sure it looks the same").
//
// Nothing is ever sent from here. The buttons open a draft in the director's own
// email, already filled in, and they add their families and send it themselves.

import { useState } from 'react'
import { composeUrls, messageHtml, type FamilyMessage } from '@/lib/familyMessages'

export default function FamilyMessages({ messages, highlight = '' }: { messages: FamilyMessage[]; highlight?: string }) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState('')

  const bodyOf = (m: FamilyMessage) => edits[m.key] ?? m.body

  // Copies BOTH flavours at once: rich text with a real button, and the plain
  // text underneath it. Gmail, Outlook on the web and Apple Mail all compose in
  // a rich-text editor, so they take the HTML and the families get a button
  // instead of a bare link. Anywhere that only understands plain text still
  // gets a perfectly good message. The Gmail/Outlook buttons below cannot do
  // this — a compose URL carries text only.
  async function copy(m: FamilyMessage) {
    const text = `${bodyOf(m)}`
    const html = messageHtml(bodyOf(m), m.linkLabel)
    const done = () => { setCopied(m.key); setTimeout(() => setCopied(''), 2000) }
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })])
        done()
        return
      }
    } catch { /* older browser, or the rich write was refused — plain below */ }
    try {
      await navigator.clipboard.writeText(text)
      done()
    } catch {
      // Blocked in some in-app browsers — still give them something selectable.
      window.prompt('Copy this message', text)
    }
  }

  return (
    <>
      {messages.map(m => {
        const urls = composeUrls(m.subject, bodyOf(m))
        return (
          <div key={m.key} id={m.key}
            className={`mb-5 bg-white rounded-2xl shadow-sm p-5 scroll-mt-6 border ${highlight === m.key ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
            <h2 className="text-lg font-bold text-slate-900">{m.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{m.blurb}</p>

            <div className="text-[11px] font-bold tracking-wide text-slate-400 mt-4 mb-1">SUBJECT</div>
            <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{m.subject}</div>

            <label htmlFor={`fm-${m.key}`} className="block text-[11px] font-bold tracking-wide text-slate-400 mt-3 mb-1">MESSAGE</label>
            <textarea id={`fm-${m.key}`} rows={12} value={bodyOf(m)}
              onChange={e => setEdits(x => ({ ...x, [m.key]: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500" />

            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={() => copy(m)}
                className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                {copied === m.key ? 'Copied' : 'Copy with link'}
              </button>
              <a href={urls.gmail} target="_blank" rel="noreferrer"
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Gmail</a>
              <a href={urls.outlook} target="_blank" rel="noreferrer"
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Outlook (web)</a>
              {/* mailto — on an iPhone or Mac this is Apple Mail, on a PC it is
                  usually Outlook. The one button that works everywhere. */}
              <a href={urls.mailto}
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">My mail app</a>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              <strong className="font-semibold text-slate-500">Copy with link</strong> pastes a tidy message where the words are the link, instead of a long web address —
              paste it straight into Gmail, Outlook or Apple Mail.
              The other three open a draft already filled in, but as plain text, which can only ever show the full address.
              <strong className="font-semibold text-slate-500"> My mail app</strong> is Apple Mail on an iPhone or Mac, Outlook on a PC, or whatever you have set as default.
              Nothing is sent until you send it.
            </p>
          </div>
        )
      })}
    </>
  )
}
