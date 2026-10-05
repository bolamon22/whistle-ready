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
  const [pasted, setPasted] = useState('')

  const bodyOf = (m: FamilyMessage) => edits[m.key] ?? m.body

  // Puts the message on the clipboard in BOTH flavours at once: rich text with
  // a real link on the words, and the plain text underneath it. Gmail, Outlook
  // on the web and Apple Mail all compose in a rich-text editor, so a paste
  // keeps the worded link. Returns false when the browser refused the rich
  // write, which is the only case where the plain text has to carry the day.
  async function copyRich(m: FamilyMessage): Promise<boolean> {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([messageHtml(bodyOf(m), m.linkLabel)], { type: 'text/html' }),
          'text/plain': new Blob([bodyOf(m)], { type: 'text/plain' }),
        })])
        return true
      }
    } catch { /* older browser, or the rich write was refused */ }
    return false
  }

  async function copy(m: FamilyMessage) {
    const done = () => { setCopied(m.key); setTimeout(() => setCopied(''), 2000) }
    if (await copyRich(m)) { done(); return }
    try {
      await navigator.clipboard.writeText(bodyOf(m))
      done()
    } catch {
      // Blocked in some in-app browsers — still give them something selectable.
      window.prompt('Copy this message', bodyOf(m))
    }
  }

  // Open a draft in their own email WITH the worded link, not a raw address.
  //
  // A compose deep link (?body=) carries plain text and nothing else, so the
  // body can never arrive as formatted text however it is encoded (Bo, Oct 5
  // 2026: "it still doesn't have the green text hyperlink in Gmail"). What CAN
  // cross is the clipboard. So: copy the rich version, open the draft with the
  // subject filled in and the body left empty, and tell them to paste. One
  // extra keystroke, and the families get the link on the words.
  //
  // If the rich write is refused we fall straight back to the old behaviour and
  // put the plain text in the URL, so the button never opens an empty draft
  // with nothing on the clipboard.
  //
  // The tab is opened BEFORE the await: a window.open() that happens after one
  // has lost its user gesture and pop-up blockers kill it.
  async function openIn(m: FamilyMessage, which: 'gmail' | 'outlook' | 'mailto') {
    const tab = which === 'mailto' ? null : window.open('', '_blank')
    const rich = await copyRich(m)
    const url = composeUrls(m.subject, rich ? '' : bodyOf(m))[which]
    if (rich) { setPasted(m.key); setTimeout(() => setPasted(''), 20000) }
    if (tab) tab.location.href = url
    else window.location.href = url
  }

  return (
    <>
      {messages.map(m => {
        const body = bodyOf(m)
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
              <button type="button" onClick={() => openIn(m, 'gmail')}
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Gmail</button>
              <button type="button" onClick={() => openIn(m, 'outlook')}
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">Outlook (web)</button>
              {/* mailto — on an iPhone or Mac this is Apple Mail, on a PC it is
                  usually Outlook. The one button that works everywhere. */}
              <button type="button" onClick={() => openIn(m, 'mailto')}
                className="border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl">My mail app</button>
            </div>
            {pasted === m.key && (
              <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm text-teal-900">
                <strong className="font-bold">Your message is copied.</strong> Click into the message box in the draft that just opened and press
                <strong className="font-bold"> Ctrl + V</strong> (<strong className="font-bold">&#8984; V</strong> on a Mac). It pastes in with the words as the link.
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2">
              All four buttons give your families the same message, with the words as the link instead of a long web address.
              <strong className="font-semibold text-slate-500"> Copy with link</strong> puts it on your clipboard to paste wherever you like.
              The other three open a draft in your own email with the subject filled in, copy the message at the same time, and ask you to paste it —
              an email draft opened from a web link can only be handed plain text, so pasting is what keeps the link on the words.
              <strong className="font-semibold text-slate-500"> My mail app</strong> is Apple Mail on an iPhone or Mac, Outlook on a PC, or whatever you have set as default.
              Nothing is sent until you send it.
            </p>
          </div>
        )
      })}
    </>
  )
}
