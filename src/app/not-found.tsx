import Link from 'next/link'
import { Trophy } from 'lucide-react'

// Real 404 page. Until Aug 2026 the org routes rendered a "not found" UI while
// still returning HTTP 200 — a soft 404. Google crawled the resulting unbounded
// slug space and logged ~266k "Crawled – currently not indexed" URLs against
// sunshineeventsgroup.com. Those routes now call notFound(), which renders this
// with a real 404 status. Keep it that way.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
      <div>
        <Trophy size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-sm">
          That page doesn&apos;t exist, or it moved. The link may be from an older version of the site.
        </p>
        <Link href="/" className="text-teal-700 hover:underline text-sm mt-3 inline-block">
          Back to home
        </Link>
      </div>
    </div>
  )
}
