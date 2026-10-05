'use client'

// The ready-written messages a club director sends their own people. ONE
// component so the public /share/[regId] page and the club director portal can
// never drift apart (Bo, Oct 4 2026: "I want to make sure it looks the same").
//
// Nothing is ever sent from here. The buttons open a draft in the director's own
// email, already filled in, and they add their families and send it themselves.
//
// What you see is what they get: the card shows the message the way it lands in
// an inbox, with the words as the link. A raw booking URL is 290 characters of
// noise and reads like something broke (Bo, Oct 5 2026: "what happen to the text
// link for these pages?"). The editable plain text is one click away behind
// Edit wording, and that is also where the bare URL lives, because a compose
// deep link can carry nothing but plain text.

import { useState } from 'react'
import { composeUrls, messageBlocks, messageHtml, type FamilyMessage } from '@/lib/familyMessages'

export default function FamilyMessages({ messages, highlight = '' }: { messages: FamilyMessage[]; highlight?: string }) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState('')

  const bodyOf = (m: FamilyMessage) => edits[m.key] ?? m.body

  // Copies BOTH flavours at once: rich text with a real link on the words, and
  // the plain text underneath it. Gmail, Outlook on the web and Apple Mail all
  // compose in a rich-text editor, so they take the HTML and the families get
  // the worded link instead of a bare address. Anywhere that only understands
  // plain text still gets a perfectly good message. The Gmail/Outlook buttons
  // below cannot do this — a compose URL carries text only.
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
        const body = bodyOf(m)
        const urls = composeUrls(m.subject, body)
        const isEditing = !!editing[m.key]
        return (
          <div key={m.key} id={m.key}
            className={`mb-5 bg-white rounded-2xl shadow-sm p-5 scroll-mt-6 border ${highlight === m.key ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
            <h2 className="text-lg font-bold text-slate-900">{m.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{m.blurb}</p>

            <div className="text-[11px] font-bold tracking-wide text-slate-400 mt-4 mb-1">SUBJECT</div>
            <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{m.subject}</div>

            <div className="flex items-center justify-between mt-3 mb-1">
              <label htmlFor={`fm-${m.key}`} className="text-[11px] font-bold tracking-wide text-slate-400">
                {isEditing ? 'MESSAGE — EDITING' : 'MESSAGE'}
              </label>
              <button type="button" onClick={() => setEditing(x => ({ ...x, [m.key]: !isEditing }))}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2">
                {isEditing ? 'Done' : 'Edit wording'}
              </button>
            </div>

            {isEditing ? (
              <>
                <textarea id={`fm-${m.key}`} rows={14} value={body}
                  onChange={e => setEdits(x => ({ ...x, [m.key]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <p className="text-xs text-slate-400 mt-1.5">
                  The long web address stays as it is — that is what becomes the <strong className="font-semibold text-slate-500">{m.linkLabel}</strong> link
                  when you copy. Keep it on a line of its own.
                </p>
              </>
            ) : (
              <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
                {messageBlocks(body).map((b, n) => b.kind === 'link' ? (
                  <p key={n} className="mb-3 last:mb-0">
                    <a href={b.url} target="_blank" rel="noreferrer"
                      className="text-teal-700 font-bold underline underline-offset-2 hover:text-teal-900 break-words">{m.linkLabel}</a>
                  </p>
                ) : (
                  <p key={n} className="text-sm text-slate-800 leading-relaxed mb-3 last:mb-0 whitespace-pre-line">{b.text}</p>
                ))}
              </div>
            )}

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
              <strong className="font-semibold text-slate-500">Copy with link</strong> is the one to use — paste it into Gmail, Outlook or Apple Mail and it
              arrives exactly as shown above, with the words as the link.
              The other three open a draft already filled in, but email drafts opened from a web link can only hold plain text, so your families see the full web address instead.
              <strong className="font-semibold text-slate-500"> My mail app</strong> is Apple Mail on an iPhone or Mac, Outlook on a PC, or whatever you have set as default.
              Nothing is sent until you send it.
            </p>
          </div>
        )
      })}
    </>
  )
}
