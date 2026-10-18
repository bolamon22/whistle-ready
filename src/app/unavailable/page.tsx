import type { Metadata } from 'next'

// What an archived organization's public site and event pages show (lib/orgArchive,
// middleware).
export const metadata: Metadata = { title: 'Not available', robots: { index: false, follow: false } }

export default function Unavailable() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">This page isn’t available</h1>
        <p className="mt-2 text-slate-500">The organization that ran it isn’t on Whistle Ready right now.</p>
        <a href="https://whistleready.app" className="btn-primary mt-6 inline-flex">Go to Whistle Ready</a>
      </div>
    </div>
  )
}
