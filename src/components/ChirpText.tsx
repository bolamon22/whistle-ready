'use client'
import { useRouter } from 'next/navigation'
import { mdToHtml } from '@/app/o/[slug]/_md'

// A Chirp reply, with its bold, lists and page links rendered. mdToHtml escapes
// the text first, so a reply cannot inject markup. Compact spacing for a chat
// bubble; white-space reset because the bubble keeps user line breaks.
//
// Links go straight to the page (Bo, Oct 3 2026: "rather than tell them how to
// do it, link them to where they need to go") without ending the chat: a link
// inside this site moves with the client router, so the chat, which lives in a
// layout or restores itself from session storage, stays open; a link to
// another site opens a new tab. A link on its own line shows as a button.
export default function ChirpText({ text, onNavigate }: { text: string; onNavigate?: (href: string) => void }) {
  const router = useRouter()
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (!href.startsWith('/') || href.startsWith('//')) return   // mailto:, tel:, other sites: browser default
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return // let "open in new tab" work
    e.preventDefault()
    onNavigate?.(href)
    router.push(href)
  }
  return (
    <div
      onClick={onClick}
      style={{ whiteSpace: 'normal' }}
      className="[&_p]:text-inherit [&_ol]:text-inherit [&_ul]:text-inherit [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ol]:mb-2 [&_ul]:mb-2 [&_ol:last-child]:mb-0 [&_ul:last-child]:mb-0 [&_ol]:pl-5 [&_ul]:pl-5 [&_li]:mb-0.5 [&_a:not(.rounded-full)]:text-teal-700 [&_a:not(.rounded-full)]:underline [&_a:not(.rounded-full)]:font-medium [&_a.rounded-full]:!text-white [&_a.rounded-full]:!px-4 [&_a.rounded-full]:!py-2 [&_a.rounded-full]:!mb-2 [&_a.rounded-full]:text-sm"
      dangerouslySetInnerHTML={{ __html: mdToHtml(text) }}
    />
  )
}
