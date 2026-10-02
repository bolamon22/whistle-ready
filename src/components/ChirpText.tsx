'use client'
import { mdToHtml } from '@/app/o/[slug]/_md'

// A Chirp reply, with its bold, lists and page links rendered. mdToHtml escapes
// the text first, so a reply cannot inject markup. Compact spacing for a chat
// bubble; white-space reset because the bubble keeps user line breaks.
export default function ChirpText({ text }: { text: string }) {
  return (
    <div
      style={{ whiteSpace: 'normal' }}
      className="[&_p]:text-inherit [&_ol]:text-inherit [&_ul]:text-inherit [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ol]:mb-2 [&_ul]:mb-2 [&_ol:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol]:pl-5 [&_ul]:pl-5 [&_li]:mb-0.5 [&_a]:text-teal-700 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: mdToHtml(text) }}
    />
  )
}
